import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  FlatList,
} from "react-native";
import { auth, db } from "../firebase-config";
import { signOut, updateProfile } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import * as Animatable from "react-native-animatable";
import { COLORS } from "../theme";

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(auth.currentUser);
  const [userData, setUserData] = useState({
    name: user?.displayName || "",
    email: user?.email || "",
    phone: "",
    address: "",
    gender: "",
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [field, setField] = useState("");
  const [newValue, setNewValue] = useState("");
  const [pets, setPets] = useState([]);

  // Inicializa user y listeners
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (!u) {
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    });

    let unsubscribePets = null;

    if (user) {
      fetchUserData();

      const q = query(collection(db, "pets"), where("userId", "==", user.uid));
      unsubscribePets = onSnapshot(q, (snapshot) => {
        const petsData = [];
        snapshot.forEach((doc) => petsData.push({ id: doc.id, ...doc.data() }));
        setPets(petsData);
      });
    }

    return () => {
      unsubscribeAuth();
      if (unsubscribePets) unsubscribePets();
    };
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserData((prev) => ({
          ...prev,
          phone: data.phone || "",
          address: data.address || "",
          gender: data.gender || "",
        }));
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const saveData = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { [field]: newValue }, { merge: true });
      if (field === "name") await updateProfile(user, { displayName: newValue });
      setUserData((prev) => ({ ...prev, [field]: newValue }));
      setModalVisible(false);
      Alert.alert("✅ Actualizado", `${field} actualizado correctamente.`);
    } catch (error) {
      console.error("Error updating user data:", error);
      Alert.alert("Error", "No se pudo actualizar el campo.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // El navigation.reset se ejecuta automáticamente en onAuthStateChanged
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const getPetIcon = (type = "") => {
    const key = type.trim().toLowerCase();
    const icons = {
      perro: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
      gato: "https://cdn-icons-png.flaticon.com/512/616/616430.png",
      ave: "https://cdn-icons-png.flaticon.com/512/616/616545.png",
      pez: "https://cdn-icons-png.flaticon.com/512/616/616514.png",
    };
    return icons[key] || "https://cdn-icons-png.flaticon.com/512/616/616554.png";
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.lightBg }}>
      <Animatable.View animation="fadeInDown" style={styles.header}>
        <Image
          source={{
            uri:
              userData.gender === "Hombre"
                ? "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
                : "https://cdn-icons-png.flaticon.com/512/4140/4140047.png",
          }}
          style={styles.avatar}
        />
        <Text style={styles.title}>{userData.name || "Usuario"}</Text>
        <Text style={styles.email}>{userData.email}</Text>
      </Animatable.View>

      {["name", "phone", "address"].map((f, index) => (
        <Animatable.View
          key={f}
          animation="fadeInUp"
          delay={index * 150}
          style={styles.card}
        >
          <View style={styles.labelRow}>
            <Text style={styles.label}>
              {f === "name"
                ? "📛 Nombre"
                : f === "phone"
                ? "📞 Teléfono"
                : "📍 Dirección"}
            </Text>
            <TouchableOpacity
              style={styles.editInline}
              onPress={() => {
                setField(f);
                setNewValue(userData[f]);
                setModalVisible(true);
              }}
            >
              <Text style={styles.editText}>✏️</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.value}>
            {userData[f] || (f === "phone" ? "No registrado" : "No registrada")}
          </Text>
        </Animatable.View>
      ))}

      <Animatable.Text animation="fadeInLeft" style={styles.sectionTitle}>
        🐶 Mis Mascotas
      </Animatable.Text>

      {pets.length === 0 ? (
        <Text style={styles.emptyText}>No tienes mascotas registradas.</Text>
      ) : (
        <FlatList
          data={pets}
          horizontal
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.petIconCard}>
              <Image source={{ uri: getPetIcon(item.type) }} style={styles.petIcon} />
              <Text style={styles.petName}>{item.name}</Text>
            </View>
          )}
        />
      )}

      <Animatable.View animation="bounceIn" delay={500}>
        <TouchableOpacity
          style={styles.chipButton}
          onPress={() => navigation.navigate("Chip")}
        >
          <Text style={styles.chipText}>💳 Comprar Chip</Text>
        </TouchableOpacity>
      </Animatable.View>

      <Animatable.View animation="tada" delay={800}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </Animatable.View>

      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <Animatable.View animation="zoomIn" style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar {field}</Text>
            <TextInput
              placeholder={`Nuevo ${field}`}
              placeholderTextColor="#555" 
              style={styles.input}
              value={newValue}
              onChangeText={setNewValue}
            />
            <TouchableOpacity style={styles.saveButton} onPress={saveData}>
              <Text style={styles.saveText}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.saveText}>Cancelar</Text>
            </TouchableOpacity>
          </Animatable.View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginVertical: 20 },
  avatar: { width: 110, height: 110, borderRadius: 60, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.turquoise },
  email: { fontSize: 15, color: "#555", marginBottom: 10 },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    elevation: 3,
  },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontWeight: "bold", fontSize: 16, color: "#000" },
  editInline: { backgroundColor: "#00C2C7", padding: 6, borderRadius: 8 },
  editText: { color: "#fff", fontWeight: "bold" },
  value: { color: "#444", marginTop: 6 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    color: COLORS.turquoise,
  },
  petIconCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 10,
    marginHorizontal: 10,
    borderRadius: 12,
    elevation: 3,
  },
  petIcon: { width: 70, height: 70, borderRadius: 35, marginBottom: 5 },
  petName: { color: "#00C2C7", fontWeight: "bold" },
  emptyText: { color: "#777", textAlign: "center", marginBottom: 10 },
  chipButton: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: COLORS.turquoise,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  chipText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  logoutButton: {
    margin: 20,
    backgroundColor: "#FF5C5C",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold" },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: { width: "80%", backgroundColor: "#fff", padding: 20, borderRadius: 12 },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: COLORS.turquoise,
    textAlign: "center",
  },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 10, marginBottom: 10 },
  saveButton: { backgroundColor: COLORS.turquoise, padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 8 },
  cancelButton: { backgroundColor: "#FF5C5C", padding: 12, borderRadius: 8, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "bold" },
});
