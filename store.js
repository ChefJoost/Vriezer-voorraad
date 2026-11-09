// Opslaglaag: lokaal (localStorage) of gedeeld via Firebase Firestore.
// Beide leveren dezelfde interface aan app.js.

// Firebase SDK (v10.12.2) is lokaal meegebundeld in vendor/firebase.js,
// zodat de app niet afhankelijk is van een externe CDN en offline werkt.

export function newId(len = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function createStore(firebaseConfig, householdId, onStatus) {
  if (firebaseConfig) {
    try {
      return await createCloudStore(firebaseConfig, householdId, onStatus);
    } catch (err) {
      console.error('Firebase niet beschikbaar, val terug op lokaal', err);
      onStatus?.('error', err);
    }
  }
  return createLocalStore(householdId, onStatus);
}

/* ---------------- Lokaal ---------------- */
function createLocalStore(hid, onStatus) {
  const key = `vv:data:${hid}`;
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key)) || { items: {}, log: {} }; }
    catch { return { items: {}, log: {} }; }
  };
  let state = read();
  const itemSubs = new Set();
  const logSubs = new Set();
  const toList = (obj) => Object.entries(obj).map(([id, d]) => ({ id, ...d }));
  const emit = () => {
    const items = toList(state.items);
    const log = toList(state.log).sort((a, b) => b.at - a.at).slice(0, 300);
    itemSubs.forEach((cb) => cb(items));
    logSubs.forEach((cb) => cb(log));
  };
  const save = () => { localStorage.setItem(key, JSON.stringify(state)); emit(); };
  window.addEventListener('storage', (e) => { if (e.key === key) { state = read(); emit(); } });
  onStatus?.('local');

  return {
    mode: 'local',
    onItems(cb) { itemSubs.add(cb); cb(toList(state.items)); return () => itemSubs.delete(cb); },
    onLog(cb) { logSubs.add(cb); emit(); return () => logSubs.delete(cb); },
    async addItem(data) { const id = newId(); state.items[id] = data; save(); return id; },
    async setItem(id, data) { state.items[id] = data; save(); },
    async updateItem(id, patch) { state.items[id] = { ...state.items[id], ...patch }; save(); },
    async deleteItem(id) { delete state.items[id]; save(); },
    async addLog(entry) { const id = newId(); state.log[id] = entry; save(); return id; },
    async updateLog(id, patch) { if (state.log[id]) { state.log[id] = { ...state.log[id], ...patch }; save(); } },
    async deleteLog(id) { delete state.log[id]; save(); },
  };
}

/* ---------------- Firebase ---------------- */
async function createCloudStore(config, hid, onStatus) {
  const fs = await import('./vendor/firebase.js');
  const auth = fs;
  const app = fs.initializeApp(config);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const a = auth.initializeAuth(app, {
    persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence],
  });
  await auth.signInAnonymously(a);

  const itemsCol = fs.collection(db, 'households', hid, 'items');
  const logCol = fs.collection(db, 'households', hid, 'log');

  const status = (snap) => {
    if (!navigator.onLine) onStatus?.('offline');
    else onStatus?.(snap.metadata.hasPendingWrites ? 'syncing' : 'synced');
  };
  window.addEventListener('online', () => onStatus?.('synced'));
  window.addEventListener('offline', () => onStatus?.('offline'));

  return {
    mode: 'cloud',
    onItems(cb) {
      return fs.onSnapshot(itemsCol, { includeMetadataChanges: true }, (snap) => {
        status(snap);
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (err) => onStatus?.('error', err));
    },
    onLog(cb) {
      const q = fs.query(logCol, fs.orderBy('at', 'desc'), fs.limit(300));
      return fs.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => onStatus?.('error', err));
    },
    async addItem(data) { const ref = fs.doc(itemsCol); fs.setDoc(ref, data); return ref.id; },
    async setItem(id, data) { fs.setDoc(fs.doc(itemsCol, id), data); },
    async updateItem(id, patch) { fs.updateDoc(fs.doc(itemsCol, id), patch); },
    async deleteItem(id) { fs.deleteDoc(fs.doc(itemsCol, id)); },
    async addLog(entry) { const ref = fs.doc(logCol); fs.setDoc(ref, entry); return ref.id; },
    async updateLog(id, patch) { fs.updateDoc(fs.doc(logCol, id), patch); },
    async deleteLog(id) { fs.deleteDoc(fs.doc(logCol, id)); },
  };
}
