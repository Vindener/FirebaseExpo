# Firebase Expo Collaboration Demo
A React Native (Expo + Dev Client) demo that shows **user search by email**, **connection requests**, and **real-time collaborative editing** using **Firebase Auth** with production-grade **Security Rules**.  
No Cloud Functions required — access control for personal docs is enforced entirely by Rules + a small **“claim after accept”** step.

---

## Features

- **Auth:** Email/Password or Google (via Firebase Auth).
- **User bootstrap:** on sign-in, creates/updates `users/{uid}` with `emailLower` (for search).
- **Search by email (case-insensitive):** via `users` collection and `emailLower`.
- **Connections:** `connections/{id}` with `pending/accepted/declined/blocked`; each side can accept/decline.
- **Shared docs (pair-based):** `sharedDocs/{id}` for 1:1 connections (simple demo).
- **Personal docs (owner-first):** `docs/{docId}` with:
  - `owners: string[]`
  - `editorsMap: { [uid]: true }`  
  - **Request-based sharing:** `docShares/{shareId}` (`pending → accepted|declined|cancelled`)
  - **Claim step:** recipient calls `claimDocShare(shareId)` to add themselves to `editorsMap` (Rules allow this only for the intended recipient of an accepted request).
- **Real-time editing:** `onSnapshot` with optimistic updates and 10s **auto-save**.
- **Owner-only actions:** Share UI and Delete button are visible only to owners.
- **Defensive Rules:** no privilege escalation from the client, validation on changed fields only.

---

## Data Model (simplified)

```
users/{uid}
  displayName
  photoURL
  emailLower

connections/{pairId}         // pairId = sort([fromUid, toUid]).join('_')
  fromUid, toUid
  status: "pending"|"accepted"|"declined"|"blocked"
  createdAt, updatedAt

sharedDocs/{id}              // 1:1 doc tied to a connection
  fromUid, toUid
  text, version, lastEditedBy
  createdAt, updatedAt

docs/{docId}                 // personal doc (owner-first)
  owners: string[]           // full rights
  editorsMap: { [uid]: true }  // co-editors, map form to simplify Rules
  text, version, lastEditedBy
  createdAt, updatedAt

docShares/{shareId}          // request to share a personal doc
  docId, fromUid, toUid
  status: "pending"|"accepted"|"declined"|"cancelled"
  createdAt, updatedAt
```

---

## Security Model (Firestore Rules)

- **`users`**: a user can read, create, update, delete **only** their own profile.
- **`connections`**: only participants can read/update; `create` must have `fromUid == auth.uid`.
- **`sharedDocs`**: participants only; content updates permitted; participants (from/to) immutable.
- **`docs`**:
  - owners/editors can read;
  - **updates**: either (A) normal content updates by participants; or (B) **claim** path — the *recipient* of an **accepted** `docShares/{id}` may add **only themselves** into `editorsMap` (Rules verify `status=='accepted'`, `toUid==auth.uid`, `docId` matches).
  - delete: **owner only**.
- **`docShares`**: only participants can read; `create` only by doc owner with `status='pending'`; recipient can `accept/decline`, owner can `cancel`.

> Tip: We validate **changed keys** on updates (via `changedKeys()`), rather than blocking on the full document shape. This keeps updates robust even if the doc contains extra fields.

---

## Screens & Services

- `PersonalDocEditor` — edit a personal doc (auto-save each 10s, owner list, owner-only **Share** & **Delete**).
- `DocShareRequests` — incoming/outgoing share requests; **Accept** triggers `claimDocShare(...)`.
- `NewPersonalDocButton` — quick “create doc” button.

**Services (JS):**

- `pdocs.js`:
  - `createPersonalDoc()`
  - `subscribeMyPersonalDocs(onChange)` (owners ∪ editors)
  - `subscribePersonalDoc(docId)`, `updatePersonalDoc(docId, text)`
  - `createDocShareRequest(docId, email)`
  - `subscribeIncomingDocShares`, `subscribeOutgoingDocShares`
  - `respondDocShareById(shareId, 'accept'|'decline'|'cancel')`
  - `claimDocShare(shareId)` — *no* pre-read of `/docs`; directly updates `editorsMap.<me>` + `__shareId`
  - `deletePersonalDoc(docId)` — modular or namespaced fallback
  - `readUsersByUids(uids)` — small cache recommended
