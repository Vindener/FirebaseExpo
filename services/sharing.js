import { getApp } from '@react-native-firebase/app'
import { getAuth, getIdToken } from '@react-native-firebase/auth'
import {
  getFirestore, serverTimestamp,
  doc, setDoc, updateDoc, getDoc, getDocs,
  collection, query, where, orderBy, limit, onSnapshot
} from '@react-native-firebase/firestore'
import { log, error } from './logger'

const app = getApp()
export const auth = getAuth(app)
export const db = getFirestore(app)
export const now = () => serverTimestamp()

const pairId = (a, b) => [a, b].sort().join('_')

function pickEmailLower(user) {
  const direct = (user?.email || '').toLowerCase()
  if (direct) return direct
  const fromProvider = (user?.providerData || []).find(p => p?.email)?.email || ''
  return (fromProvider || '').toLowerCase()
}

// Create/update users/{uid} after sign-in
export async function ensureUserInUsers() {
  await log('ensureUserInUsers:start')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  try { await getIdToken(user, true) } catch {}

  const uid = user.uid
  const emailLower = pickEmailLower(user)
  const userRef = doc(db, 'users', uid)
  const base = {
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    emailLower: emailLower || null,
    updatedAt: now(),
  }

  const snap = await getDoc(userRef)
  const data = snap.exists ? (snap.data() || {}) : {}
  const needsCreate = !snap.exists
  const missingEmailLower = typeof data.emailLower !== 'string' || !data.emailLower
  const missingCreatedAt = !('createdAt' in data)

  if (needsCreate || missingEmailLower || missingCreatedAt) {
    await log('ensureUserInUsers:setDoc', { uid, emailLower, reason: needsCreate ? 'missingDoc' : 'fixMissingFields' })
    await setDoc(userRef, { ...base, createdAt: data.createdAt || now() }, { merge: true })
  } else {
    await log('ensureUserInUsers:updateDoc', { uid, emailLower })
    await updateDoc(userRef, base)
  }
  return { uid, emailLower }
}

// Search directly in users by emailLower
export async function searchUserByEmail(email) {
  await log('searchUserByEmail', { email: String(email || '') })
  const key = String(email || '').trim().toLowerCase()
  if (!key) return null
  const q = query(collection(db, 'users'), where('emailLower', '==', key), limit(1))
  const ss = await getDocs(q)
  if (ss.empty) { await log('searchUserByEmail:empty'); return null }
  const docSnap = ss.docs[0]
  const res = { uid: docSnap.id, ...docSnap.data() }
  await log('searchUserByEmail:hit', res)
  return res
}

// Create or refresh a connection request (no pre-read to avoid read rules on missing doc)
export async function createConnection(toUid) {
  await log('createConnection:start', { toUid })
  const me = auth.currentUser?.uid
  if (!me) throw new Error('Not signed in')
  if (me === toUid) throw new Error('Cannot connect to yourself')
  const id = pairId(me, toUid)
  const ref = doc(db, 'connections', id)
  try {
    await log('createConnection:setDoc', { id, toUid })
    await setDoc(ref, {
      fromUid: me,
      toUid,
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true })
  } catch (e) {
    // Most likely permission-denied if a reverse pending already exists
    const code = e?.code || ''
    await error('createConnection:error', { code, message: e?.message || String(e) })
    if (code === 'permission-denied') {
      const friendly = 'Запит уже існує або очікує вашого підтвердження на іншому боці.'
      const err = new Error(friendly); err.code = code; throw err
    }
    throw e
  }
  return id
}

// Streams
export function subscribeIncoming(onChange, onError = console.error) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const q = query(collection(db, 'connections'), where('toUid', '==', me), orderBy('createdAt', 'desc'))
  return onSnapshot(q,
    (snap) => onChange(snap?.docs?.map(d => ({ id: d.id, ...d.data() })) ?? []),
    (err) => { onError(err); onChange([]) }
  )
}

export function subscribeOutgoing(onChange, onError = console.error) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const q = query(collection(db, 'connections'), where('fromUid', '==', me), orderBy('createdAt', 'desc'))
  return onSnapshot(q,
    (snap) => onChange(snap?.docs?.map(d => ({ id: d.id, ...d.data() })) ?? []),
    (err) => { onError(err); onChange([]) }
  )
}

