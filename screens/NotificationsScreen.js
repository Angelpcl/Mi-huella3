// screens/NotificationsScreen.js

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase-config";
import * as Animatable from "react-native-animatable";
import { MaterialIcons } from "@expo/vector-icons";

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 🔔 Escucha en tiempo real las notificaciones del usuario
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      }));
      setNotifications(data);

      // Actualiza contador de no leídas
      const unread = data.filter((n) => !n.read).length;
      setUnreadCount(unread);

      // Mostrar badge en la pestaña inferior si hay nuevas
      navigation.setOptions({
        tabBarBadge: unread > 0 ? unread : null,
        tabBarBadgeStyle: { backgroundColor: "#FF4D4D" },
      });
    });

    return () => unsubscribe();
  }, [navigation]);

  // Refrescar lista manualmente
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  // ✅ Marcar una notificación como leída
  const markAsRead = async (notifId) => {
    try {
      const notifRef = doc(db, "notifications", notifId);
      await updateDoc(notifRef, { read: true });
    } catch (e) {
      console.error("Error al marcar como leída:", e);
    }
  };

  // 🧹 Vaciar todas las notificaciones
  const clearNotifications = async () => {
    const user = auth.currentUser;
    if (!user) return;
    Alert.alert(
      "Vaciar notificaciones",
      "¿Deseas eliminar todas las notificaciones?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar todo",
          style: "destructive",
          onPress: async () => {
            try {
              const q = query(
                collection(db, "notifications"),
                where("userId", "==", user.uid)
              );
              const snapshot = await getDocs(q);
              const deletions = snapshot.docs.map((d) =>
                deleteDoc(doc(db, "notifications", d.id))
              );
              await Promise.all(deletions);
              setNotifications([]);
              Alert.alert("Limpieza completada", "Todas las notificaciones fueron eliminadas.");
            } catch (e) {
              console.error("Error al eliminar notificaciones:", e);
              Alert.alert("Error", "No se pudieron eliminar las notificaciones.");
            }
          },
        },
      ]
    );
  };

  // 🧾 Render de notificación individual
  const renderItem = ({ item }) => {
    const backgroundColor = item.read ? "#FFFFFF" : "#E0FCFF";
    return (
      <Animatable.View
        animation="fadeInUp"
        duration={600}
        style={[styles.card, { backgroundColor }]}
      >
        <TouchableOpacity
          onPress={() => {
            markAsRead(item.id);
            Alert.alert(item.title, item.body);
          }}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.date}>
            {item.createdAt.toLocaleString
              ? item.createdAt.toLocaleString()
              : String(item.createdAt)}
          </Text>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  return (
    <View style={styles.container}>
      <Animatable.Text animation="fadeInDown" duration={700} style={styles.header}>
        🔔 Notificaciones
      </Animatable.Text>

      {notifications.length === 0 ? (
        <Animatable.Text animation="fadeIn" style={styles.emptyText}>
          No tienes notificaciones por ahora 😊
        </Animatable.Text>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}

      {notifications.length > 0 && (
        <Animatable.View animation="fadeInUp" delay={500} style={styles.clearContainer}>
          <TouchableOpacity style={styles.clearButton} onPress={clearNotifications}>
            <MaterialIcons name="delete-forever" size={22} color="#fff" />
            <Text style={styles.clearText}>Vaciar notificaciones</Text>
          </TouchableOpacity>
        </Animatable.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8FFFF", padding: 15 },
  header: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#00C2C7",
    textAlign: "center",
    marginBottom: 15,
  },
  card: {
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    elevation: 2,
  },
  title: { fontSize: 16, fontWeight: "bold", color: "#007B7B", marginBottom: 6 },
  body: { fontSize: 14, color: "#333", marginBottom: 6 },
  date: { fontSize: 12, color: "#777", textAlign: "right" },
  emptyText: {
    textAlign: "center",
    color: "#777",
    fontSize: 16,
    marginTop: 50,
  },
  clearContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5C5C",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  clearText: {
    color: "#fff",
    fontWeight: "bold",
    marginLeft: 8,
  },
});
