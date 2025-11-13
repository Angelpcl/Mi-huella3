// notificationService.js
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Alert, Platform } from "react-native"; // <--- Import Platform
import { db, auth } from "./firebase-config";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  setDoc, // <--- Import setDoc
  addDoc,
  serverTimestamp, // <--- Import serverTimestamp
} from "firebase/firestore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    Alert.alert("Notificaciones", "Solo disponibles en dispositivos físicos.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    Alert.alert(
      "Permiso denegado",
      "No se concedió permiso para notificaciones."
    );
    return null;
  }

  // --- 🔥 CAMBIO 1: Obtener el Project ID de forma segura ---
  const projectId =
    Notifications.config.projectId ||
    (await Notifications.getExpoPushTokenAsync()).data.substring(
      18,
      (await Notifications.getExpoPushTokenAsync()).data.indexOf("]")
    );

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId, // Usar el projectId obtenido
  });

  const token = tokenData.data;
  console.log("Expo Push Token:", token);

  const user = auth.currentUser;
  if (user && token) {
    // --- 🔥 CAMBIO 2: Guardar token en el doc del usuario ---
    // Usamos setDoc con merge para crear o actualizar el documento
    // Esto es vital para que otros puedan encontrar tu token.
    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { expoPushToken: token }, { merge: true });
      console.log("Token guardado en el perfil del usuario.");
    } catch (e) {
      console.error("Error al guardar token en perfil de usuario:", e);
    }
  }

  // Configuración del canal de Android (buena práctica)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  return token;
}

// --- 🔥 CAMBIO 3: Función de envío mejorada ---
/**
 * Envía una notificación push y la guarda en la colección 'notifications'
 * del usuario receptor.
 * @param {string} expoPushToken - El token del destinatario.
 * @param {string} title - Título de la notificación.
 * @param {string} message - Cuerpo de la notificación.
 * @param {string} recipientId - El UID del usuario que debe recibir y ver esta notificación.
 */
export async function sendPushNotification(
  expoPushToken,
  title,
  message,
  recipientId // <--- Acepta el ID del destinatario
) {
  if (!expoPushToken) {
    console.warn("No se proporcionó expoPushToken. No se enviará la notificación push.");
    // Continuamos para al menos guardar la notificación en la DB
  } else {
    // A. Enviar la notificación PUSH a Expo
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: expoPushToken,
          sound: "default",
          title,
          body: message,
        }),
      });
    } catch (e) {
      console.error("Error al enviar notificación PUSH:", e)
    }
  }

  // B. Guardar la notificación en Firestore para el RECEPTOR
  if (!recipientId) {
    console.error("No se proporcionó recipientId. No se puede guardar la notificación.");
    return;
  }
  
  try {
    await addDoc(collection(db, "notifications"), {
      userId: recipientId, // <--- Se guarda con el ID del RECEPTOR
      title,
      body: message,
      createdAt: serverTimestamp(), // <-- Usar serverTimestamp
      read: false,
    });
  } catch (e) {
    console.error("Error al guardar notificación en Firestore:", e)
  }
}