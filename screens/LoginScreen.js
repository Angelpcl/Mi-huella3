// screens/LoginScreen.js
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase-config";
import * as Animatable from "react-native-animatable";
import { COLORS, SPACING } from "../theme";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Completa todos los campos");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userName = userCredential.user.displayName || "Usuario";

      navigation.reset({
        index: 0,
        routes: [{ name: "Main", params: { userName } }],
      });
    } catch (error) {
      Alert.alert("Error al iniciar sesión", error.message);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <Animatable.View animation="bounceInDown" duration={900} style={styles.logoContainer}>
        <Image
  source={{ uri: "https://cdn-icons-png.flaticon.com/512/616/616408.png" }}
  style={styles.logo}
  resizeMode="contain"
/>

      </Animatable.View>

      <Animatable.View animation="fadeInUp" delay={300} style={styles.form}>
        <Text style={styles.title}>Iniciar Sesión</Text>

        <Animatable.View animation="pulse" iterationCount={1} style={styles.inputWrapper}>
          <TextInput placeholder="Correo" placeholderTextColor="#555" value={email} onChangeText={setEmail} style={styles.input} keyboardType="email-address" autoCapitalize="none"/>
        </Animatable.View>

        <Animatable.View animation="pulse" delay={150} iterationCount={1} style={styles.inputWrapper}>
          <TextInput placeholder="Contraseña" placeholderTextColor="#555" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry/>
        </Animatable.View>

        <Animatable.View animation="rubberBand" delay={500}>
          <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          </TouchableOpacity>
        </Animatable.View>

        <Animatable.View animation="shake" delay={700}>
          <TouchableOpacity style={[styles.button, styles.registerButton]} onPress={() => navigation.navigate("Register")} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Registrar</Text>
          </TouchableOpacity>
        </Animatable.View>
      </Animatable.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:"center", padding:24, backgroundColor: COLORS.lightBg },
  logoContainer: { alignItems:"center", marginBottom:18 },
  logo: { width:140, height:140, borderRadius:20, backgroundColor: COLORS.white, padding:8, elevation:6 },
  form: { backgroundColor: COLORS.white, padding:18, borderRadius:16, elevation:6, shadowColor:"#000", shadowOpacity:0.08 },
  title: { fontSize:28, fontWeight:"700", color:COLORS.turquoise, marginBottom:12, textAlign:"center" },
  inputWrapper: { marginBottom:12 },
  input: { backgroundColor:"#F5F7F8", padding:14, borderRadius:10, color: "#000" },
  button: { backgroundColor: COLORS.turquoise, padding:14, borderRadius:12, alignItems:"center", marginTop:6 },
  registerButton: { backgroundColor: COLORS.turquoiseDark },
  buttonText: { color: COLORS.white, fontWeight:"700" }
});
