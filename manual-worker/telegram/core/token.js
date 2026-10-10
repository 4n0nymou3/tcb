const subtle = globalThis.crypto.subtle;
const DOMAIN = new TextEncoder().encode("tproxy-server-token-v1\0");
const TOKEN_KIND = Object.freeze({ BOOTSTRAP: 1, SESSION: 2 });
class MalformedTokenError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "MalformedTokenError";
  }
}
function base64UrlNoPad(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  if (!/^[A-Za-z0-9_-]+$/.test(str)) throw new MalformedTokenError("non-canonical base64url characters");
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function hmacTruncated16(signingKeyBytes, kind, nonce) {
  const key = await subtle.importKey("raw", signingKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const msg = concat(DOMAIN, new Uint8Array([kind]), nonce);
  const full = new Uint8Array(await subtle.sign("HMAC", key, msg));
  return full.slice(0, 16);
}
function concat(...parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
async function mintToken(kind, signingKeyBytes) {
  const nonce = new Uint8Array(16);
  globalThis.crypto.getRandomValues(nonce);
  return mintTokenWithNonce(kind, nonce, signingKeyBytes);
}
async function mintTokenWithNonce(kind, nonce, signingKeyBytes) {
  if (nonce.length !== 16) throw new RangeError("nonce must be 16 bytes");
  const mac = await hmacTruncated16(signingKeyBytes, kind, nonce);
  const raw = concat(nonce, mac);
  return base64UrlNoPad(raw);
}
async function verifyToken(tokenStr, expectedKind, signingKeyBytes) {
  if (typeof tokenStr !== "string" || tokenStr.length !== 43) {
    throw new MalformedTokenError(`token must be exactly 43 characters, got ${tokenStr?.length ?? "n/a"}`);
  }
  const raw = base64UrlDecode(tokenStr);
  if (raw.length !== 32) throw new MalformedTokenError(`decoded token must be 32 bytes, got ${raw.length}`);
  const nonce = raw.slice(0, 16);
  const mac = raw.slice(16, 32);
  const expectedMac = await hmacTruncated16(signingKeyBytes, expectedKind, nonce);
  if (!timingSafeEqualBytes(mac, expectedMac)) {
    throw new MalformedTokenError("MAC mismatch (tampered, wrong key, or wrong kind)");
  }
  return { nonce, nonceHex: bytesToHex(nonce) };
}
function bytesToHex(bytes) {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
class StaticSigningKeyProvider {
  constructor(keyBytes) {
    if (keyBytes.length !== 32) throw new RangeError("signing key must be 32 bytes");
    this._key = keyBytes;
  }
  async getKey() {
    return this._key;
  }
}
export {
  MalformedTokenError,
  StaticSigningKeyProvider,
  TOKEN_KIND,
  mintToken,
  mintTokenWithNonce,
  verifyToken
};
