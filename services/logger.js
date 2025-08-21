let buffer = [];
let logPath = 'logs/sharing.log';
let initialized = false;

async function getFS() {
  try {
    // dynamic import so build doesn't fail if expo-file-system missing
    const mod = await import('expo-file-system');
    return mod?.default || mod;
  } catch (e) {
    return null;
  }
}

async function ensureInit() {
  if (initialized) return;
  const FS = await getFS();
  if (FS) {
    try {
      const dir = FS.documentDirectory + 'logs/';
      await FS.makeDirectoryAsync(dir, { intermediates: true });
      initialized = true;
    } catch (e) { /* ignore */ }
  }
  initialized = true;
}

export async function log(...args) {
  const line = `[INFO] ${new Date().toISOString()} ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  console.log(line);
  buffer.push(line);
  try {
    await ensureInit();
    const FS = await getFS();
    if (FS?.writeAsStringAsync) {
      const uri = FS.documentDirectory + logPath;
      await FS.writeAsStringAsync(uri, line + "\n", { encoding: FS.EncodingType.UTF8, append: true });
    }
  } catch (e) {
    console.warn('log write failed', e?.message || e);
  }
}

export async function error(...args) {
  const line = `[ERROR] ${new Date().toISOString()} ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  console.error(line);
  buffer.push(line);
  try {
    await ensureInit();
    const FS = await getFS();
    if (FS?.writeAsStringAsync) {
      const uri = FS.documentDirectory + logPath;
      await FS.writeAsStringAsync(uri, line + "\n", { encoding: FS.EncodingType.UTF8, append: true });
    }
  } catch (e) {
    console.warn('log write failed', e?.message || e);
  }
}

export async function getLogFileUri() {
  const FS = await getFS();
  if (!FS) return null;
  return FS.documentDirectory + logPath;
}

export function getBuffer() { return buffer.slice(-500); }

export async function clearLogs() {
  buffer = [];
  const FS = await getFS();
  if (FS?.deleteAsync) {
    try { await FS.deleteAsync(FS.documentDirectory + logPath, { idempotent: true }); } catch {}
  }
}
