import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider } from "firebase/auth";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Fail loudly if any value is missing — Firebase's own error
// (`auth/invalid-api-key`) doesn't say which var is empty.
const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length > 0) {
  throw new Error(
    `Firebase config missing: ${missing.join(", ")}. ` +
      `Check VITE_FIREBASE_* env vars in Vercel (must be non-sensitive).`
  );
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
// In the Capacitor WKWebView there is no popup/redirect resolver to wire up;
// initializeAuth with IndexedDB persistence keeps the session across launches.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);
export const googleProvider = new GoogleAuthProvider();
