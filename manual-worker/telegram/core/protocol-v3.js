const FRAME = {
  OPEN: 1,
  DATA: 2,
  CLOSE: 3,
  WINDOW: 4,
  PING: 5,
  PONG: 6,
  HELLO: 16,
  WELCOME: 17,
  BYE: 31
};
const FRAME_NAMES = Object.fromEntries(Object.entries(FRAME).map(([k, v]) => [v, k]));
const DIRECTION = Object.freeze({
  [FRAME.OPEN]: "client-to-relay",
  [FRAME.DATA]: "both",
  [FRAME.CLOSE]: "both",
  [FRAME.WINDOW]: "both",
  [FRAME.PING]: "relay-to-client",
  [FRAME.PONG]: "client-to-relay",
  [FRAME.HELLO]: "client-to-relay",
  [FRAME.WELCOME]: "relay-to-client",
  [FRAME.BYE]: "relay-to-client"
});
const MAX_PAYLOAD = 1 * 1024 * 1024;
const MAX_RELAY_DATA_CHUNK = 64 * 1024;
const MAX_BYE_REASON_LEN = 256;
class MalformedFrameError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "MalformedFrameError";
  }
}
class DirectionViolationError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "DirectionViolationError";
  }
}
function u8(...parts) {
  let total = 0;
  for (const a of parts) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of parts) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
function encU24BE(n) {
  return new Uint8Array([n >> 16 & 255, n >> 8 & 255, n & 255]);
}
function encHeader(type, streamId, len) {
  const h = new Uint8Array(8);
  h[0] = type;
  h.set(encU24BE(streamId), 1);
  new DataView(h.buffer).setUint32(4, len, false);
  return h;
}
function assertSessionFrame(type, streamId) {
  if (streamId !== 0) throw new MalformedFrameError(`${FRAME_NAMES[type]} must have stream_id=0, got ${streamId}`);
}
function assertStreamFrame(type, streamId) {
  if (streamId === 0) throw new MalformedFrameError(`${FRAME_NAMES[type]} must have non-zero stream_id`);
  if (streamId < 0 || streamId > 16777215) throw new MalformedFrameError(`stream_id ${streamId} out of 24-bit range`);
}
function validatePayloadShape(type, streamId, payload) {
  switch (type) {
    case FRAME.OPEN:
      assertStreamFrame(type, streamId);
      if (payload.length !== 0) throw new MalformedFrameError("OPEN must have empty payload");
      break;
    case FRAME.DATA:
      assertStreamFrame(type, streamId);
      if (payload.length === 0) throw new MalformedFrameError("DATA must have non-empty payload");
      if (payload.length > MAX_PAYLOAD) throw new MalformedFrameError(`DATA payload ${payload.length} exceeds MAX_PAYLOAD`);
      break;
    case FRAME.CLOSE:
      assertStreamFrame(type, streamId);
      if (payload.length !== 0) throw new MalformedFrameError("CLOSE must have empty payload");
      break;
    case FRAME.WINDOW: {
      assertStreamFrame(type, streamId);
      if (payload.length !== 4) throw new MalformedFrameError("WINDOW must have exactly 4 bytes");
      const delta = new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false);
      if (delta === 0) throw new MalformedFrameError("WINDOW delta must be non-zero");
      break;
    }
    case FRAME.PING:
    case FRAME.PONG:
      assertSessionFrame(type, streamId);
      break;
    case FRAME.HELLO:
      assertSessionFrame(type, streamId);
      if (payload.length !== 1 || payload[0] !== 1) {
        throw new MalformedFrameError("HELLO payload must be exactly the single byte 0x01");
      }
      break;
    case FRAME.WELCOME:
      assertSessionFrame(type, streamId);
      if (payload.length !== 0) throw new MalformedFrameError("WELCOME must have empty payload");
      break;
    case FRAME.BYE:
      assertSessionFrame(type, streamId);
      if (payload.length > MAX_BYE_REASON_LEN) throw new MalformedFrameError("BYE reason too long");
      break;
    default:
      throw new MalformedFrameError(`unknown frame type 0x${type.toString(16)}`);
  }
}
function assertDirectionAllowed(type, role) {
  const dir = DIRECTION[type];
  if (dir === "both") return;
  const requiredRole = dir === "client-to-relay" ? "relay-inbound" : "client-inbound";
  if (role !== requiredRole) {
    throw new DirectionViolationError(
      `${FRAME_NAMES[type]} is ${dir} only; not valid on a ${role} decoder`
    );
  }
}
function encodeHello() {
  return u8(encHeader(FRAME.HELLO, 0, 1), new Uint8Array([1]));
}
function encodeWelcome() {
  return encHeader(FRAME.WELCOME, 0, 0);
}
function encodeOpen(streamId) {
  assertStreamFrame(FRAME.OPEN, streamId);
  return encHeader(FRAME.OPEN, streamId, 0);
}
function encodeData(streamId, data) {
  validatePayloadShape(FRAME.DATA, streamId, data);
  return u8(encHeader(FRAME.DATA, streamId, data.length), data);
}
function encodeClose(streamId) {
  assertStreamFrame(FRAME.CLOSE, streamId);
  return encHeader(FRAME.CLOSE, streamId, 0);
}
function encodeWindow(streamId, delta) {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, delta, false);
  validatePayloadShape(FRAME.WINDOW, streamId, payload);
  return u8(encHeader(FRAME.WINDOW, streamId, 4), payload);
}
function encodePing(token = new Uint8Array(0)) {
  return u8(encHeader(FRAME.PING, 0, token.length), token);
}
function encodePong(token = new Uint8Array(0)) {
  return u8(encHeader(FRAME.PONG, 0, token.length), token);
}
function encodeBye(reason = new Uint8Array(0)) {
  validatePayloadShape(FRAME.BYE, 0, reason);
  return u8(encHeader(FRAME.BYE, 0, reason.length), reason);
}
class FrameDecoder {
  constructor(role) {
    if (role !== "relay-inbound" && role !== "client-inbound") {
      throw new RangeError('role must be "relay-inbound" or "client-inbound"');
    }
    this._role = role;
    this._buf = new Uint8Array(0);
  }
  push(chunk) {
    this._buf = u8(this._buf, chunk);
  }
  *drain() {
    for (; ; ) {
      if (this._buf.length < 8) return;
      const type = this._buf[0];
      const streamId = this._buf[1] << 16 | this._buf[2] << 8 | this._buf[3];
      const len = new DataView(this._buf.buffer, this._buf.byteOffset, this._buf.length).getUint32(4, false);
      if (!(type in FRAME_NAMES)) throw new MalformedFrameError(`unknown frame type 0x${type.toString(16)}`);
      if (len > MAX_PAYLOAD) throw new MalformedFrameError(`frame length ${len} exceeds MAX_PAYLOAD`);
      if (this._buf.length < 8 + len) return;
      const payload = this._buf.slice(8, 8 + len);
      this._buf = this._buf.slice(8 + len);
      assertDirectionAllowed(type, this._role);
      validatePayloadShape(type, streamId, payload);
      yield { type, streamId, payload };
    }
  }
}
export {
  DirectionViolationError,
  FRAME,
  FrameDecoder,
  MAX_BYE_REASON_LEN,
  MAX_PAYLOAD,
  MAX_RELAY_DATA_CHUNK,
  MalformedFrameError,
  encodeBye,
  encodeClose,
  encodeData,
  encodeHello,
  encodeOpen,
  encodePing,
  encodePong,
  encodeWelcome,
  encodeWindow
};
