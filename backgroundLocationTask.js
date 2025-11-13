// backgroundLocationTask.js
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { collection, query, where, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";
import { db } from "./firebase-config";
import { sendPushNotification } from "./notificationService";
import { getAuth, onAuthStateChanged } from "firebase/auth";

const TASK_NAME = "background-location-task";

/**
 * 🔒 Función auxiliar para obtener el usuario actual,
 * incluso si FirebaseAuth tarda en inicializarse en segundo plano.
 */
async function getCurrentUserAsync() {
  return new Promise((resolve) => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// 🛰️ Definir la tarea de ubicación
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Error en tarea de ubicación:", error);
    return;
  }

  if (!data) return;
  const { locations } = data;
  const loc = locations[0];
  if (!loc) return;

  // ✅ Espera a que FirebaseAuth cargue el usuario actual
  const user = await getCurrentUserAsync();
  if (!user) {
    console.log("⚠️ No hay usuario autenticado en background.");
    return;
  }

  try {
    // 🐾 Obtener todas las mascotas del usuario autenticado
    const q = query(collection(db, "pets"), where("userId", "==", user.uid));
    const snapshot = await getDocs(q);

    for (const petDoc of snapshot.docs) {
      const petData = petDoc.data();
      const oldLoc = petData.location;

      // Calcular distancia aproximada (en metros)
      const distance =
        oldLoc && oldLoc.latitude
          ? Math.sqrt(
              Math.pow(loc.coords.latitude - oldLoc.latitude, 2) +
              Math.pow(loc.coords.longitude - oldLoc.longitude, 2)
            ) * 111000
          : 100; // fuerza la primera actualización

      if (distance > 10) {
        // 🗺️ Actualizar ubicación de la mascota
        await updateDoc(doc(db, "pets", petDoc.id), {
          location: {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          },
        });

        console.log(`📍 Mascota ${petData.name || "sin nombre"} actualizada.`);

        // 🔔 Enviar notificación push al usuario
        const userSnap = await getDocs(
          query(collection(db, "users"), where("uid", "==", user.uid))
        );
        if (!userSnap.empty) {
          const userData = userSnap.docs[0].data();
          if (userData.expoPushToken) {
            await sendPushNotification(
              userData.expoPushToken,
              "🐕 Movimiento detectado",
              `Tu mascota ${petData.name || "registrada"} cambió de ubicación.`
            );
          }
        }

        // 🗂️ Guardar en historial
        await addDoc(collection(db, "history"), {
          userId: user.uid,
          petId: petDoc.id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: new Date().toISOString(),
        });

        // 🔔 Guardar también en notificaciones
        await addDoc(collection(db, "notifications"), {
          userId: user.uid,
          title: "🐾 Ubicación actualizada",
          body: `La ubicación de ${petData.name || "tu mascota"} fue actualizada.`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("Error en actualización de ubicación:", err);
  }
});

// 🛰️ Registrar la tarea si no está activa
export async function registerBackgroundTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.Highest,
        distanceInterval: 5, // cada 5 metros
        deferredUpdatesInterval: 60000, // cada 1 minuto
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "Rastreo de mascotas activo 🐾",
          notificationBody: "Actualizando ubicación en segundo plano.",
        },
      });
      console.log("✅ Tarea de ubicación en segundo plano registrada");
    } else {
      console.log("ℹ️ La tarea de ubicación ya está registrada");
    }
  } catch (e) {
    console.error("Error al registrar tarea de ubicación:", e);
  }
}
