/**
 * Encrypted localStorage wrapper using Web Crypto API.
 *
 * Provides AES-GCM encryption for sensitive values stored in the browser.
 * The encryption key is derived from a stable origin-based fingerprint
 * using PBKDF2, so the same browser+origin always produces the same key.
 *
 * Graceful migration: if a value cannot be decrypted (e.g., it was stored
 * before encryption was enabled), the raw value is returned and
 * transparently re-encrypted on the next write.
 */

const SALT_KEY = "openclaw.secure-storage.salt";
const KEY_ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_KEY);
  if (existing) {
    return Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
  return salt;
}

/** Derive a stable encryption key from origin + user-agent. */
async function deriveKey(): Promise<CryptoKey> {
  const fingerprint = `${location.origin}|${navigator.userAgent}`;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(fingerprint),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const salt = getOrCreateSalt();
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: KEY_ALGO, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await deriveKey();
  }
  return cachedKey;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: KEY_ALGO, iv }, key, encoded);
  // Store as: base64(iv) + "." + base64(ciphertext)
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `enc:${ivB64}.${ctB64}`;
}

async function decrypt(stored: string): Promise<string> {
  if (!stored.startsWith("enc:")) {
    // Not encrypted – return raw value (migration path)
    return stored;
  }
  const key = await getKey();
  const [ivB64, ctB64] = stored.slice(4).split(".");
  if (!ivB64 || !ctB64) {
    throw new Error("malformed encrypted value");
  }
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const plainBuffer = await crypto.subtle.decrypt({ name: KEY_ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuffer);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a value encrypted in localStorage.
 */
export async function secureSet(key: string, value: string): Promise<void> {
  const encrypted = await encrypt(value);
  localStorage.setItem(key, encrypted);
}

/**
 * Read and decrypt a value from localStorage.
 * Returns null if the key doesn't exist.
 * If the value cannot be decrypted, returns the raw value (migration).
 */
export async function secureGet(key: string): Promise<string | null> {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return null;
  }
  try {
    return await decrypt(raw);
  } catch {
    // Graceful migration: return raw unencrypted value
    return raw;
  }
}

/**
 * Remove a value from localStorage.
 */
export function secureRemove(key: string): void {
  localStorage.removeItem(key);
}
