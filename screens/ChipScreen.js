// screens/ChipScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import * as Animatable from "react-native-animatable";
import * as Notifications from "expo-notifications";
import { auth, db } from "../firebase-config";
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection } from "firebase/firestore";

const SPEI_NUMBER = "1234567890";

export default function ChipScreen({ navigation }) {
  const [user, setUser] = useState(auth.currentUser);
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Tarjeta");
  const [quantity, setQuantity] = useState("1");
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [history, setHistory] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Datos tarjeta
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [ccv, setCcv] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) fetchUserData(u.uid);
      else navigation.replace("Login");
    });
    return unsubscribe;
  }, []);

  const fetchUserData = async (uid) => {
    try {
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setHistory(data.purchases || []);
        if (data.address) setAddress(data.address);
      }
    } catch (e) {
      console.error("Error al obtener historial:", e);
    }
  };

  const total = (parseInt(quantity || "1", 10) || 1) * 150;

  // ---------------- VALIDACIONES ----------------
  const onlyDigits = (s) => s.replace(/\D/g, "");
  const luhnCheck = (numStr) => {
    const s = onlyDigits(numStr);
    if (s.length < 13 || s.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = s.length - 1; i >= 0; i--) {
      let n = parseInt(s.charAt(i), 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  };
  const validateExpiry = (mmyy) => {
    if (!/^\d{2}\/\d{2}$/.test(mmyy)) return false;
    const [mmS, yyS] = mmyy.split("/");
    const mm = parseInt(mmS, 10);
    const yy = parseInt(yyS, 10);
    if (mm < 1 || mm > 12) return false;
    const fullYear = 2000 + yy;
    const expiryStart = new Date(fullYear, mm, 1);
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return expiryStart > currentMonthStart;
  };
  const validateCcv = (c) => /^\d{3,4}$/.test(c);

  // ---------------- FUNCIONES AUXILIARES ----------------
  const sendNotification = async (title, body) => {
    // Notificación local
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });

    const notifData = {
      userId: user.uid,
      title,
      body,
      createdAt: new Date(),
      read: false,
    };

    try {
      // 🔹 Guardar en colección "notifications" (para pantalla de notificaciones)
      await addDoc(collection(db, "notifications"), notifData);
    } catch (e) {
      console.error("Error al guardar notificación global:", e);
    }

    try {
      // 🔹 Guardar también en el documento del usuario (opcional)
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        notifications: arrayUnion({
          title,
          body,
          date: notifData.createdAt.toLocaleString(),
          read: false,
        }),
      });
    } catch (e) {
      console.error("Error al guardar notificación en usuario:", e);
    }
  };

  const savePurchase = async (purchaseData) => {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { purchases: arrayUnion(purchaseData) });
    setHistory((prev) => [purchaseData, ...prev]);
  };

  // ---------------- PROCESAR PAGOS ----------------
  const processCardPayment = async () => {
    if (!cardName) return Alert.alert("Error", "Ingresa el nombre del titular.");
    if (!luhnCheck(cardNumber)) return Alert.alert("Error", "Número de tarjeta inválido.");
    if (!validateExpiry(expiry))
      return Alert.alert("Error", "Fecha de vencimiento inválida o expirada (MM/AA).");
    if (!validateCcv(ccv)) return Alert.alert("Error", "CCV inválido.");

    setProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));

      const purchaseData = {
        userId: user.uid,
        date: new Date().toLocaleString(),
        address: address || "Sin dirección",
        method: "Tarjeta (Emulado)",
        quantity: quantity || "1",
        total: total || 0,
        status: "Pagado",
        cardLast4: onlyDigits(cardNumber).slice(-4),
      };

      await savePurchase(purchaseData);
      await sendNotification(
        "✅ Compra confirmada",
        `Tu pago con tarjeta (${purchaseData.cardLast4}) fue registrado exitosamente.`
      );

      Alert.alert("✅ Pago simulado exitoso", "Tu compra fue confirmada correctamente.");

      setCardNumber("");
      setCardName("");
      setExpiry("");
      setCcv("");
      setCardModalVisible(false);
      setCheckoutVisible(false);
    } catch (e) {
      console.error("Error en pago emulado:", e);
      Alert.alert("Error", "No se pudo procesar el pago emulado.");
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!user) return Alert.alert("Error", "Usuario no autenticado.");

    // Transferencia
    if (paymentMethod === "Transferencia") {
      setProcessing(true);
      try {
        const purchaseData = {
          userId: user.uid,
          date: new Date().toLocaleString(),
          address: address || "Sin dirección",
          method: "Transferencia",
          quantity,
          total,
          status: "Pendiente",
          speiNumber: SPEI_NUMBER,
        };
        await savePurchase(purchaseData);
        await sendNotification(
          "🏦 Transferencia registrada",
          `Compra pendiente, usa el número SPEI ${SPEI_NUMBER}.`
        );
        Alert.alert("Transferencia registrada", `Usa el número SPEI: ${SPEI_NUMBER}`);
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "No se pudo registrar la transferencia.");
      } finally {
        setProcessing(false);
        setCheckoutVisible(false);
      }
      return;
    }

    // Efectivo
    if (paymentMethod === "Efectivo") {
      setProcessing(true);
      try {
        const purchaseData = {
          userId: user.uid,
          date: new Date().toLocaleString(),
          address: address || "Sin dirección",
          method: "Efectivo",
          quantity,
          total,
          status: "Pendiente",
        };
        await savePurchase(purchaseData);
        await sendNotification(
          "💵 Compra en efectivo",
          "Tu pedido fue registrado. Pagarás al recibir."
        );
        Alert.alert("Compra registrada", "Pago en efectivo confirmado.");
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "No se pudo registrar la compra.");
      } finally {
        setProcessing(false);
        setCheckoutVisible(false);
      }
      return;
    }

    // Tarjeta
    if (paymentMethod === "Tarjeta") setCardModalVisible(true);
  };

  // ---------------- UI ----------------
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, padding: 20, backgroundColor: "#E8FFFF" }}>
          <Animatable.Text animation="fadeInDown" duration={900} style={styles.title}>
            💳 Compra de Chip
          </Animatable.Text>

          {/* Dirección */}
          <Animatable.View animation="fadeInUp" delay={100} style={styles.card}>
            <Text style={styles.label}>📍 Dirección de envío:</Text>
            <TextInput
              placeholder="Escribe tu dirección completa"
              placeholderTextColor="#555" 
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              multiline
            />
          </Animatable.View>

          {/* Método de pago */}
          <Animatable.View animation="fadeInUp" delay={200} style={styles.card}>
            <Text style={styles.label}>💳 Método de pago:</Text>
            <View style={styles.methods}>
              {["Tarjeta", "Efectivo", "Transferencia"].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodButton, paymentMethod === m && styles.methodSelected]}
                  onPress={() => setPaymentMethod(m)}
                >
                  <Text style={[styles.methodText, paymentMethod === m && styles.methodTextSelected]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animatable.View>

          {/* Transferencia */}
          {paymentMethod === "Transferencia" && (
            <Animatable.View animation="fadeInUp" delay={250} style={styles.card}>
              <Text style={styles.label}>🔢 Número de transferencia:</Text>
              <Text style={{ fontWeight: "bold", fontSize: 16 }}>{SPEI_NUMBER}</Text>
              <TouchableOpacity
                style={[styles.confirmButton, { marginTop: 10 }]}
                onPress={handlePayment}
                disabled={processing}
              >
                <Text style={styles.saveText}>Transferencia confirmada</Text>
              </TouchableOpacity>
            </Animatable.View>
          )}

          {/* Cantidad */}
          <Animatable.View animation="fadeInUp" delay={300} style={styles.card}>
            <Text style={styles.label}>🔢 Cantidad de chips:</Text>
            <TextInput
              keyboardType="numeric"
              value={quantity}
              onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ""))}
              style={styles.input}
            />
          </Animatable.View>

          {/* Botón comprar */}
          {paymentMethod !== "Transferencia" && (
            <TouchableOpacity
              style={styles.buyButton}
              onPress={() => {
                if (!address) return Alert.alert("Error", "Ingresa tu dirección antes de comprar.");
                setCheckoutVisible(true);
              }}
              disabled={processing}
            >
              <Text style={styles.buyText}>{processing ? "Procesando..." : "Comprar"}</Text>
            </TouchableOpacity>
          )}

          {/* Historial */}
          <Text style={[styles.title, { fontSize: 22, marginTop: 20, marginBottom: 10 }]}>
            🛒 Historial de compras
          </Text>
          <FlatList
            data={history}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={styles.historyItem}>
                <Text>📅 {item.date}</Text>
                <Text>🏠 {item.address}</Text>
                <Text>💳 {item.method}</Text>
                {item.speiNumber && <Text>🔢 {item.speiNumber}</Text>}
                {item.cardLast4 && <Text>🔒 Tarjeta: **** **** **** {item.cardLast4}</Text>}
                <Text>💰 ${item.total} MXN ({item.status})</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={{ textAlign: "center", color: "#777" }}>Sin compras registradas</Text>
            }
          />

          {/* Modal resumen */}
          <Modal visible={checkoutVisible} animationType="fade" transparent>
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>🧾 Resumen de compra</Text>
                <Text>Dirección: {address}</Text>
                <Text>Método: {paymentMethod}</Text>
                <Text>Cantidad: {quantity}</Text>
                <Text>Total: ${total} MXN</Text>

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handlePayment}
                  disabled={processing}
                >
                  <Text style={styles.saveText}>
                    {processing ? "Procesando..." : "Confirmar compra"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setCheckoutVisible(false)}
                >
                  <Text style={styles.saveText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal tarjeta */}
          <Modal visible={cardModalVisible} animationType="slide" transparent>
            <View style={styles.modalContainer}>
              <View style={[styles.modalContent, { maxHeight: 520 }]}>
                <Text style={styles.modalTitle}>💳 Pago con tarjeta (Emulado)</Text>
                <TextInput
                  placeholder="Nombre en la tarjeta"
                  placeholderTextColor="#555" 
                  style={styles.input}
                  value={cardName}
                  onChangeText={setCardName}
                />
                <TextInput
                  placeholder="Número de tarjeta"
                  placeholderTextColor="#555" 
                  style={styles.input}
                  keyboardType="numeric"
                  value={cardNumber}
                  onChangeText={(t) => setCardNumber(onlyDigits(t))}
                  maxLength={19}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <TextInput
                    placeholder="MM/AA"
                    placeholderTextColor="#555" 
                    style={[styles.input, { flex: 1, marginRight: 8 }]}
                    value={expiry}
                    onChangeText={(t) =>
                      setExpiry(t.replace(/[^\d/]/g, "").replace(/^(\d{2})(\d)/, "$1/$2"))
                    }
                    maxLength={5}
                  />
                  <TextInput
                    placeholder="CCV"
                    placeholderTextColor="#555" 
                    style={[styles.input, { width: 100 }]}
                    keyboardType="numeric"
                    value={ccv}
                    onChangeText={(t) => setCcv(t.replace(/\D/g, ""))}
                    maxLength={4}
                  />
                </View>

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={processCardPayment}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveText}>Pagar ${total} MXN</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setCardModalVisible(false)}
                >
                  <Text style={styles.saveText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ---------------- ESTILOS ----------------
const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#00C2C7",
    textAlign: "center",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 3,
  },
  label: { fontWeight: "bold", fontSize: 16, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    color: "#000"
  },
  methods: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 },
  methodButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  methodSelected: { backgroundColor: "#00C2C7", borderColor: "#00C2C7" },
  methodText: { color: "#333", fontWeight: "bold" },
  methodTextSelected: { color: "#fff" },
  buyButton: {
    backgroundColor: "#00C2C7",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  buyText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  historyItem: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 2,
  },
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
    color: "#00C2C7",
    textAlign: "center",
  },
  confirmButton: {
    backgroundColor: "#00C2C7",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  cancelButton: {
    backgroundColor: "#FF5C5C",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "bold" },
});
