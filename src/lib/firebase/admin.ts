import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Only used server-side (Route Handlers, Server Actions, Cloud Functions) — never import from client components.
function getAdminApp(): App {
  if (getApps().length) return getApps()[0];

  // Always uses Application Default Credentials — no long-lived service account keys are
  // ever generated or stored. Either the metadata server on App Hosting/Cloud Functions,
  // or `gcloud auth application-default login` for local dev.
  // Project ID isn't auto-discoverable from user ADC credentials, so pass it explicitly.
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
