import { Session, SESSION_STATE, STREAM_STATE } from "./core/session.js";
import { FrameDecoder, MalformedFrameError, DirectionViolationError, FRAME } from "./core/protocol-v3.js";
import { DcConfigCache } from "./core/dc-config.js";
import { connectTcp } from "./tcp-adapter.js";
import { mintTokenWithNonce, TOKEN_KIND } from "./core/token.js";
import { loadTelegramConfig } from "./core/telegram-config.js";

const REATTACH_WINDOW_MS = 2 * 60 * 1000;

let sharedDcCache = null;
function getDcCache(env) {
  if (sharedDcCache) return sharedDcCache;
  if (env.TELEGRAM_TEST_FIXED_DC_ADDR) {
    const fixed = env.TELEGRAM_TEST_FIXED_DC_ADDR;
    sharedDcCache = { resolveAll: async () => [fixed] };
  } else {
    sharedDcCache = new DcConfigCache();
  }
  return sharedDcCache;
}

function jsonOk(result) {
  return Response.json({ ok: true, result });
}

function jsonErr(errorType, message) {
  return Response.json({ ok: false, errorType, message });
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex;
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

class SessionDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.cfg = null;
    this.session = null;
    this.decoder = null;
    this.protoState = null;
    this._ready = this._restore();
  }

  async _restore() {
    this.cfg = await loadTelegramConfig(this.env);
    const stored = await this.ctx.storage.get(["protoState", "hadActiveStream"]);
    this.protoState = stored.get("protoState") ?? null;
    const hadActiveStream = stored.get("hadActiveStream") ?? false;
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0 || !this.cfg) return;
    const ws = sockets[0];
    if (hadActiveStream) {
      ws.close(4040, "relay-state-lost-reconnect");
      await this.ctx.storage.delete("hadActiveStream");
      if (this.protoState) {
        this.protoState.wsAttached = false;
        this.protoState.detachedAt = Date.now();
        await this._saveProtoState();
      }
      return;
    }
    if (this.protoState && !this.protoState.deleted) this._initSessionEngine();
  }

  async _saveProtoState() {
    await this.ctx.storage.put("protoState", this.protoState);
  }

  _unusable() {
    const p = this.protoState;
    if (!p || p.deleted) return true;
    if (p.wsAttached) return false;
    const reference = p.detachedAt ?? p.createdAt;
    return Date.now() - reference > REATTACH_WINDOW_MS;
  }

  _initSessionEngine() {
    this.decoder = new FrameDecoder("relay-inbound");
    this.session = new Session(
      (bytes) => {
        const ws = this.ctx.getWebSockets()[0];
        if (ws) ws.send(bytes);
      },
      (code, reason) => {
        const ws = this.ctx.getWebSockets()[0];
        if (ws) ws.close(code, reason);
      },
      connectTcp,
      {
        secret: this.cfg.keyBytes,
        dcResolver: getDcCache(this.env),
        log: (msg) => {
          if (this.env.TELEGRAM_DEBUG === "1") console.log(JSON.stringify({ t: Date.now(), msg }));
        },
        hooks: {
          onSessionStateChange: (state) => {
            if (this.protoState) {
              this.protoState.sessionState = state;
              this._saveProtoState();
            }
          },
          onStreamStateChange: (streamId, state) => {
            if (state === STREAM_STATE.CONNECTING) {
              this.ctx.storage.put("hadActiveStream", true);
            } else if (state === STREAM_STATE.CLOSED && this.session && this.session.streamCount() === 0) {
              this.ctx.storage.delete("hadActiveStream");
            }
          }
        }
      }
    );
    if (this.protoState?.sessionState) this.session.state = this.protoState.sessionState;
  }

  async fetch(request) {
    await this._ready;
    if (!this.cfg) return new Response(null, { status: 404 });
    if (request.headers.get("Upgrade") === "websocket") return this._handleWsUpgrade(request);
    if (request.method === "POST") return this._handleCreate(request);
    if (request.method === "DELETE") return this._handleDelete();
    return new Response(null, { status: 404 });
  }

  async _handleCreate(request) {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (!(await isSingleHello(rawBody))) return jsonErr("NotFoundError", "create body must be exactly one HELLO frame");
    const bodyHashHex = await sha256Hex(rawBody);
    if (this.protoState) {
      if (this._unusable()) return jsonErr("NotFoundError", "session expired or deleted");
      if (this.protoState.bootstrapBodyHashHex === bodyHashHex) return jsonOk(this.protoState.sessionToken);
      return jsonErr("BodyMismatchError", "bootstrap already consumed with a different body");
    }
    const seedHex = this.ctx.id.name;
    if (!seedHex) return jsonErr("Error", "missing durable object name");
    const sessionToken = await mintTokenWithNonce(TOKEN_KIND.SESSION, hexToBytes(seedHex), this.cfg.signingKey);
    this.protoState = {
      createdAt: Date.now(),
      detachedAt: null,
      deleted: false,
      bootstrapBodyHashHex: bodyHashHex,
      sessionToken,
      wsAttached: false,
      sessionState: SESSION_STATE.NEW
    };
    this._initSessionEngine();
    this.session.onFrame({ type: FRAME.HELLO, streamId: 0, payload: new Uint8Array([1]) });
    this.session.markWelcomeSent();
    await this._saveProtoState();
    return jsonOk(sessionToken);
  }

  async _handleWsUpgrade(request) {
    if (this._unusable()) return new Response(null, { status: 404 });
    if (this.protoState.wsAttached) return new Response(null, { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    this.protoState.wsAttached = true;
    this.protoState.detachedAt = null;
    await this._saveProtoState();
    if (!this.session) this._initSessionEngine();
    const requested = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",")[0].trim();
    const headers = requested ? { "Sec-WebSocket-Protocol": requested } : undefined;
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws, message) {
    if (typeof message === "string") {
      ws.close(4002, "text-message-not-allowed");
      return;
    }
    await this._ready;
    if (!this.session) return;
    this.decoder.push(new Uint8Array(message));
    try {
      for (const frame of this.decoder.drain()) this.session.onFrame(frame);
    } catch (err) {
      if (err instanceof MalformedFrameError) {
        ws.close(4003, "malformed-frame");
        return;
      }
      if (err instanceof DirectionViolationError) {
        ws.close(4004, "direction-violation");
        return;
      }
      throw err;
    }
  }

  async webSocketClose() {
    await this._ready;
    await this.session?.onSessionClose();
    await this.ctx.storage.delete("hadActiveStream");
    if (this.protoState) {
      this.protoState.wsAttached = false;
      this.protoState.detachedAt = Date.now();
      await this._saveProtoState();
    }
  }

  async webSocketError() {
    await this.webSocketClose();
  }

  async _handleDelete() {
    if (!this.protoState) return jsonErr("NotFoundError", "no such session");
    for (const ws of this.ctx.getWebSockets()) ws.close(4030, "session-deleted");
    await this.session?.onSessionClose();
    this.protoState.deleted = true;
    this.protoState.wsAttached = false;
    await this._saveProtoState();
    await this.ctx.storage.delete("hadActiveStream");
    return jsonOk(null);
  }
}

export { SessionDO };
