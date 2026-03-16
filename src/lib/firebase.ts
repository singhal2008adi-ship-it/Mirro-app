import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Defensive check to prevent build-time crashes when env vars are missing
const isConfigValid = !!firebaseConfig.apiKey;

let app;
if (isConfigValid) {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
}

const auth = app ? getAuth(app) : ({} as any);
const db = app ? getFirestore(app) : ({} as any);
const storage = app ? getStorage(app) : ({} as any);

export { app, auth, db, storage };
