import { FRAME, encodeData, encodeClose, encodeWindow, MAX_RELAY_DATA_CHUNK } from "./protocol-v3.js";
import { serverHandshake, dcHandshake, CtrStream } from "./obfuscated2.js";
import { GLOBAL_LIMITS } from "./limits.js";
const SESSION_STATE = Object.freeze({
  NEW: "NEW",
  HELLO_RECEIVED: "HELLO_RECEIVED",
  WELCOME_SENT: "WELCOME_SENT"
});
const STREAM_STATE = Object.freeze({
  NEW: "NEW",
  OPENING: "OPENING",
  WAITING_HEADER: "WAITING_HEADER",
  CONNECTING: "CONNECTING",
  RELAYING: "RELAYING",
  CLOSING: "CLOSING",
  CLOSED: "CLOSED"
});
class ProtocolStateError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "ProtocolStateError";
  }
}
const OBFUSCATED2_HEADER_LEN = 64;
const INITIAL_STREAM_CREDIT = GLOBAL_LIMITS.initialStreamWindowBytes;
const MAX_CONCURRENT_STREAMS_DEFAULT = GLOBAL_LIMITS.logicalStreamsPerSession;
const TOMBSTONE_CAPACITY = GLOBAL_LIMITS.recentlyClosedStreamIdsPerSession;
class Stream {
  constructor(streamId, initialCredit) {
    this.id = streamId;
    this.state = STREAM_STATE.NEW;
    this.q = Promise.resolve();
    this.headerBuf = new Uint8Array(0);
    this.hs = null;
    this.clientRead = null;
    this.clientWrite = null;
    this.dcSend = null;
    this.dcRecv = null;
    this.socket = null;
    this.writer = null;
    this.creditToClient = initialCredit;
    this.creditToBackend = initialCredit;
    this.windowWaiters = [];
    this.pump = null;
  }
  setState(next, log, hooks) {
    log?.(`stream=${this.id} ${this.state} -> ${next}`);
    this.state = next;
    hooks?.onStreamStateChange?.(this.id, next);
  }
  enqueue(task) {
    this.q = this.q.then(task, task);
    return this.q;
  }
}
class BoundedIdSet {
  constructor(capacity) {
    this._capacity = capacity;
    this._set = new Set();
    this._order = [];
  }
  has(id) {
    return this._set.has(id);
  }
  add(id) {
    if (this._set.has(id)) return;
    this._set.add(id);
    this._order.push(id);
    if (this._order.length > this._capacity) {
      const evicted = this._order.shift();
      this._set.delete(evicted);
    }
  }
  get size() {
    return this._set.size;
  }
}
class Session {
  constructor(sendToClient, closeClient, connectFn, opts = {}) {
    this._send = sendToClient;
    this._closeClient = closeClient;
    this._connect = connectFn;
    this._secret = opts.secret ?? null;
    this._dcResolver = opts.dcResolver;
    if (!this._dcResolver) throw new Error("Session requires opts.dcResolver (see dc-config.js DcConfigCache)");
    this._maxStreams = opts.maxStreams ?? MAX_CONCURRENT_STREAMS_DEFAULT;
    this._initialStreamCredit = opts.initialStreamCredit ?? INITIAL_STREAM_CREDIT;
    this._log = opts.log ?? (() => {
    });
    this._hooks = opts.hooks ?? {};
    this._streams = new Map();
    this._usedStreamIds = new BoundedIdSet(TOMBSTONE_CAPACITY);
    this.state = SESSION_STATE.NEW;
  }
  streamCount() {
    return this._streams.size;
  }
  onFrame(frame) {
    switch (frame.type) {
      case FRAME.HELLO:
        return this._onHello();
      case FRAME.OPEN:
        this._onOpen(frame.streamId);
        return null;
      case FRAME.DATA:
        this._onData(frame.streamId, frame.payload);
        return null;
      case FRAME.WINDOW:
        this._onWindow(frame.streamId, frame.payload);
        return null;
      case FRAME.CLOSE:
        this._onClose(frame.streamId);
        return null;
      case FRAME.PONG:
        this._log("PONG received (v1 never emits shared-frame PING, so this is a no-op)");
        return null;
      default:
        return null;
    }
  }
  _onHello() {
    if (this.state !== SESSION_STATE.NEW) {
      this._log(`HELLO received in state ${this.state} -> protocol violation`);
      this._closeClient(4010, "unexpected-hello");
      return null;
    }
    this.state = SESSION_STATE.HELLO_RECEIVED;
    this._hooks.onSessionStateChange?.(this.state);
    return "send-welcome";
  }
  markWelcomeSent() {
    if (this.state !== SESSION_STATE.HELLO_RECEIVED) {
      throw new ProtocolStateError(`markWelcomeSent called from state ${this.state}`);
    }
    this.state = SESSION_STATE.WELCOME_SENT;
    this._hooks.onSessionStateChange?.(this.state);
  }
  _onOpen(streamId) {
    if (this.state !== SESSION_STATE.WELCOME_SENT) {
      this._log(`OPEN before WELCOME (state=${this.state}) -> protocol violation`);
      this._closeClient(4011, "open-before-welcome");
      return;
    }
    if (this._usedStreamIds.has(streamId)) {
      this._log(`OPEN reuses stream_id ${streamId} -> protocol violation`);
      this._closeClient(4012, "stream-id-reused");
      return;
    }
    if (this._streams.size >= this._maxStreams) {
      this._log(`stream limit (${this._maxStreams}) reached, rejecting OPEN stream=${streamId}`);
      this._usedStreamIds.add(streamId);
      this._send(encodeClose(streamId));
      return;
    }
    this._usedStreamIds.add(streamId);
    const st = new Stream(streamId, this._initialStreamCredit);
    this._streams.set(streamId, st);
    st.setState(STREAM_STATE.OPENING, this._log, this._hooks);
    st.setState(STREAM_STATE.WAITING_HEADER, this._log, this._hooks);
  }
  _onData(streamId, payload) {
    const st = this._streams.get(streamId);
    if (!st) {
      this._log(`DATA for unknown/closed stream ${streamId} ignored`);
      return;
    }
    if (st.state === STREAM_STATE.CLOSING || st.state === STREAM_STATE.CLOSED) return;
    if (payload.length > st.creditToBackend) {
      this._log(`stream=${streamId} DATA of ${payload.length} exceeds remaining credit ${st.creditToBackend} -> closing`);
      this._teardown(st, true);
      return;
    }
    st.creditToBackend -= payload.length;
    st.enqueue(() => this._handleData(st, payload));
  }
  async _handleData(st, payload) {
    if (st.state === STREAM_STATE.CLOSED || st.state === STREAM_STATE.CLOSING) return;
    if (st.state === STREAM_STATE.WAITING_HEADER || st.state === STREAM_STATE.CONNECTING) {
      st.headerBuf = concat(st.headerBuf, payload);
      if (st.headerBuf.length < OBFUSCATED2_HEADER_LEN) return;
      if (st.state === STREAM_STATE.WAITING_HEADER) {
        const header = st.headerBuf.slice(0, OBFUSCATED2_HEADER_LEN);
        const rest = st.headerBuf.slice(OBFUSCATED2_HEADER_LEN);
        st.headerBuf = rest;
        st.setState(STREAM_STATE.CONNECTING, this._log, this._hooks);
        let hs;
        try {
          hs = await serverHandshake(header, this._secret);
        } catch (err) {
          this._log(`stream=${st.id} handshake failed: ${err.message}`);
          this._teardown(st, true);
          return;
        }
        st.hs = hs;
        st.clientRead = new CtrStream(hs.readKey, hs.readIv, OBFUSCATED2_HEADER_LEN);
        st.clientWrite = new CtrStream(hs.writeKey, hs.writeIv, 0);
        let candidates;
        try {
          candidates = this._dcResolver.resolveAll ? await this._dcResolver.resolveAll(hs.targetDc) : [await this._dcResolver.resolve(hs.targetDc)];
        } catch (err) {
          this._log(`stream=${st.id} DC ${hs.targetDc} unresolvable: ${err.message}`);
          this._teardown(st, true);
          return;
        }
        let socket = null;
        for (const addr of candidates) {
          const cut = addr.lastIndexOf(":");
          const host = addr.slice(0, cut).replace(/^\[|\]$/g, "");
          try {
            socket = await this._connect(host, Number(addr.slice(cut + 1)));
            break;
          } catch (err) {
            this._log(`stream=${st.id} connect to DC ${hs.targetDc} (${addr}) failed: ${err.message}`);
          }
        }
        if (!socket) {
          this._teardown(st, true);
          return;
        }
        if (st.state === STREAM_STATE.CLOSED || st.state === STREAM_STATE.CLOSING) {
          socket.close?.().catch(() => {
          });
          return;
        }
        st.socket = socket;
        st.writer = socket.writable.getWriter();
        try {
          const dc = await dcHandshake(hs.targetDc, hs.tag);
          st.dcSend = dc.send;
          st.dcRecv = dc.recv;
          await st.writer.write(dc.header);
        } catch (err) {
          this._log(`stream=${st.id} DC handshake write failed: ${err.message}`);
          this._teardown(st, true);
          return;
        }
        st.setState(STREAM_STATE.RELAYING, this._log, this._hooks);
        st.pump = this._pumpBackendToClient(st).catch((err) => this._log(`stream=${st.id} pump ended: ${err.message}`));
        st.pump.then(() => st.enqueue(() => this._onBackendClosed(st)));
        socket.closed.catch(() => {
        }).then(() => st.pump).then(() => st.enqueue(() => this._onBackendClosed(st)));
      }
      if (st.headerBuf.length > 0 && st.state === STREAM_STATE.RELAYING) {
        const overflow = st.headerBuf;
        st.headerBuf = new Uint8Array(0);
        await this._relayClientBytesToBackend(st, overflow);
      }
      return;
    }
    if (st.state === STREAM_STATE.RELAYING) {
      await this._relayClientBytesToBackend(st, payload);
    }
  }
  async _relayClientBytesToBackend(st, bytes) {
    try {
      const plain = await st.clientRead.process(bytes);
      const toDc = await st.dcSend.process(plain);
      await st.writer.write(toDc);
      if (st.state === STREAM_STATE.CLOSED || st.state === STREAM_STATE.CLOSING) return;
      this._send(encodeWindow(st.id, bytes.length));
      st.creditToBackend += bytes.length;
    } catch (err) {
      this._log(`stream=${st.id} write to backend failed: ${err.message}`);
      this._teardown(st, true);
    }
  }
  async _pumpBackendToClient(st) {
    const reader = st.socket.readable.getReader();
    try {
      for (; ; ) {
        const { value, done } = await reader.read();
        if (done) return;
        let chunk = await st.dcRecv.process(value);
        while (chunk.length > 0) {
          while (st.creditToClient <= 0) {
            await new Promise((resolve) => st.windowWaiters.push(resolve));
            if (st.state === STREAM_STATE.CLOSED || st.state === STREAM_STATE.CLOSING) return;
          }
          const take = Math.min(chunk.length, st.creditToClient, MAX_RELAY_DATA_CHUNK);
          const piece = chunk.slice(0, take);
          chunk = chunk.slice(take);
          const cipher = await st.clientWrite.process(piece);
          st.creditToClient -= take;
          this._send(encodeData(st.id, cipher));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  _onWindow(streamId, payload) {
    const st = this._streams.get(streamId);
    if (!st) return;
    const delta = new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false);
    st.creditToClient += delta;
    const waiters = st.windowWaiters;
    st.windowWaiters = [];
    for (const w of waiters) w();
  }
  _onClose(streamId) {
    const st = this._streams.get(streamId);
    if (!st) return;
    st.enqueue(() => this._teardown(st, false));
  }
  async _onBackendClosed(st) {
    if (st.state === STREAM_STATE.CLOSED || st.state === STREAM_STATE.CLOSING) return;
    this._log(`stream=${st.id} backend TCP closed -> CLOSE`);
    await this._teardown(st, true);
  }
  async _teardown(st, notifyClient) {
    if (st.state === STREAM_STATE.CLOSED || st.state === STREAM_STATE.CLOSING) return;
    st.setState(STREAM_STATE.CLOSING, this._log, this._hooks);
    const waiters = st.windowWaiters;
    st.windowWaiters = [];
    for (const w of waiters) w();
    try {
      if (st.writer) await st.writer.abort("stream-closed").catch(() => {
      });
      if (st.socket) await st.socket.close?.().catch?.(() => {
      });
    } finally {
      st.setState(STREAM_STATE.CLOSED, this._log, this._hooks);
      this._streams.delete(st.id);
      if (notifyClient) this._send(encodeClose(st.id));
    }
  }
  async onSessionClose() {
    this._log(`session closing, tearing down ${this._streams.size} stream(s)`);
    const all = [...this._streams.values()];
    await Promise.all(all.map((st) => st.enqueue(() => this._teardown(st, false))));
  }
}
function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
export {
  INITIAL_STREAM_CREDIT,
  MAX_CONCURRENT_STREAMS_DEFAULT,
  ProtocolStateError,
  SESSION_STATE,
  STREAM_STATE,
  Session
};