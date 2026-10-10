const subtle = globalThis.crypto.subtle;
function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new RangeError("odd-length hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function base64UrlNoPad(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function deriveCapability(hostname, secretHex) {
  const secret = hexToBytes(secretHex);
  const context = new TextEncoder().encode("tdesktop-web-proxy-bridge-v1\n" + hostname);
  const key = await subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", key, context));
  return base64UrlNoPad(mac);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export {
  deriveCapability,
  timingSafeEqual
};
