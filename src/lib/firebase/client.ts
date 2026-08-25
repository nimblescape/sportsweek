import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { resolveAuthDomain } from "./auth-domain";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    typeof window === "undefined" ? undefined : window.location.host,
  ),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Entra ID (Microsoft) sign-in — configure this provider in the Firebase Console
// (Authentication > Sign-in method > Microsoft) with your Entra ID tenant details.
export function createMicrosoftAuthProvider() {
  const provider = new OAuthProvider("microsoft.com");
  // Restrict to a single Entra ID tenant, or use "organizations"/"common" as needed.
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_ID_TENANT_ID;
  if (tenantId) {
    provider.setCustomParameters({ tenant: tenantId });
  }
  return provider;
}
