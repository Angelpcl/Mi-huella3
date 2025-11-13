import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { auth, db } from "../firebase-config";
import * as Animatable from "react-native-animatable";
import { COLORS } from "../theme";

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState("Hombre");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password)
      return Alert.alert("Error", "Completa todos los campos");

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;
      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        gender,
        createdAt: new Date().toISOString(),
      });

      navigation.replace("Main", { screen: "Home", params: { userName: name } });
    } catch (error) {
      console.error("register error:", error);
      Alert.alert("Error al registrar", error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <Animatable.View animation="fadeInDown" duration={700} style={styles.header}>
        <Text style={styles.headerTitle}>Crear cuenta</Text>
      </Animatable.View>

      <Animatable.View animation="fadeInUp" delay={200} style={styles.form}>
        <TextInput
          placeholder="Nombre"
          placeholderTextColor="#555" 
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder="Correo"
          placeholderTextColor="#555" 
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Contraseña"
          placeholderTextColor="#555" 
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />

        {/* Selección de género */}
        <View style={styles.genderContainer}>
          <Text style={styles.genderLabel}>Género:</Text>
          <View style={styles.genderButtons}>
            {["Hombre", "Mujer"].map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.genderButton,
                  gender === g && styles.genderSelected,
                ]}
                onPress={() => setGender(g)}
              >
                <Text
                  style={[
                    styles.genderText,
                    gender === g && styles.genderTextSelected,
                  ]}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creando..." : "Crear Cuenta"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.backButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Volver</Text>
        </TouchableOpacity>
      </Animatable.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "#E8FFFF" },
  header: { alignItems: "center", marginBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#00C2C7" },
  form: { backgroundColor: "#fff", padding: 16, borderRadius: 14, elevation: 6 },
  input: { backgroundColor: "#F7FBFB", padding: 14, marginBottom: 12, borderRadius: 10, color: "#000" },
  genderContainer: { marginBottom: 14 },
  genderLabel: { fontSize: 16, fontWeight: "600", color: "#00C2C7", marginBottom: 8 },
  genderButtons: { flexDirection: "row", justifyContent: "space-around" },
  genderButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  genderSelected: { backgroundColor: "#00C2C7", borderColor: "#00C2C7" },
  genderText: { color: "#444", fontWeight: "bold" },
  genderTextSelected: { color: "#fff" },
  button: {
    backgroundColor: "#00C2C7",
    padding: 14,
    alignItems: "center",
    borderRadius: 12,
    marginBottom: 8,
  },
  backButton: { backgroundColor: "#00AFAF" },
  buttonText: { color: "#fff", fontWeight: "800" },
});
