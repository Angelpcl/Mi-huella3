// screens/CommunityScreen.js
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StatusBar,
  Modal, // <--- Importado
  TextInput, // <--- Importado
  KeyboardAvoidingView, // <--- Importado
  Platform, // <--- Importado
} from "react-native";
import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { COLORS } from "../theme";
import { CameraView, useCameraPermissions } from "expo-camera";
import { db, auth } from "../firebase-config";
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  where,
  updateDoc,
  addDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { sendPushNotification } from "../notificationService"; // <--- Importado

const INITIAL_REGION = {
  latitude: 19.4326,
  longitude: -99.1332,
};

export default function CommunityScreen() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const [communityMarkers, setCommunityMarkers] = useState([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);

  // --- 🔥 1. NUEVOS ESTADOS ---
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [scannedPetData, setScannedPetData] = useState(null); // Guarda datos del escaneo
  const [message, setMessage] = useState(""); // Mensaje del rescatista
  const [isProcessing, setIsProcessing] = useState(false); // Loading para el botón de envío

  // ... (useEffect de leer reportes y permisos de ubicación no cambian) ...
  useEffect(() => {
    const q = query(
      collection(db, "lost_pet_reports"),
      where("status", "==", "active")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const markers = snapshot.docs.map((doc) => ({
        id: doc.id,
        lat: doc.data().location.latitude,
        lng: doc.data().location.longitude,
        title: `¡Perdido! - ${doc.data().petName}`,
        description: `Tipo: ${doc.data().petType}. Reportado el ${
          doc.data().createdAt?.toDate()?.toLocaleDateString() || "N/A"
        }`,
      }));
      setCommunityMarkers(markers);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Activa la ubicación para usar el mapa.");
          setLocation(INITIAL_REGION);
          setLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);
      } catch (error) {
        console.warn("Ubicación no disponible:", error);
        setLocation(INITIAL_REGION);
      } finally {
        setLoading(false);
      }
    })();
  }, []);


  const recenterMap = () => {
    if (mapRef.current) {
      mapRef.current.reload();
    }
  };

  // --- 🔥 2. `handleBarCodeScanned` (SIMPLIFICADO) ---
  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned) return; // Evitar doble escaneo
    setScanned(true);
    setScannerVisible(false);

    const rescuerUser = auth.currentUser;
    if (!rescuerUser) {
      Alert.alert("Error", "Debes iniciar sesión para reportar un hallazgo.");
      setScanned(false);
      return;
    }

    try {
      const qrData = JSON.parse(data);
      if (!qrData.ownerId || !qrData.name) throw new Error("QR no válido.");

      if (rescuerUser.uid === qrData.ownerId) {
        Alert.alert("¡Es tu mascota!", "No puedes escanear tu propio QR de rescate.");
        setScanned(false);
        return;
      }

      // --- OBTENER DATOS DEL DUEÑO Y RESCATISTA ---
      const rescuerDoc = await getDoc(doc(db, "users", rescuerUser.uid));
      const ownerDoc = await getDoc(doc(db, "users", qrData.ownerId));
      if (!ownerDoc.exists()) throw new Error("Dueño no encontrado.");

      const ownerData = ownerDoc.data();
      const rescuerData = rescuerDoc.data();

      // Guardar datos para el modal
      setScannedPetData({
        petId: qrData.petId,
        petName: qrData.name,
        ownerId: qrData.ownerId,
        ownerName: ownerData.name || "Dueño",
        ownerPhone: ownerData.phone || "No disponible",
        ownerPushToken: ownerData.expoPushToken,
        rescuerName: rescuerData.name || "Un buen samaritano",
        rescuerPhone: rescuerData.phone || "No proporcionado",
      });

      // Abrir el modal de mensaje
      setMessageModalVisible(true);

    } catch (e) {
      console.error("Error al escanear QR:", e);
      Alert.alert("Error", "Este QR no es válido.");
      setScanned(false);
    }
  };

  // --- 🔥 3. NUEVA FUNCIÓN PARA ENVIAR EL MENSAJE ---
  const handleSendMessage = async () => {
    if (!scannedPetData || isProcessing) return;

    setIsProcessing(true);

    try {
      const {
        petId,
        petName,
        ownerId,
        ownerPushToken,
        rescuerName,
        rescuerPhone,
      } = scannedPetData;

      // 1. Obtener ubicación actual del rescate
      const rescuerLocation = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = rescuerLocation.coords;
      const locationString = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`;

      // 2. Construir el mensaje
      const title = `✅ ¡${petName} ha sido localizada!`;
      let body = `${rescuerName} escaneó el QR de tu mascota en: ${locationString}.\nTeléfono del rescatista: ${rescuerPhone}.`;

      // Añadir mensaje personalizado si existe
      if (message.trim().length > 0) {
        body += `\n\nMensaje: "${message.trim()}"`;
      }

      // 3. Enviar Notificación al DUEÑO
      await sendPushNotification(ownerPushToken, title, body, ownerId);

      // 4. Actualizar la base de datos
      const reportsRef = collection(db, "lost_pet_reports");
      const q = query(reportsRef, where("petId", "==", petId), where("status", "==", "active"));
      const reportSnap = await getDocs(q);

      if (!reportSnap.empty) {
        const reportId = reportSnap.docs[0].id;
        await updateDoc(doc(db, "lost_pet_reports", reportId), {
          status: "found",
          foundBy: rescuerName,
          foundByPhone: rescuerPhone,
          foundAt: { latitude, longitude },
          foundAtTime: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, "pets", petId), {
        status: "safe",
        location: { latitude, longitude },
      });

      // 5. Informar al rescatista y cerrar
      Alert.alert(
        "¡Notificación Enviada!",
        `Gracias por ayudar. El dueño de ${petName} ha sido notificado.`,
        [{ text: "¡Genial!" }]
      );
      
      closeMessageModal();

    } catch (e) {
      console.error("Error al enviar mensaje:", e);
      Alert.alert("Error", "No se pudo enviar la notificación.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Función para abrir el escáner
  const openScanner = async () => {
    if (!permission) return;
    if (!permission.granted) {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        Alert.alert("Error", "Se necesita permiso de la cámara para escanear.");
        return;
      }
    }
    setScanned(false);
    setMessage(""); // Limpiar mensaje anterior
    setScannedPetData(null); // Limpiar datos anteriores
    setScannerVisible(true);
  };
  
  // Función para cerrar y limpiar el modal de mensaje
  const closeMessageModal = () => {
    setMessageModalVisible(false);
    setMessage("");
    setScannedPetData(null);
    setScanned(false);
  }

  // ... (Validación de ubicación y loader no cambian) ...
  const locationValid =
    location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude));

  if (loading || !locationValid) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.turquoise || "#00C2C7"} />
      </View>
    );
  }

  const safeLat = Number(location.latitude) || INITIAL_REGION.latitude;
  const safeLng = Number(location.longitude) || INITIAL_REGION.longitude;


  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* WebView (sin cambios) */}
      <WebView
        ref={mapRef}
        style={{ flex: 1 }}
        originWhitelist={["*"]}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        source={{
          html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
            <style>
              html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
              .leaflet-popup-content-wrapper { border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
              .leaflet-popup-content { margin: 13px 20px 13px 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
              .popup-title { font-weight: bold; font-size: 1.1em; margin-bottom: 5px; color: #CC0000; }
              .popup-description { font-size: 0.95em; color: #333; }
            </style>
          </head>
          <body>
            <div id="map"></div>
            <script>
              const map = L.map('map');
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

              const userIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
              });
              L.marker([${safeLat}, ${safeLng}], { icon: userIcon }).addTo(map).bindPopup("📍 Tu ubicación actual");

              const communityIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
              });

              const communityGroup = L.featureGroup();
              const markerData = ${JSON.stringify(communityMarkers)};
              
              markerData.forEach(m => {
                const popupContent = \`
                  <div class="popup-title">\${m.title || 'Reporte'}</div>
                  <div class="popup-description">\${m.description || ''}</div>
                \`;
                const marker = L.marker([m.lat, m.lng], { icon: communityIcon }).addTo(map).bindPopup(popupContent);
                communityGroup.addLayer(marker);
              });

              if (communityGroup.getLayers().length > 0) {
                map.fitBounds(communityGroup.getBounds().pad(0.2)); 
              } else {
                map.setView([${safeLat}, ${safeLng}], 14); 
              }
            </script>
          </body>
          </html>
        `,
        }}
        key={communityMarkers.length} 
      />

      {/* Botones Flotantes (sin cambios) */}
      <TouchableOpacity
        style={styles.helpButton}
        onPress={openScanner}
      >
        <MaterialIcons name="qr-code-scanner" size={24} color="#fff" />
        <Text style={styles.helpButtonText}>Escanear QR</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
        <MaterialIcons name="refresh" size={24} color="#333" />
      </TouchableOpacity>

      {/* Modal del Escáner (sin cambios) */}
      <Modal visible={scannerVisible} animationType="slide">
        <View style={styles.scannerContainer}>
          <CameraView
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barCodeTypes: ["qr"],
            }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerText}>Escanea el QR de la mascota</Text>
            <View style={styles.scannerBox} />
            <TouchableOpacity
              style={styles.scannerCancel}
              onPress={() => setScannerVisible(false)}
            >
              <Text style={styles.scannerCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- 🔥 4. NUEVO MODAL PARA ENVIAR MENSAJE --- */}
      <Modal
        visible={messageModalVisible}
        animationType="fade"
        transparent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¡Mascota Encontrada!</Text>
            <Text style={styles.modalText}>
              Has encontrado a <Text style={{fontWeight: 'bold'}}>{scannedPetData?.petName}</Text>.
            </Text>
            <Text style={styles.modalText}>
              Teléfono del dueño: <Text style={{fontWeight: 'bold'}}>{scannedPetData?.ownerPhone || 'No disponible'}</Text>
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="Escribe un mensaje (opcional)..."
              placeholderTextColor="#777"
              value={message}
              onChangeText={setMessage}
              multiline
            />
            
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSendMessage}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Enviar Notificación al Dueño</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={closeMessageModal}
            >
              <Text style={styles.saveText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

// --- 🔥 5. ESTILOS ACTUALIZADOS ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBg || "#F8FCFD" },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.lightBg || "#F8FCFD",
  },
  // (Botones flotantes sin cambios)
  recenterButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 30,
    padding: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  helpButton: {
    position: "absolute",
    bottom: 150,
    right: 20,
    backgroundColor: COLORS.turquoise || "#00C2C7",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 30,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  helpButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 8,
  },
  // (Escáner sin cambios)
  scannerContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    position: 'absolute',
    top: 100,
  },
  scannerBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 10,
  },
  scannerCancel: {
    position: 'absolute',
    bottom: 60,
    backgroundColor: 'rgba(255, 92, 92, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  scannerCancelText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },

  // --- NUEVOS ESTILOS PARA MODAL DE MENSAJE ---
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: COLORS.turquoise || "#00C2C7",
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    color: "#333",
    marginBottom: 10,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    marginTop: 10,
    color: "#000",
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: COLORS.turquoise || "#00C2C7",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  cancelButton: {
    backgroundColor: "#FF5C5C",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  saveText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});