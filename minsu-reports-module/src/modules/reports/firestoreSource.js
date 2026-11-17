import { getApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

export const DEFAULT_CASES_COLLECTION = 'disciplinary_cases'

/**
 * Returns a loader that reads every case document from Firestore.
 * - Pass `db` to use a specific Firestore instance (the main app passes its own).
 * - Without `db`, it uses the default Firebase app, which must already be
 *   initialized by whoever hosts the page.
 * No orderBy: documents missing `created_at` are still counted.
 */
export function createFirestoreLoader({ db, collectionName = DEFAULT_CASES_COLLECTION } = {}) {
  return async function loadCasesFromFirestore() {
    const firestore = db ?? getFirestore(getApp())
    const snapshot = await getDocs(collection(firestore, collectionName))
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  }
}
