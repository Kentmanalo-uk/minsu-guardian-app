// Firebase setup used only when this module runs on its own.
// Inside the main app, the app's own src/lib/firebase.js is used instead.
import { initializeApp, getApps, getApp } from 'firebase/app'

const env = import.meta.env

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId)

/** Demo mode: no Firebase settings, or VITE_REPORTS_DEMO=true. Uses built-in sample data. */
export const isDemoMode = env.VITE_REPORTS_DEMO === 'true' || !isFirebaseConfigured

/** Reuses an already-initialized app so it never creates a second one. */
export function getFirebaseApp() {
  if (!isFirebaseConfigured) return null
  return getApps().length ? getApp() : initializeApp(config)
}
