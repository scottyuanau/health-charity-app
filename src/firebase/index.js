import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId']
const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key])

let firebaseApp = null

if (missingKeys.length === 0) {
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
} else {
  if (import.meta.env.DEV) {
    console.warn(
      `Firebase configuration is incomplete. Missing keys: ${missingKeys.join(', ')}`,
    )
  }
}

const auth = firebaseApp ? getAuth(firebaseApp) : null
const db = firebaseApp ? getFirestore(firebaseApp) : null

export { auth, firebaseConfig, missingKeys, db }
