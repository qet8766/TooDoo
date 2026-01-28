import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  enableIndexedDbPersistence,
  type Firestore,
  type CollectionReference,
  type DocumentData,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDCSrUutfmVtYmzZuOAd33Gj_1u6qt-dhw',
  authDomain: 'irodori-93573.firebaseapp.com',
  projectId: 'irodori-93573',
  storageBucket: 'irodori-93573.firebasestorage.app',
  messagingSenderId: '936830453247',
  appId: '1:936830453247:web:55b1fd443f05b764fe13ca',
}

let app: FirebaseApp | null = null
let db: Firestore | null = null

/**
 * Initialize Firebase and Firestore with offline persistence.
 * Must be called before any Firestore operations.
 */
export const initFirebase = async (): Promise<void> => {
  if (db) return // Already initialized

  app = initializeApp(firebaseConfig)
  db = getFirestore(app)

  // Enable offline persistence
  // Note: In Electron's Node.js environment, IndexedDB persistence may not work.
  // Firestore will still cache data in memory and sync when online.
  try {
    await enableIndexedDbPersistence(db)
    console.log('Firestore offline persistence enabled')
  } catch (err: unknown) {
    const error = err as { code?: string }
    if (error.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('Firestore persistence failed: multiple instances running')
    } else if (error.code === 'unimplemented') {
      // The current browser/environment doesn't support persistence
      console.warn('Firestore persistence not available in this environment')
    } else {
      console.error('Firestore persistence error:', err)
    }
  }
}

/**
 * Get the Firestore instance. Throws if not initialized.
 */
export const getDb = (): Firestore => {
  if (!db) {
    throw new Error('Firebase not initialized. Call initFirebase() first.')
  }
  return db
}

/**
 * Get a typed collection reference for tasks.
 */
export const getTasksCollection = (): CollectionReference<DocumentData> => {
  return collection(getDb(), 'tasks')
}

/**
 * Get a typed collection reference for notes (Notetank).
 */
export const getNotesCollection = (): CollectionReference<DocumentData> => {
  return collection(getDb(), 'notes')
}
