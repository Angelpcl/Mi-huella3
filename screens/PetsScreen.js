// screens/PetsScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { auth, db } from "../firebase-config";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  setDoc,
} from "firebase/firestore";
import * as Location from "expo-location";
import * as Animatable from "react-native-animatable";
import * as Notifications from "expo-notifications";
import QRCode from "react-native-qrcode-svg";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function PetsScreen() {
  const [pets, setPets] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newPet, setNewPet] = useState({
    name: "",
    age: "",
    breed: "",
    color: "",
    type: "",
    weight: "",
    vaccines: "",
  });
  const [saving, setSaving] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, "pets"),
      where("userId", "==", auth.currentUser.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const petsData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPets(petsData);
    });
    return () => unsubscribe();
  }, []);

  const getCurrentCoords = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso denegado", "Activa la ubicación para continuar.");
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({});
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch (e) {
      console.warn("⚠️ No se pudo obtener ubicación:", e);
      return null;
    }
  };

  const addPet = async () => {
    if (!newPet.name || !newPet.type) {
      Alert.alert("Error", "Por favor completa el nombre y el tipo.");
      return;
    }

    try {
      setSaving(true);
      const user = auth.currentUser;
      const coords = await getCurrentCoords();

      const docRef = await addDoc(collection(db, "pets"), {
        ...newPet,
        userId: user.uid,
        chip: "QR Simulado", // Cambiado
        createdAt: new Date().toISOString(),
        location: coords || null,
        status: "safe", // Estado inicial: a salvo
      });

      await createAndSaveNotification(
        `Nueva mascota agregada`,
        `Has registrado a ${newPet.name}.`
      );

      setNewPet({ name: "", age: "", breed: "", color: "", type: "", weight: "", vaccines: "" });
      setModalVisible(false);
      Alert.alert("Éxito", "Mascota guardada correctamente.");
    } catch (e) {
      console.error("Error al guardar mascota:", e);
      Alert.alert("Error", "No se pudo guardar la mascota.");
    } finally {
      setSaving(false);
    }
  };

  const handleReportLost = async (pet) => {
    Alert.alert(
      "Reportar Mascota Perdida",
      `¿Deseas reportar a ${pet.name} como perdida? Esto creará una alerta en el mapa de la comunidad.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, Reportar",
          style: "destructive",
          onPress: async () => {
            const coords = await getCurrentCoords();
            if (!coords) {
              Alert.alert("Error", "No se pudo obtener tu ubicación actual para el reporte.");
              return;
            }

            try {
              const reportsRef = collection(db, "lost_pet_reports");
              const q = query(reportsRef, where("petId", "==", pet.id), where("status", "==", "active"));
              const existingReport = await getDocs(q);

              if (!existingReport.empty) {
                Alert.alert("Reporte existente", `${pet.name} ya tiene un reporte activo.`);
                return;
              }

              await addDoc(reportsRef, {
                petId: pet.id,
                userId: pet.userId,
                petName: pet.name,
                petType: pet.type,
                location: coords, 
                status: "active", 
                createdAt: serverTimestamp(),
              });

              await updateDoc(doc(db, "pets", pet.id), { status: "lost" });

              await createAndSaveNotification(
                "🆘 Reporte Creado",
                `Tu reporte de ${pet.name} está activo. ¡Esperamos que la encuentres pronto!`
              );
              
              Alert.alert("Reporte Creado", "Tu mascota ahora es visible en el mapa de la comunidad.");

            } catch (e) {
              console.error("Error al crear reporte:", e);
              Alert.alert("Error", "No se pudo crear el reporte.");
            }
          },
        },
      ]
    );
  };

  const deletePet = async (petId, petName) => {
    Alert.alert(
      "Eliminar mascota",
      `¿Seguro que quieres eliminar a ${petName}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "pets", petId));
              await createAndSaveNotification(
                `Mascota eliminada`,
                `${petName} ha sido eliminada de tu lista.`
              );
              Alert.alert("Eliminada", `${petName} fue eliminada correctamente.`);
            } catch (e) {
              console.error("Error al eliminar mascota:", e);
              Alert.alert("Error", "No se pudo eliminar la mascota.");
            }
          },
        },
      ]
    );
  };

  async function createAndSaveNotification(title, body) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });

      const user = auth.currentUser;
      if (!user) return;
      await addDoc(collection(db, "notifications"), {
        userId: user.uid,
        title,
        body,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("Error al crear notificación:", e);
    }
  }

  // --- 🔥 AQUÍ ESTÁ EL CÓDIGO ACTUALIZADO 🔥 ---
  // 🐾 Íconos según tipo
  const getPetIcon = (type = "") => {
    const key = type.trim().toLowerCase();
    const icons = {
      perro: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
      gato: "https://cdn-icons-png.flaticon.com/512/616/616430.png",
      ave: "https://cdn-icons-png.flaticon.com/512/6031/6031612.png",
      pez: "https://cdn-icons-png.flaticon.com/512/2241/2241046.png",
      conejo: "https://cdn-icons-png.flaticon.com/512/3831/3831225.png",
      tortuga: "https://cdn-icons-png.flaticon.com/512/1623/1623835.png",
      hamster: "https://cdn-icons-png.flaticon.com/512/1405/1405497.png",
      cobaya: "https://cdn-icons-png.flaticon.com/512/7699/7699663.png",
      chinchilla: "https://cdn-icons-png.flaticon.com/512/2808/2808845.png",
      raton: "https://cdn-icons-png.flaticon.com/512/4734/47342.png",
      serpiente: "https://cdn-icons-png.flaticon.com/512/5375/5375880.png",
      iguana: "https://cdn-icons-png.flaticon.com/512/3060/3060599.png",
      axolote: "https://cdn-icons-png.flaticon.com/512/9599/9599605.png",
      loro: "https://cdn-icons-png.flaticon.com/512/2808/2808884.png",
      default: "https://cdn-icons-png.flaticon.com/512/616/616554.png",
    };
    return icons[key] || icons.default;
  };

  const handleShowQr = (pet) => {
    setSelectedPet(pet);
    setQrModalVisible(true);
  };

  const getQrValue = () => {
    if (!selectedPet) return "Error";
    return JSON.stringify({
      petId: selectedPet.id,
      ownerId: selectedPet.userId,
      name: selectedPet.name,
    });
  };

  return (
    <View style={styles.container}>
      <Animatable.Text
        animation="bounceInDown"
        duration={800}
        style={styles.title}
      >
        🐾 Mis Mascotas
      </Animatable.Text>

      <Animatable.View
        animation="fadeInUp"
        delay={120}
        style={[styles.whiteSection, { flex: 1 }]}
      >
        {pets.length === 0 ? (
          <Animatable.Text animation="fadeIn" style={styles.emptyText}>
            No tienes mascotas registradas aún 🐾
          </Animatable.Text>
        ) : (
          <FlatList
            data={pets}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animatable.View
                animation="zoomIn"
                delay={index * 80}
                style={[
                  styles.petCard,
                  item.status === 'lost' && { backgroundColor: '#FFF0F0' } 
                ]}
              >
                <Image
                  source={{ uri: getPetIcon(item.type) }}
                  style={styles.petImage}
                />
                <View style={styles.petInfo}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={styles.petName}>{item.name}</Text>
                    {item.status === 'lost' && (
                       <Text style={styles.lostTag}>PERDIDA</Text>
                    )}
                  </View>
                  <Text>🐾 Tipo: {item.type}</Text>
                  <Text>🎂 Edad: {item.age || "N/A"} años</Text>
                  <Text>🧬 Raza: {item.breed || "N/A"}</Text>

                  <View style={styles.buttonRow}>
                    {item.status !== 'lost' && (
                      <TouchableOpacity
                        style={styles.reportButton} 
                        onPress={() => handleReportLost(item)}
                      >
                        <Text style={styles.buttonText}>🆘 Reportar Perdida</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.qrButton}
                      onPress={() => handleShowQr(item)}
                    >
                      <Text style={styles.buttonText}>📱 Ver QR</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deletePet(item.id, item.name)}
                    >
                      <Text style={styles.buttonText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Animatable.View>
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animatable.View>

      <Animatable.View
        animation="pulse"
        iterationCount="infinite"
        duration={2200}
        style={styles.addButtonContainer}
      >
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addText}>+ Añadir Mascota</Text>
        </TouchableOpacity>
      </Animatable.View>

      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <Animatable.View
            animation="zoomInUp"
            duration={600}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Nueva Mascota</Text>
            <ScrollView>
              <TextInput placeholder="Nombre" placeholderTextColor="#555" style={styles.input} value={newPet.name} onChangeText={(t) => setNewPet({ ...newPet, name: t })} />
              <TextInput placeholder="Tipo (Perro, Gato, Ave...)" placeholderTextColor="#555" style={styles.input} value={newPet.type} onChangeText={(t) => setNewPet({ ...newPet, type: t })} />
              <TextInput placeholder="Edad" placeholderTextColor="#555" style={styles.input} value={newPet.age} onChangeText={(t) => setNewPet({ ...newMascota, age: t })} />
              <TextInput placeholder="Raza" placeholderTextColor="#555" style={styles.input} value={newPet.breed} onChangeText={(t) => setNewPet({ ...newPet, breed: t })} />
              <TextInput placeholder="Color" placeholderTextColor="#555" style={styles.input} value={newPet.color} onChangeText={(t) => setNewPet({ ...newPet, color: t })} />
              <TextInput placeholder="Peso (kg)" placeholderTextColor="#555" style={styles.input} value={newPet.weight} onChangeText={(t) => setNewPet({ ...newPet, weight: t })} />
              <TextInput placeholder="Vacunas (opcional)" placeholderTextColor="#555" style={styles.input} value={newPet.vaccines} onChangeText={(t) => setNewPet({ ...newPet, vaccines: t })} />
              <TouchableOpacity style={styles.saveButton} onPress={addPet} disabled={saving}>
                <Text style={styles.saveText}>{saving ? "Guardando..." : "Guardar"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.saveText}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animatable.View>
        </View>
      </Modal>

      <Modal visible={qrModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <Animatable.View
            animation="zoomIn"
            duration={400}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>
              Placa QR de: {selectedPet?.name}
            </Text>
            <Text style={styles.qrSubtitle}>
              Simulación de chip de rastreo.
            </Text>
            <View style={styles.qrContainer}>
              {selectedPet && (
                <QRCode
                  value={getQrValue()}
                  size={220}
                  backgroundColor="white"
                  color="black"
                />
              )}
            </View>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={styles.saveText}>Cerrar</Text>
            </TouchableOpacity>
          </Animatable.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: "#E8FFFF" },
  title: { fontSize: 28, fontWeight: "800", color: "#00C2C7", textAlign: "center", marginBottom: 12 },
  whiteSection: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 16, padding: 12, elevation: 3 },
  petCard: { flexDirection: "row", padding: 12, borderRadius: 12, marginVertical: 8, elevation: 1, backgroundColor: "rgba(255,255,255,0.95)" },
  petImage: { width: 65, height: 65, marginRight: 12, borderRadius: 40 },
  petInfo: { flex: 1 },
  petName: { fontSize: 18, fontWeight: "700", color: "#007B7B", marginBottom: 4 },
  lostTag: {
    backgroundColor: '#FF5C5C',
    color: 'white',
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 10,
    marginLeft: 8,
  },
  emptyText: { textAlign: "center", color: "#777", fontSize: 15, paddingVertical: 20 },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    flexWrap: 'wrap',
  },
  reportButton: {
    backgroundColor: "#FF5C5C",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  qrButton: {
    backgroundColor: "#00999E",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  deleteButton: {
    backgroundColor: "#AAAAAA",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  addButtonContainer: { alignItems: "center", position: "absolute", bottom: 20, left: 0, right: 0 },
  addButton: { backgroundColor: "#00C2C7", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 30, elevation: 6 },
  addText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  modalContent: { width: "88%", backgroundColor: "#fff", padding: 18, borderRadius: 14, elevation: 6 },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 12, textAlign: "center", color: "#00C2C7" },
  input: { borderWidth: 1, borderColor: "#E6E6E6", borderRadius: 10, padding: 12, marginBottom: 10, color: "#000" },
  saveButton: { backgroundColor: "#00C2C7", padding: 12, borderRadius: 10, alignItems: "center", marginBottom: 8 },
  cancelButton: { backgroundColor: "#FF5C5C", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 10 },
  saveText: { color: "#fff", fontWeight: "800" },
  qrSubtitle: {
    textAlign: "center",
    color: "#555",
    marginBottom: 20,
    marginTop: -8,
  },
  qrContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    alignSelf: 'center',
  },
});