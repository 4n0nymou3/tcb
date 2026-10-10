import { deriveCapability, timingSafeEqual } from "./capability.js";
import { mintTokenWithNonce, TOKEN_KIND } from "./token.js";

const CANONICAL_CAPABILITY_RE = /^[A-Za-z0-9_-]{43}$/;
const BOOTSTRAP_LIFETIME_MS = 2 * 60 * 1000;

async function routeRoot(request, cfg) {
  const url = new URL(request.url);
  const params = url.searchParams.getAll("bridge");
  if (params.length === 0) return "public";
  const candidate = params[0];
  if (!CANONICAL_CAPABILITY_RE.test(candidate)) return "public";
  const expected = await deriveCapability(cfg.hostname, cfg.secretHex);
  if (!timingSafeEqual(candidate, expected)) return "public";
  const canonical = url.pathname === "/" && params.length === 1 && [...url.searchParams.keys()].length === 1;
  return canonical ? "bridge" : "local404";
}

async function mintBootstrapToken(signingKey, nowMs = Date.now()) {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  new DataView(nonce.buffer).setUint32(0, Math.floor(nowMs / 1000), false);
  return mintTokenWithNonce(TOKEN_KIND.BOOTSTRAP, nonce, signingKey);
}

function bootstrapAgeMs(nonce, nowMs = Date.now()) {
  const issued = new DataView(nonce.buffer, nonce.byteOffset, 4).getUint32(0, false) * 1000;
  return nowMs - issued;
}

function bootstrapExpired(nonce, nowMs = Date.now()) {
  const age = bootstrapAgeMs(nonce, nowMs);
  return age > BOOTSTRAP_LIFETIME_MS || age < -BOOTSTRAP_LIFETIME_MS;
}

export { routeRoot, mintBootstrapToken, bootstrapExpired, BOOTSTRAP_LIFETIME_MS };