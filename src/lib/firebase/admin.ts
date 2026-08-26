/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
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
    // Minting a custom token means signing a JWT, and a user ADC credential holds no key to
    // sign with. Deployed, the account is discovered from the metadata server; locally there
    // is none, so the fake login needs to be told which account to sign as via the IAM API.
    // Unset in every deployment, which is why it stays undefined here by default.
    serviceAccountId: process.env.FIREBASE_SERVICE_ACCOUNT_ID,
  });
}

export const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
