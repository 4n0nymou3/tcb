const SECRET_RE = /^(dd)?[0-9a-f]{32}$/;
let cached = null;

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function loadTelegramConfig(env) {
  const secret = typeof env.TELEGRAM_SECRET === "string" ? env.TELEGRAM_SECRET.trim().toLowerCase() : "";
  const hostname = typeof env.TELEGRAM_HOSTNAME === "string" ? env.TELEGRAM_HOSTNAME.trim().toLowerCase() : "";
  if (!SECRET_RE.test(secret) || !hostname) return null;
  const diag = env.TELEGRAM_DIAG === "1" || env.TELEGRAM_DIAG === 1 || env.TELEGRAM_DIAG === true;
  const key = secret + "|" + hostname + "|" + (diag ? "1" : "0");
  if (cached && cached.key === key) return cached.value;
  const secretBytes = hexToBytes(secret);
  const keyBytes = secretBytes.slice(secretBytes.length - 16);
  const hmacKey = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const label = new TextEncoder().encode("tcb-telegram-token-signing-v1");
  const signingKey = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, label));
  const value = { hostname, secretHex: secret, keyBytes, signingKey, padded: secret.length === 34, diag };
  cached = { key, value };
  return value;
}

export { loadTelegramConfig };