- `sharing.js`:
  - `ensureUserInUsers()` (aka `ensureUserBootstrap`) to sync `users/{uid}` with `emailLower`
  - `searchUserByEmail(email)` (via `users` query)
  - `createConnection(toUid)`, `respondToConnectionById(connectionId, action)`
  - `subscribeIncoming/Outgoing` connections

---

## Quick Start

1) **Firebase project**
- Enable **Authentication** (Email/Password or Google).
- Create Firestore database (Production or Test mode).
- Copy native configs for RN Firebase (standard RNFirebase setup).  

2) **Install & run**
```bash
# install deps
npm i
# or: yarn

# start Expo (Dev Client)
npx expo start --dev-client
```

3) **Security Rules**
- Paste the project’s `firestore.rules` and deploy

4) **Indexes**
- First run will likely print “Create index…” links in the console for specific queries.

---

## Typical Flows

### A. Personal doc sharing
1. Owner creates a doc (`createPersonalDoc`).
2. Owner opens `PersonalDocEditor`, enters target email → **Send request** (`createDocShareRequest`).
3. Recipient opens `DocShareRequests`, presses **Accept** → client calls:
   - `respondDocShareById(shareId, 'accept')`
   - `claimDocShare(shareId)` → adds `editorsMap.<recipient>=true` (per Rules).
4. Recipient now sees/edits the doc in **My Docs**.

### B. Owner-only UI guards
- `PersonalDocEditor` hides **Share** & **Delete** unless `auth.uid ∈ owners`.

### C. Auto-save
- Editor auto-saves every **10 seconds** if there are local unsaved changes and no other save in progress.

---

## Troubleshooting

- **`permission-denied` on claim**  
  Ensure your Rules contain the **claim** clause for `/docs/{docId}` and you update **only**:
  - `editorsMap.<me> = true`
  - `__shareId = "<shareId>"`
  - `updatedAt = serverTimestamp()`

- **`not-found` on claim**  
  Means the doc is gone — owner deleted it. We surface a friendly message in UI.

- **“Requires an index”**  
  Create the composite index via the provided console link, or pre-define it in `firestore.indexes.json`.

- **Editor can see but not edit**  
  Double-check that:
  - your doc uses **`editorsMap`** (map), not an old `editors` array;
  - your update touches only allowed fields (`text`, `version`, `lastEditedBy`, `updatedAt`);
  - Rules are deployed (`firebase deploy --only firestore:rules`);
  - clear Metro cache: `npx expo start -c`.

- **Old RNFB API warnings**  
  We use the modular-style API provided by `@react-native-firebase/*`. Some warnings mention upcoming v22 changes; they’re harmless in dev. Stick to the `getFirestore()/doc()/updateDoc()` style and you’ll be future-proof.

---

## Project Structure (excerpt)

```
/services
  fb.js                 # tiny adapter for app, auth, db, now(), namespaced fallback
  pdocs.js              # personal docs + docShares flow 
  sharing.js            # users bootstrap, search by email, connections
  logger.js             # centralized logging helpers
  constants.js          # string constants (statuses)

/components
  NewPersonalDocButton.js
  PersonalDocEditor.js  # auto-save, owner list, owner-only share/delete

/screens
  DocShareRequests.js   # accept/decline/cancel + retry-claim

firestore.rules         # security rules (docs/docShares claim logic)
firestore.indexes.json  # optional, or create via console links
```

---


## Notes

- The **claim** model avoids Cloud Functions and keeps ACL changes strictly controlled by Firestore Rules.
- Using a **map** `editorsMap` (not array) makes it easy to validate “recipient adds only themselves”.
- For large scale or multi-recipient workflows, a server component (CF or backend) can centralize audits/notifications — optional.

---

## License

MIT

---
