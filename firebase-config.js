import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getAuth } from "firebase/auth";


const firebaseConfig = {
  apiKey: "AIzaSyAi9Hv2Cd5O2xbTIoykbm92FMySiXeU9Iw",
  authDomain: "mihuella-9eedf.firebaseapp.com",
  projectId: "mihuella-9eedf",
  storageBucket: "mihuella-9eedf.appspot.com",
  messagingSenderId: "1021043333747",
  appId: "1:10210433336806",
  measurementId: "G-KJKTVV7D3G",
};


// Inicializar app solo una vez
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);


// Inicializar Auth con persistencia nativa en móvil
let auth;
if (Platform.OS !== "web") {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  // Web: persistencia automática
 
  auth = getAuth(app);
}


export const db = getFirestore(app);
export { auth };
