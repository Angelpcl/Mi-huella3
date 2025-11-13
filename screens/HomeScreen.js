import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform,
  StatusBar,
} from "react-native";
import * as Location from "expo-location";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { MaterialIcons } from "@expo/vector-icons";
import { db, auth } from "../firebase-config";
import { WebView } from "react-native-webview";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

const MIN_DISTANCE_METERS = 500;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vets, setVets] = useState([]);
  const [pets, setPets] = useState([]);
  const [notifiedPets, setNotifiedPets] = useState({});
  const mapRef = useRef(null);
  const user = auth.currentUser;

  // === Permisos y ubicación inicial ===
  useEffect(() => {
    (async () => {
      try {
        await registerForPushNotificationsAsync();

        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Activa la ubicación para usar el mapa.");
          setLocation({ latitude: 23.6345, longitude: -102.5528 });
          setLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        setLocation(loc.coords);
      } catch (error) {
        console.warn("Ubicación no disponible:", error);
        setLocation({ latitude: 23.6345, longitude: -102.5528 }); // fallback México
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // === Escucha mascotas y genera notificaciones ===
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "pets"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const newPets = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (pets.length > 0) {
        for (const pet of newPets) {
          const prev = pets.find((p) => p.id === pet.id);
          if (!prev) {
            await createAndSaveNotification(
              `Nueva mascota agregada: ${pet.name || "Sin nombre"}`,
              `Tu mascota se registró correctamente.`
            );
          } else {
            const prevLoc = extractLocation(prev);
            const newLoc = extractLocation(pet);
            if (prevLoc && newLoc) {
              const dist = getDistanceFromLatLonInMeters(
                prevLoc.lat || prevLoc.latitude,
                prevLoc.lng || prevLoc.longitude,
                newLoc.lat || newLoc.latitude,
                newLoc.lng || newLoc.longitude
              );

              if (dist > MIN_DISTANCE_METERS && !notifiedPets[pet.id]) {
                await createAndSaveNotification(
                  `Movimiento detectado: ${pet.name || "tu mascota"}`,
                  `Se movió aproximadamente ${Math.round(dist)} metros.`
                );
                setNotifiedPets((prev) => ({ ...prev, [pet.id]: true }));
              }
            }
          }
        }
      }
      setPets(newPets);
    });

    return () => unsubscribe();
  }, [user, pets, notifiedPets]);

  // === Buscar veterinarias ===
  useEffect(() => {
    if (!location) return;
    (async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=veterinaria&addressdetails=1&limit=10&countrycodes=mx&viewbox=${
          location.longitude - 0.05
        },${location.latitude + 0.05},${location.longitude + 0.05},${
          location.latitude - 0.05
        }&bounded=1`;
        const res = await fetch(url);
        const data = await res.json();
        setVets(data || []);
      } catch (e) {
        console.warn("Error fetching vets:", e);
      }
    })();
  }, [location]);

  const recenterMap = () => {
    if (mapRef.current) {
      mapRef.current.reload();
    }
  };

  const locationValid =
    location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude));

  if (loading || !locationValid) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#00C2C7" />
      </View>
    );
  }

  const safeLat = Number(location.latitude) || 23.6345;
  const safeLng = Number(location.longitude) || -102.5528;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
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
              #searchBox {
                position: absolute; top: 15px; left: 50%; transform: translateX(-50%);
                width: 90%; max-width: 400px;
                background: white; border-radius: 10px; padding: 10px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2); z-index: 1000;
                font-size: 16px; outline: none;
              }
              #suggestions {
                position: absolute; top: 60px; left: 50%; transform: translateX(-50%);
                width: 90%; max-width: 400px; background: white; border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.15); z-index: 1001;
                max-height: 200px; overflow-y: auto; display: none;
              }
              .suggestion { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; }
              .suggestion:hover { background: #f0f0f0; }
            </style>
          </head>
          <body>
            <input id="searchBox" type="text" placeholder="🔍 Buscar clínica veterinaria..." />
            <div id="suggestions"></div>
            <div id="map"></div>

            <script>
              const map = L.map('map').setView([${safeLat}, ${safeLng}], 13);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
              }).addTo(map);

              const userIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
              });

              const vetIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
              });

              const petIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
              });

              const userMarker = L.marker([${safeLat}, ${safeLng}], { icon: userIcon })
                .addTo(map)
                .bindPopup("📍 Tu ubicación actual");

              let routeLine = null;

              function drawRoute(destLat, destLon) {
                if (routeLine) map.removeLayer(routeLine);
                fetch(\`https://router.project-osrm.org/route/v1/driving/${safeLng},${safeLat};\${destLon},\${destLat}?overview=full&geometries=geojson\`)
                  .then(res => res.json())
                  .then(data => {
                    if (data.routes && data.routes.length > 0) {
                      const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                      routeLine = L.polyline(coords, { color: '#00C2C7', weight: 5 }).addTo(map);
                      map.fitBounds(routeLine.getBounds());
                    }
                  });
              }

              const vets = ${JSON.stringify(vets)};
              vets.forEach(v => {
                if (v.lat && v.lon) {
                  const marker = L.marker([v.lat, v.lon], { icon: vetIcon })
                    .addTo(map)
                    .bindPopup((v.display_name || '').split(',')[0]);
                  marker.on('click', () => drawRoute(v.lat, v.lon));
                }
              });

              const pets = ${JSON.stringify(pets)};
              pets.forEach(p => {
                const loc = p.location || {};
                const lat = loc.lat || loc.latitude;
                const lon = loc.lng || loc.longitude;
                if (lat && lon) {
                  L.marker([lat, lon], { icon: petIcon })
                    .addTo(map)
                    .bindPopup(p.name || "Mascota registrada");
                }
              });

              // === BUSCADOR ===
              const searchBox = document.getElementById('searchBox');
              const suggestionsDiv = document.getElementById('suggestions');
              searchBox.addEventListener('input', async (e) => {
                const text = e.target.value.trim();
                if (text.length < 3) {
                  suggestionsDiv.style.display = 'none';
                  return;
                }
                const url = \`https://nominatim.openstreetmap.org/search?format=json&q=veterinaria+\${encodeURIComponent(text)}&addressdetails=1&countrycodes=mx&limit=5\`;
                const res = await fetch(url);
                const data = await res.json();
                suggestionsDiv.innerHTML = '';
                if (data.length > 0) {
                  data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'suggestion';
                    div.innerText = item.display_name;
                    div.onclick = () => {
                      map.setView([item.lat, item.lon], 15);
                      drawRoute(item.lat, item.lon);
                      L.marker([item.lat, item.lon], { icon: vetIcon })
                        .addTo(map)
                        .bindPopup(item.display_name)
                        .openPopup();
                      suggestionsDiv.style.display = 'none';
                      searchBox.value = item.display_name;
                    };
                    suggestionsDiv.appendChild(div);
                  });
                  suggestionsDiv.style.display = 'block';
                } else {
                  suggestionsDiv.style.display = 'none';
                }
              });
            </script>
          </body>
          </html>
        `,
        }}
      />

      <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
        <MaterialIcons name="my-location" size={24} color="#333" />
      </TouchableOpacity>
    </View>
  );
}

/* ===== Utilities ===== */
function extractLocation(pet) {
  if (
    pet.location &&
    (pet.location.lat ||
      pet.location.latitude ||
      pet.location.lng ||
      pet.location.longitude)
  ) {
    return pet.location;
  }
  if (pet.latitude || pet.longitude) {
    return { latitude: pet.latitude, longitude: pet.longitude };
  }
  if (pet.lat || pet.lng) {
    return { lat: pet.lat, lng: pet.lng };
  }
  return null;
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function createAndSaveNotification(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (e) {
    console.warn("Error scheduling local notif:", e);
  }

  try {
    const user = auth.currentUser;
    if (!user) return;
    await addDoc(collection(db, "notifications"), {
      userId: user.uid,
      title,
      body,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Error saving notification to firestore:", e);
  }
}

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.manifest?.extra?.eas?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    console.log("Expo push token:", token);
    return token;
  } catch (e) {
    console.warn("Error al obtener token:", e);
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  return null;
}

/* ===== Estilos ===== */
const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  recenterButton: {
    position: "absolute",
    bottom: 110,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 30,
    padding: 12,
    elevation: 6,
  },
});
