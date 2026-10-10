import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeStream, parseDcHeader, clientCrypto } from './tg-crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { CtrStream, dcHandshake, FRAME_TAG, buildClientHeader, serverHandshake } = await import(path.join(root, 'manual-worker/telegram/core/obfuscated2.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log('[PASS] ' + name); } else { fail++; console.log('[FAIL] ' + name + (detail ? ' :: ' + detail : '')); } };
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));

function chunkSizes(total) {
  const sizes = [];
  let left = total;
  while (left > 0) {
    const n = Math.min(left, 1 + Math.floor(Math.random() * 70));
    sizes.push(n);
    left -= n;
  }
  return sizes;
}

{
  let ok = true;
  for (let round = 0; round < 60; round++) {
    const key = crypto.randomBytes(32);
    const iv = round % 5 === 0 ? Buffer.alloc(16, 0xff) : round % 5 === 1 ? Buffer.concat([crypto.randomBytes(8), Buffer.alloc(8, 0xff)]) : crypto.randomBytes(16);
    const data = crypto.randomBytes(3000);
    const reference = nodeStream(key, iv)(data);
    const stream = new CtrStream(new Uint8Array(key), new Uint8Array(iv), 0);
    const parts = [];
    let off = 0;
    for (const n of chunkSizes(data.length)) {
      parts.push(await stream.process(new Uint8Array(data.subarray(off, off + n))));
      off += n;
    }
    if (!eq(Buffer.concat(parts), reference)) { ok = false; break; }
  }
  check('CtrStream: 60 random chunkings (1..70 byte chunks, counter-wrap IVs) match Node aes-256-ctr byte for byte', ok);
}
{
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(16);
  const a = new CtrStream(new Uint8Array(key), new Uint8Array(iv), 0);
  const whole = await new CtrStream(new Uint8Array(key), new Uint8Array(iv), 0).process(new Uint8Array(33));
  const split = Buffer.concat([await a.process(new Uint8Array(13)), await a.process(new Uint8Array(20))]);
  check('CtrStream: 13 bytes then 20 bytes equals one 33-byte call (non-block-aligned chunks keep the keystream position)', eq(whole, split));
}
{
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(16);
  const data = crypto.randomBytes(500);
  const s = new CtrStream(new Uint8Array(key), new Uint8Array(iv), 64);
  const ref = nodeStream(key, iv);
  ref(new Uint8Array(64));
  check('CtrStream: a start offset of 64 continues after the handshake header', eq(await s.process(new Uint8Array(data)), ref(data)));
}
{
  const calls = await Promise.all((() => { const s = new CtrStream(new Uint8Array(32), new Uint8Array(16), 0); return [s.process(new Uint8Array(5)), s.process(new Uint8Array(17)), s.process(new Uint8Array(1))]; })());
  const ref = nodeStream(Buffer.alloc(32), Buffer.alloc(16))(new Uint8Array(23));
  check('CtrStream: overlapping async calls still consume the keystream in call order', eq(Buffer.concat(calls), ref));
}

for (const [name, tag] of [['abridged', FRAME_TAG.ABRIDGED], ['intermediate', FRAME_TAG.INTERMEDIATE], ['padded intermediate', FRAME_TAG.INTERMEDIATE_PADDED]]) {
  for (const dc of [2, 4, -3]) {
    const hs = await dcHandshake(dc, tag);
    const parsed = parseDcHeader(hs.header);
    check(`dcHandshake (${name}, dc ${dc}): independent DC-side parse finds tag ${tag.toString(16)} and dc ${dc}`, hs.header.length === 64 && parsed.tag === tag && parsed.dc === dc && parsed.tagOk);
    check(`dcHandshake (${name}, dc ${dc}): header obeys the reserved-prefix rules`, parsed.shapeOk);
  }
}
{
  const hs = await dcHandshake(2, FRAME_TAG.ABRIDGED);
  const parsed = parseDcHeader(hs.header);
  let upOk = true, downOk = true;
  for (let i = 0; i < 40; i++) {
    const up = crypto.randomBytes(1 + Math.floor(Math.random() * 200));
    const enc = await hs.send.process(new Uint8Array(up));
    if (!eq(parsed.decrypt(enc), up)) upOk = false;
    const down = crypto.randomBytes(1 + Math.floor(Math.random() * 200));
    const encDown = parsed.encrypt(down);
    if (!eq(await hs.recv.process(new Uint8Array(encDown)), down)) downOk = false;
  }
  check('dcHandshake: proxy-to-DC stream is readable by an independent DC implementation (40 odd-sized chunks)', upOk);
  check('dcHandshake: DC-to-proxy stream is readable by the proxy (40 odd-sized chunks)', downOk);
}
{
  const secret = new Uint8Array(crypto.randomBytes(16));
  for (const tag of [FRAME_TAG.ABRIDGED, FRAME_TAG.INTERMEDIATE_PADDED]) {
    const client = await buildClientHeader(5, tag, secret);
    const server = await serverHandshake(client.wireBytes, secret);
    const independent = clientCrypto(client);
    const proxyRead = new CtrStream(server.readKey, server.readIv, 64);
    const proxyWrite = new CtrStream(server.writeKey, server.writeIv, 0);
    const msg = crypto.randomBytes(1000);
    let sent = 0, got = [];
    for (const n of chunkSizes(msg.length)) { const enc = independent.encrypt(msg.subarray(sent, sent + n)); got.push(await proxyRead.process(enc)); sent += n; }
    check(`client leg (tag ${tag.toString(16)}): proxy decrypts an independent client's stream chunk by chunk`, server.targetDc === 5 && eq(Buffer.concat(got), msg));
    const reply = crypto.randomBytes(1000);
    let back = [], p = 0;
    for (const n of chunkSizes(reply.length)) { back.push(independent.decrypt(await proxyWrite.process(new Uint8Array(reply.subarray(p, p + n))))); p += n; }
    check(`client leg (tag ${tag.toString(16)}): an independent client decrypts the proxy's stream chunk by chunk`, eq(Buffer.concat(back), reply));
  }
}

console.log(`\n${pass}/${pass + fail} crypto stream checks passed.`);
process.exit(fail ? 1 : 0);
