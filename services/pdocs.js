// Personal Docs API (request-based sharing, no Cloud Functions) — FIXED LOGGING
import { getApp } from '@react-native-firebase/app'
import { getAuth } from '@react-native-firebase/auth'
import {
  getFirestore, serverTimestamp,
  doc, setDoc, updateDoc, getDoc, getDocs,
  collection, addDoc, query, where, onSnapshot
} from '@react-native-firebase/firestore'
import { log, error } from './logger'
import { searchUserByEmail } from './sharing'

const app = getApp()
const auth = getAuth(app)
const db = getFirestore(app)
const now = () => serverTimestamp()

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export async function createPersonalDoc() {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const ref = await addDoc(collection(db, 'docs'), {
    owners: [me],
    editorsMap: {},      
    text: '',
    version: 0,
    lastEditedBy: null,
    createdAt: now(),
    updatedAt: now(),
  })
  await log('createPersonalDoc', { id: ref.id })
  return ref.id
}

export function subscribeMyPersonalDocs(onChange, onError = console.error) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const qOwners = query(collection(db, 'docs'), where('owners', 'array-contains', me))
  const qEditors = query(collection(db, 'docs'), where(`editorsMap.${me}`, '==', true))

  let a=[], b=[]
  const emit = () => {
    const m = new Map()
    for (const x of a) m.set(x.id, x)
    for (const x of b) m.set(x.id, x)
    const merged = Array.from(m.values()).sort((x,y)=> (y.createdAt?.seconds||0)-(x.createdAt?.seconds||0))
    onChange(merged)
  }

  const u1 = onSnapshot(qOwners, (snap)=>{ a = snap?.docs?.map(d=>({id:d.id, ...d.data()})) ?? []; emit() }, e=>{ error('subscribeMyPersonalDocs/owners',{code:e?.code,msg:e?.message}); onError(e) })
  const u2 = onSnapshot(qEditors,(snap)=>{ b = snap?.docs?.map(d=>({id:d.id, ...d.data()})) ?? []; emit() }, e=>{ error('subscribeMyPersonalDocs/editors',{code:e?.code,msg:e?.message}); onError(e) })
  return () => { try{u1&&u1()}catch{} try{u2&&u2()}catch{} }
}

export function subscribePersonalDoc(docId, onChange, onError = console.error) {
  return onSnapshot(doc(db, 'docs', String(docId)), (snap) => {
    if (!snap.exists) { onChange(null); return }
    onChange({ id: snap.id, ...snap.data() })
  }, onError)
}

export async function updatePersonalDoc(docId, text) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const ref = doc(db, 'docs', String(docId))
  const snap = await getDoc(ref); if (!snap.exists) throw new Error('Doc not found')
  const ver = Number(snap.data()?.version || 0)
  await updateDoc(ref, { text: String(text||''), version: ver+1, lastEditedBy: me, updatedAt: now() })
}

/* Request-based sharing */

export async function createDocShareRequest(docId, email) {
  const me = auth.currentUser?.uid;
  if (!me) throw new Error("Not signed in");

  // 1) Перевіряємо, що я власник документа
  const docRef = doc(db, "docs", String(docId));
  const snap = await getDoc(docRef);
  if (!snap.exists) throw new Error("Doc not found");
  const data = snap.data() || {};
  if (!Array.isArray(data.owners) || !data.owners.includes(me)) {
    throw new Error("Only owner can share");
  }

  // 2) Знаходимо користувача за email
  const target = await searchUserByEmail(email);
  if (!target?.uid) throw new Error("User not found");

  // 3) Створюємо запит у docShares
  const ref = await addDoc(collection(db, "docShares"), {
    docId: String(docId),
    fromUid: me,
    toUid: target.uid,
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  });
  await log("createDocShareRequest", { id: ref.id, docId, to: target.uid });
  return ref.id;
}


