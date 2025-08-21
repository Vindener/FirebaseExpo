import { getApp } from '@react-native-firebase/app';
import { getAuth, onAuthStateChanged, getIdToken } from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from '@react-native-firebase/firestore';

const app = getApp();
export const fs = getFirestore(app);
export const auth = getAuth(app);

// helper for server time
export const now = () => serverTimestamp();

export function subscribeDemo(onChange) {
  const q = query(collection(fs, 'demoItems'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(items);
  });
}

export async function addDemo(text) {
  if (!text) return;
  await addDoc(collection(fs, 'demoItems'), {
    text,
    createdAt: serverTimestamp(),
  });
}

export async function addUsers(text) { 
  if (!text) return;
  await addDoc(collection(fs, 'users'), {
    text,
    createdAt: serverTimestamp(),
  });
}
