/**
 * Firebase is loaded lazily: a learner who never signs in never downloads it.
 * The web config is public by design; access is guarded by firestore.rules.
 */
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyByKu2vtWs1rs23N0gJE0B7PSdGgyAS4kE",
  authDomain: "b2-sprint-valorin.firebaseapp.com",
  projectId: "b2-sprint-valorin",
  storageBucket: "b2-sprint-valorin.firebasestorage.app",
  messagingSenderId: "75246422905",
  appId: "1:75246422905:web:99567f4dcf6910a7563da8",
} as const;

export interface FirebaseKit {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  authMod: typeof import("firebase/auth");
  fsMod: typeof import("firebase/firestore");
}

let kit: Promise<FirebaseKit> | null = null;

export function loadFirebase(): Promise<FirebaseKit> {
  if (!kit) {
    kit = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const app = appMod.getApps()[0] ?? appMod.initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => undefined);
      const db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
      return { app, auth, db, authMod, fsMod };
    })().catch((e: unknown) => {
      kit = null;
      throw e;
    });
  }
  return kit;
}
