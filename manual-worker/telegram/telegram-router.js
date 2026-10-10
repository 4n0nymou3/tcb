import { loadTelegramConfig } from "./core/telegram-config.js";
import { routeRoot, mintBootstrapToken, bootstrapExpired } from "./core/bridge.js";
import { renderBridgeResponse } from "./core/bridge-page.js";
import { verifyToken, TOKEN_KIND, MalformedTokenError } from "./core/token.js";
import { doSeedFromBootstrapNonce, doNameFromSeed } from "./core/do-routing.js";
import { FrameDecoder, FRAME, encodeWelcome } from "./core/protocol-v3.js";

const CREATE_BODY_MAX_BYTES = 64;
const DIAG_BODY_MAX_BYTES = 512;
const DIAG_STEPS = new Set([
  "page-start", "script-error", "branch", "init-sent", "native-msg", "first-binary", "create-start", "create-status",
  "create-error", "ws-attempt", "ws-open", "ws-error", "ws-close", "welcome-forwarded", "fail", "pagehide"
]);
const DIAG_ENUMS = {
  hash: new Set(["none", "android-ok", "other"]),
  bridgeObj: new Set(["undefined", "object", "function", "string", "number", "boolean"]),
  ready: new Set(["loading", "interactive", "complete"]),
  p: new Set(["android", "loopback", "none"]),
  rep: new Set(["ArrayBuffer", "string", "object", "null", "undefined", "number", "boolean", "function", "bigint", "symbol"]),
  r: new Set(["unknown", "ws-message-shape", "send-not-open", "send-error", "split-frames", "create-failed", "ws-closed"])
};
const DIAG_BOOLS = ["postFn", "mode", "tok"];
const DIAG_INTS = ["len", "status", "code", "l", "c"];

function diagLog(cfg, fields) {
  if (!cfg.diag) return;
  console.log(JSON.stringify({ evt: "tg-diag", t: Date.now(), ...fields }));
}

function sanitizeDiag(raw) {
  if (!raw || typeof raw !== "object" || !DIAG_STEPS.has(raw.s)) return null;
  const out = { s: raw.s };
  for (const [key, allowed] of Object.entries(DIAG_ENUMS)) {
    if (typeof raw[key] === "string" && allowed.has(raw[key])) out[key] = raw[key];
    else if (key === "rep" && typeof raw[key] === "string" && /^view:[A-Za-z0-9]{1,24}$/.test(raw[key])) out[key] = raw[key];
  }
  for (const key of DIAG_BOOLS) if (typeof raw[key] === "boolean") out[key] = raw[key];
  for (const key of DIAG_INTS) if (Number.isInteger(raw[key]) && raw[key] >= -1 && raw[key] < 1e9) out[key] = raw[key];
  for (const key of ["tag", "ct", "n"]) if (typeof raw[key] === "string" && /^[A-Za-z-]{1,40}$/.test(raw[key])) out[key] = raw[key];
  return out;
}

async function handleDiag(request, cfg) {
  if (!cfg.diag || request.method !== "POST") return null;
  const text = await request.text();
  if (text.length <= DIAG_BODY_MAX_BYTES) {
    try {
      const fields = sanitizeDiag(JSON.parse(text));
      if (fields) diagLog(cfg, { src: "page", ...fields });
    } catch {}
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function webViewHint(request) {
  const xrw = request.headers.get("x-requested-with") || "";
  return /^[A-Za-z0-9._]{1,60}$/.test(xrw) ? xrw : "";
}

function localNotFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

function bearerOf(request) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : null;
}

async function tryVerify(token, kind, signingKey) {
  try {
    return await verifyToken(token, kind, signingKey);
  } catch (err) {
    if (err instanceof MalformedTokenError) return null;
    throw err;
  }
}

function sessionStub(env, doName) {
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(doName));
}

function mapDoError(json) {
  if (json.errorType === "NotFoundError") return localNotFound();
  if (json.errorType === "BodyMismatchError") return new Response(null, { status: 409, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 500 });
}

async function isSingleHello(bytes) {
  try {
    const decoder = new FrameDecoder("relay-inbound");
    decoder.push(bytes);
    const frames = [...decoder.drain()];
    return frames.length === 1 && frames[0].type === FRAME.HELLO;
  } catch {
    return false;
  }
}

async function handleCreate(request, env, cfg) {
  const token = bearerOf(request);
  if (!token) return null;
  const verified = await tryVerify(token, TOKEN_KIND.BOOTSTRAP, cfg.signingKey);
  if (!verified) return null;
  if (bootstrapExpired(verified.nonce)) return localNotFound();
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > CREATE_BODY_MAX_BYTES) return new Response(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  if (!(await isSingleHello(body))) return localNotFound();
  const seed = await doSeedFromBootstrapNonce(verified.nonce);
  const stub = sessionStub(env, doNameFromSeed(seed));
  const reply = await stub.fetch(new Request("https://session-do/create", { method: "POST", body }));
  const json = await reply.json();
  if (!json.ok) {
    diagLog(cfg, { src: "server", s: "create-do-error", e: String(json.errorType || "").replace(/[^A-Za-z]/g, "").slice(0, 40) });
    return mapDoError(json);
  }
  diagLog(cfg, { src: "server", s: "create-ok" });
  return new Response(encodeWelcome(), {
    status: 200,
    headers: {
      "X-Session-Token": json.result,
      "X-Down-Cursor": "0",
      "X-Carrier-Mode": "websocket",
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store"
    }
  });
}

async function handleDelete(request, env, cfg) {
  const token = bearerOf(request);
  if (!token) return null;
  const verified = await tryVerify(token, TOKEN_KIND.SESSION, cfg.signingKey);
  if (!verified) return null;
  const stub = sessionStub(env, doNameFromSeed(verified.nonce));
  const reply = await stub.fetch(new Request("https://session-do/delete", { method: "DELETE" }));
  const json = await reply.json();
  if (!json.ok) return mapDoError(json);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

async function handleWebSocket(request, env, cfg) {
  if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return null;
  const first = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",")[0].trim();
  const match = /^tproxy-v1\.([A-Za-z0-9_-]{43})$/.exec(first);
  if (!match) return null;
  const verified = await tryVerify(match[1], TOKEN_KIND.SESSION, cfg.signingKey);
  if (!verified) return null;
  const response = await sessionStub(env, doNameFromSeed(verified.nonce)).fetch(request);
  diagLog(cfg, { src: "server", s: "ws-upgrade", status: response.status });
  return response;
}

async function handleTelegram(request, env, cfg) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.searchParams.has("bridge")) {
    const route = await routeRoot(request, cfg);
    if (route === "bridge") {
      diagLog(cfg, { src: "server", s: "bridge-served", app: webViewHint(request) });
      return renderBridgeResponse(cfg.hostname, await mintBootstrapToken(cfg.signingKey), cfg.diag);
    }
    if (route === "local404") return localNotFound();
    return null;
  }
  if (url.pathname === "/api/v1/diag") return handleDiag(request, cfg);
  if (url.pathname === "/api/v1/session") {
    if (request.method === "POST") return handleCreate(request, env, cfg);
    if (request.method === "DELETE") return handleDelete(request, env, cfg);
    return null;
  }
  if (url.pathname === "/api/v1/ws") return handleWebSocket(request, env, cfg);
  return null;
}

async function handleTelegramWithEnv(request, env) {
  const cfg = await loadTelegramConfig(env);
  if (!cfg) return null;
  return handleTelegram(request, env, cfg);
}

export { handleTelegram, handleTelegramWithEnv };
