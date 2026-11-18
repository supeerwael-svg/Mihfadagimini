/**
 * Cryptographic & text utilities using Web Crypto API.
 * Passwords are hashed using PBKDF2-SHA256 with a 16-byte random salt.
 */

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

export function generateSaltHex(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPasswordPBKDF2(
  password: string,
  saltHex: string,
  iterations = 100_000
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBytes = hexToBytes(saltHex);
  const saltBuffer = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength
  ) as ArrayBuffer;
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export async function verifyPasswordPBKDF2(
  password: string,
  saltHex: string,
  expectedHashHex: string
): Promise<boolean> {
  const computed = await hashPasswordPBKDF2(password, saltHex);
  if (computed.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Normalizes Arabic & French/Latin text for diacritic-insensitive search:
 * - Preserves base Arabic letters first, then strips French/Latin combining diacritics
 * - Removes Arabic tashkeel (harakat) and tatweel
 * - Normalizes alef variants (أ إ آ ٱ -> ا)
 * - Normalizes alef maksura (ى -> ي) and teh marbuta (ة -> ه)
 */
export function normalizeSearchText(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/œ/g, 'oe')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function computeBlobSha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return bytesToHex(new Uint8Array(digest));
  }
  // Lightweight fallback checksum if subtle unavailable
  const view = new Uint8Array(buf);
  let h1 = 0x811c9dc5;
  for (let i = 0; i < view.length; i++) {
    h1 ^= view[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Matches a normalized query token against normalized target text with:
 * - exact substring / prefix match
 * - 1-edit fuzzy typo tolerance on word tokens >= 4 chars (2-edit on >= 7 chars)
 */
export function fuzzyTokenMatch(normalizedTarget: string, normalizedToken: string): boolean {
  if (!normalizedToken) return true;
  if (!normalizedTarget) return false;
  if (normalizedTarget.includes(normalizedToken)) return true;
  if (normalizedToken.length < 4) return false;
  const maxDist = normalizedToken.length >= 7 ? 2 : 1;
  const words = normalizedTarget.split(/[\s.,;:!?()[\]{}"'«»/\\_-]+/);
  for (const w of words) {
    if (!w) continue;
    if (w.startsWith(normalizedToken)) return true;
    if (Math.abs(w.length - normalizedToken.length) <= maxDist) {
      if (levenshteinDistance(w, normalizedToken) <= maxDist) return true;
    }
  }
  return false;
}

export function extractSnippet(rawText: string, queryTerm: string, maxLen = 150): string {
  if (!rawText) return '';
  const normQuery = normalizeSearchText(queryTerm);
  const cleanRaw = rawText.replace(/\s+/g, ' ').trim();
  if (!normQuery) return cleanRaw.slice(0, maxLen);

  // Find approximate position by sliding words/chars
  const lowerRaw = cleanRaw.toLowerCase();
  let hitIdx = lowerRaw.indexOf(queryTerm.toLowerCase());
  if (hitIdx === -1) {
    // Search normalized chunk alignment via word index
    const words = cleanRaw.split(' ');
    let charPos = 0;
    for (const w of words) {
      if (normalizeSearchText(w).includes(normQuery)) {
        hitIdx = charPos;
        break;
      }
      charPos += w.length + 1;
    }
  }
  if (hitIdx === -1) return cleanRaw.slice(0, maxLen);
  const start = Math.max(0, hitIdx - 45);
  const end = Math.min(cleanRaw.length, start + maxLen);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < cleanRaw.length ? '...' : '';
  return `${prefix}${cleanRaw.slice(start, end)}${suffix}`;
}
