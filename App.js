// App.js
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { onAuthStateChanged } from "firebase/auth";
import { MaterialIcons } from "@expo/vector-icons";
import * as Animatable from "react-native-animatable";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { auth, db } from "./firebase-config";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import HomeScreen from "./screens/HomeScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PetsScreen from "./screens/PetsScreen";
import ChipScreen from "./screens/ChipScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import { COLORS } from "./theme";

// --- (Importaciones de background y notificaciones) ---
import { registerBackgroundTask } from "./backgroundLocationTask";
import { registerForPushNotificationsAsync } from "./notificationService";

// +++ NUEVA IMPORTACIÓN +++
import CommunityScreen from "./screens/CommunityScreen"; // 1. Importa la nueva pantalla

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ route }) {
  const userName = route?.params?.userName || "Usuario";
  const [unreadCount, setUnreadCount] = useState(0);

  // ... (useEffect para notificaciones no leídas se mantiene igual) ...
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map((d) => d.data());
      const unread = all.filter((n) => !n.read).length;
      setUnreadCount(unread);
    });
    return () => unsubscribe();
  }, []);


  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          height: 64,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: COLORS.turquoise,
        tabBarInactiveTintColor: "#9AA3A6",
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ color, size }) => {
          let name = "home";
          if (route.name === "Mascotas") name = "pets";
          if (route.name === "Perfil") name = "person";
          // +++ NUEVO ICONO +++
          if (route.name === "Comunidad") name = "group"; // 2. Asigna un icono

          // 🔴 Mostrar badge rojo en notificaciones
          if (route.name === "Notificaciones") {
            name = "notifications";
            return (
              <View>
                <MaterialIcons name={name} size={size ?? 24} color={color} />
                {unreadCount > 0 && (
                  <View
                    style={{
                      // ... (estilos del badge)
                    }}
                  >
                    <Text
                      style={{
                        // ... (estilos del texto del badge)
                      }}
                    >
                      {unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            );
          }

          return <MaterialIcons name={name} size={size ?? 24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} initialParams={{ userName }} />
      <Tab.Screen name="Mascotas" component={PetsScreen} />
      
      {/* +++ NUEVA PANTALLA EN EL TAB +++ */}
      {/* 3. Agrega la pantalla al navegador */}
      <Tab.Screen 
        name="Comunidad" 
        component={CommunityScreen} 
        options={{ title: "Comunidad" }} // Puedes usar 'title' o 'name'
      /> 

      <Tab.Screen name="Notificaciones" component={NotificationsScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  // ... (El resto de tu componente App se mantiene igual) ...
  const [loading, setLoading] = useState(true);
  const [initialUser, setInitialUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setInitialUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    registerBackgroundTask();
    registerForPushNotificationsAsync();
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: COLORS.lightBg,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.turquoise} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Chip" component={ChipScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}