export function subscribeIncomingDocShares(onChange, onError = console.error) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const q = query(collection(db, 'docShares'), where('toUid', '==', me))
  return onSnapshot(q, (snap)=>{
    const items = snap?.docs?.map(d=>({ id:d.id, ...d.data() })) ?? []
    items.sort((x,y)=> (y.createdAt?.seconds||0)-(x.createdAt?.seconds||0))
    onChange(items)
  }, onError)
}

export function subscribeOutgoingDocShares(onChange, onError = console.error) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const q = query(collection(db, 'docShares'), where('fromUid', '==', me))
  return onSnapshot(q, (snap)=>{
    const items = snap?.docs?.map(d=>({ id:d.id, ...d.data() })) ?? []
    items.sort((x,y)=> (y.createdAt?.seconds||0)-(x.createdAt?.seconds||0))
    onChange(items)
  }, onError)
}

export async function respondDocShareById(shareId, action /* 'accept' | 'decline' | 'cancel' */) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const ref = doc(db, 'docShares', String(shareId))
  const snap = await getDoc(ref)
  if (!snap.exists) throw new Error('Share request not found')
  const d = snap.data() || {}
  const isRecipient = d.toUid === me
  const isOwner = d.fromUid === me
  const curr = d.status
  let next = curr

  if (action === 'accept' && isRecipient && curr === 'pending') next = 'accepted'
  else if (action === 'decline' && isRecipient && curr === 'pending') next = 'declined'
  else if (action === 'cancel' && isOwner && curr === 'pending') next = 'cancelled'
  else throw new Error('Not allowed')

  await log('respondDocShareById:update', { shareId, from: curr, to: next })
  await updateDoc(ref, { status: next, updatedAt: now() })
  return next
}

// After accept: recipient "claims" editor access themselves (allowed by rules)
export async function claimDocShare(shareId) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const shareRef = doc(db, 'docShares', String(shareId))
  let s = await getDoc(shareRef)
  if (!s.exists) throw new Error('Share request not found')
  let { docId, status, toUid } = s.data() || {}

  if (status !== 'accepted') {
    // small wait in case UI calls immediately after update
    await sleep(150)
    s = await getDoc(shareRef); if (!s.exists) throw new Error('Share request not found')
    const d2 = s.data() || {}; status = d2.status; toUid = d2.toUid; docId = d2.docId
  }

  if (status !== 'accepted') throw new Error('Share not accepted yet')
  if (toUid !== me) throw new Error('Share not for this user')

  const docRef = doc(db, 'docs', String(docId))
  await log('claimDocShare:updateDoc', { shareId, docId, add: me })
  await updateDoc(docRef, {
    [`editorsMap.${me}`]: true,
    __shareId: String(shareId),
    updatedAt: now(),
  })
  await log('claimDocShare:done', { shareId, docId })
}

// Отримати профілі власників (для відображення у UI)
export async function readUsersByUids(uids = []) {
  const app = getApp()
  const db = getFirestore(app)
  const uniq = Array.from(new Set((uids || []).filter(Boolean)))
  if (!uniq.length) return []
  const snaps = await Promise.all(
    uniq.map(uid => getDoc(doc(db, 'users', String(uid))))
  )
  return snaps
    .filter(s => s.exists)
    .map(s => ({ uid: s.id, ...s.data() }))
}

export async function deletePersonalDoc(docId) {
  const app = getApp();
  const db = getFirestore(app);

  // спроба modular deleteDoc (може бути відсутня у твоїй версії)
  try {
    const { deleteDoc: modularDeleteDoc } = await import(
      "@react-native-firebase/firestore"
    );
    if (typeof modularDeleteDoc === "function") {
      const ref = doc(db, "docs", String(docId));
      await modularDeleteDoc(ref);
      return;
    }
  } catch (_) {
    // ігноруємо — підемо в fallback
  }

  // fallback: старий namespaced API (працює в усіх стабільних версіях RNFB)
  await firestoreNS()
    .doc(`docs/${String(docId)}`)
    .delete();
}