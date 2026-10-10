const subtle = globalThis.crypto.subtle;
const FRAME_TAG = {
  INTERMEDIATE_PADDED: 3722304989,
  INTERMEDIATE: 4008636142,
  ABRIDGED: 4025479151
};
function reverseSlice(bytes, start, end) {
  const len = end - start;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bytes[end - 1 - i];
  return out;
}
async function sha256(bytes) {
  return new Uint8Array(await subtle.digest("SHA-256", bytes));
}
function concatBytes(...parts) {
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
async function aesCtrCrypt(keyBytes, ivBytes, data) {
  const key = await subtle.importKey("raw", keyBytes, { name: "AES-CTR" }, false, ["encrypt", "decrypt"]);
  const result = await subtle.encrypt({ name: "AES-CTR", counter: ivBytes, length: 128 }, key, data);
  return new Uint8Array(result);
}
async function deriveKeys(header64, secret) {
  let readKey = header64.slice(8, 40);
  const readIv = header64.slice(40, 56);
  let writeKey = reverseSlice(header64, 24, 56);
  const writeIv = reverseSlice(header64, 8, 24);
  if (secret) {
    readKey = await sha256(concatBytes(readKey, secret));
    writeKey = await sha256(concatBytes(writeKey, secret));
  }
  return { readKey, readIv, writeKey, writeIv };
}
async function serverHandshake(header64, secret = null) {
  if (header64.length !== 64) throw new RangeError("header must be exactly 64 bytes");
  const { readKey, readIv, writeKey, writeIv } = await deriveKeys(header64, secret);
  const decrypted = await aesCtrCrypt(readKey, readIv, header64);
  const dv = new DataView(decrypted.buffer, decrypted.byteOffset, decrypted.length);
  const tag = dv.getUint32(56, false);
  const targetDc = dv.getInt16(60, true);
  if (![FRAME_TAG.INTERMEDIATE_PADDED, FRAME_TAG.INTERMEDIATE, FRAME_TAG.ABRIDGED].includes(tag)) {
    throw new Error(`unrecognized obfuscation tag 0x${tag.toString(16)}`);
  }
  return { readKey, readIv, writeKey, writeIv, tag, targetDc };
}
async function buildClientHeader(targetDc, tag, secret = null, randomBytesFn = defaultRandomBytes) {
  let header;
  do {
    header = randomBytesFn(64);
  } while (header[0] === 239);
  const { readKey, readIv, writeKey, writeIv } = await deriveKeys(header, secret);
  const dv = new DataView(header.buffer);
  dv.setUint32(56, tag, false);
  dv.setInt16(60, targetDc, true);
  const ciphertextFull = await aesCtrCrypt(readKey, readIv, header);
  const wireBytes = header.slice();
  wireBytes.set(ciphertextFull.slice(56, 64), 56);
  return { wireBytes, readKey, readIv, writeKey, writeIv };
}
function defaultRandomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}
function addToCounter(iv, blocks) {
  let value = 0n;
  for (const b of iv) value = (value << 8n) | BigInt(b);
  value = (value + BigInt(blocks)) & ((1n << 128n) - 1n);
  const out = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}
class CtrStream {
  constructor(keyBytes, ivBytes, offset = 0) {
    this._keyBytes = keyBytes;
    this._iv = ivBytes;
    this._offset = offset;
    this._key = null;
  }
  get offset() {
    return this._offset;
  }
  async process(data) {
    if (data.length === 0) return new Uint8Array(0);
    const start = this._offset;
    this._offset += data.length;
    if (!this._key) this._key = subtle.importKey("raw", this._keyBytes, { name: "AES-CTR" }, false, ["encrypt"]);
    const key = await this._key;
    const skip = start % 16;
    const counter = addToCounter(this._iv, Math.floor(start / 16));
    const input = skip ? concatBytes(new Uint8Array(skip), data) : data;
    const out = new Uint8Array(await subtle.encrypt({ name: "AES-CTR", counter, length: 128 }, key, input));
    return skip ? out.slice(skip) : out;
  }
}
const RESERVED_FIRST_WORDS = new Set([1145128264, 1414745936, 541279567, 1229345359, 33489686, 3722304989, 4008636142]);
async function dcHandshake(targetDc, tag, randomBytesFn = defaultRandomBytes) {
  let frame;
  for (;;) {
    frame = randomBytesFn(64);
    if (frame[0] === 239) continue;
    const first = new DataView(frame.buffer, frame.byteOffset, 4).getUint32(0, true);
    if (RESERVED_FIRST_WORDS.has(first)) continue;
    if ((frame[4] | frame[5] | frame[6] | frame[7]) === 0) continue;
    break;
  }
  const view = new DataView(frame.buffer, frame.byteOffset, 64);
  view.setUint32(56, tag, false);
  view.setInt16(60, targetDc, true);
  const sendKey = frame.slice(8, 40);
  const sendIv = frame.slice(40, 56);
  const recvKey = reverseSlice(frame, 24, 56);
  const recvIv = reverseSlice(frame, 8, 24);
  const send = new CtrStream(sendKey, sendIv, 0);
  const encrypted = await send.process(frame);
  const header = encrypted.slice();
  header.set(frame.slice(8, 56), 8);
  const recv = new CtrStream(recvKey, recvIv, 0);
  return { header, send, recv };
}
export {
  CtrStream,
  FRAME_TAG,
  aesCtrCrypt,
  buildClientHeader,
  dcHandshake,
  serverHandshake
};