// Respond using the exact document ID from the list
export async function respondToConnectionById(connectionIdOrUid, action /* 'accept' | 'decline' */) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const s = String(connectionIdOrUid || '')
  const connectionId = s.includes('_') ? s : pairId(me, s)
  await log('respondToConnectionById:start', { connectionId, action })
  const ref = doc(db, 'connections', String(connectionId))
  const snap = await getDoc(ref)
  if (!snap.exists) {
    await error('respondToConnectionById:not-found', { connectionId })
    const err = new Error('Connection not found'); err.code = 'not-found'; throw err
  }
  const { fromUid, toUid, status } = snap.data()
  if (toUid !== me) throw new Error('Not the recipient')
  if (status !== 'pending') throw new Error('Not pending')
  const newStatus = action === 'accept' ? 'accepted' : 'declined'
  await log('respondToConnectionById:update', { connectionId, newStatus })
  await updateDoc(ref, { status: newStatus, updatedAt: now() })
  if (newStatus === 'accepted') { await ensureSharedDoc(connectionId, { fromUid, toUid }) }
  if (newStatus === 'accepted') { await ensureSharedDoc(connectionId, { fromUid, toUid }) }
}

// Ensure shared doc exists for a connection (id = connectionId)
export async function ensureSharedDoc(connectionId, participants /* { fromUid, toUid } */) {
  const ref = doc(db, 'sharedDocs', String(connectionId))
  const snap = await getDoc(ref)
  if (!snap.exists) {
    await log('ensureSharedDoc:create', { connectionId })
    await setDoc(ref, {
      fromUid: participants?.fromUid || null,
      toUid: participants?.toUid || null,
      text: '',
      version: 0,
      lastEditedBy: null,
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true })
  } else {
    // ensure participants are set
    const data = snap.data() || {}
    const patch = {}
    if (!data.fromUid && participants?.fromUid) patch.fromUid = participants.fromUid
    if (!data.toUid && participants?.toUid) patch.toUid = participants.toUid
    if (Object.keys(patch).length) {
      await updateDoc(ref, { ...patch, updatedAt: now() })
    }
  }
}


// Backward-compatible aliases for older screens
export const ensureUserBootstrap = ensureUserInUsers
export const searchByEmail = searchUserByEmail


// --- Subscribe to a shared text doc
export function subscribeSharedText(connectionId, onChange, onError = console.error) {
  const ref = doc(db, 'sharedDocs', String(connectionId))
  return onSnapshot(ref, (snap) => {
    if (!snap.exists) { onChange(null); return; }
    onChange({ id: snap.id, ...snap.data() })
  }, onError)
}

// --- Update shared text (simple version bump)
export async function updateSharedText(connectionId, nextText) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const ref = doc(db, 'sharedDocs', String(connectionId))
  const snap = await getDoc(ref)
  if (!snap.exists) throw new Error('Shared doc missing')
  const ver = Number(snap.data()?.version || 0)
  await updateDoc(ref, {
    text: String(nextText ?? ''),
    version: ver + 1,
    lastEditedBy: me,
    updatedAt: now(),
  })
}

// --- Subscribe to all my sharedDocs (merge two queries). Needs composite indexes.
export function subscribeMySharedDocs(onChange, onError = console.error) {
  const me = auth.currentUser?.uid; if (!me) throw new Error('Not signed in')
  const qFrom = query(collection(db, 'sharedDocs'), where('fromUid', '==', me), orderBy('createdAt', 'desc'))
  const qTo = query(collection(db, 'sharedDocs'), where('toUid', '==', me), orderBy('createdAt', 'desc'))

  let dataFrom = [], dataTo = []
  const emit = () => {
    const byId = new Map()
    for (const d of dataFrom) byId.set(d.id, d)
    for (const d of dataTo) byId.set(d.id, d)
    onChange(Array.from(byId.values()).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))
  }

  const u1 = onSnapshot(qFrom, (snap)=>{
    dataFrom = snap?.docs?.map(d=>({id:d.id, ...d.data()})) ?? []
    emit()
  }, (e)=>{ error('subscribeMySharedDocs/from', {code:e?.code, msg:e?.message}); onError(e) })
  const u2 = onSnapshot(qTo, (snap)=>{
    dataTo = snap?.docs?.map(d=>({id:d.id, ...d.data()})) ?? []
    emit()
  }, (e)=>{ error('subscribeMySharedDocs/to', {code:e?.code, msg:e?.message}); onError(e) })
  return () => { try{u1&&u1()}catch{} try{u2&&u2()}catch{} }
}

// Back-compat aliases if your code expects these names
export { ensureSharedDoc as ensureSharedDocForConnection }