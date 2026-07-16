import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, serverTimestamp } from "firebase/database";

/**
 * Firebase configuration.
 * All values are read from Vite environment variables (import.meta.env).
 * Prefix variables with VITE_ in your .env file, e.g.:
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=...
 *   VITE_FIREBASE_DATABASE_URL=...
 *   VITE_FIREBASE_PROJECT_ID=...
 *   VITE_FIREBASE_STORAGE_BUCKET=...
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *   VITE_FIREBASE_APP_ID=...
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth instance
const auth = getAuth(app);

// Realtime Database instance
const database = getDatabase(app);

/**
 * Helper: connect to Firebase emulators in development.
 * Call this once at app startup if you are running local emulators.
 *
 * Example usage in main.jsx:
 *   if (import.meta.env.DEV) {
 *     await connectFirebaseEmulators();
 *   }
 */
export async function connectFirebaseEmulators() {
  // Default emulator ports: auth=9099, database=9000
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectDatabaseEmulator(database, "localhost", 9000);
}

/**
 * Re-export serverTimestamp for convenience.
 * Use this when writing timestamps to RTDB so all clients
 * share a consistent time source.
 */
export { serverTimestamp };

/**
 * Shortcut: get a Firebase DatabaseReference for a room node.
 * @param {string} roomId - The room ID
 * @returns {import("firebase/database").DatabaseReference}
 */
export function getRoomRef(roomId) {
  return ref(database, `rooms/${roomId}`);
}

export { auth, database };
export default app;
