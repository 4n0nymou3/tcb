import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const core = (name) => import(path.join(root, 'manual-worker/telegram/core', name));
const { Session } = await core('session.js');
const { DcConfigCache, UnknownDcError, parseProxyMultiConf } = await core('dc-config.js');
const { FrameDecoder, FRAME, encodeWindow } = await core('protocol-v3.js');
const { buildClientHeader, FRAME_TAG } = await core('obfuscated2.js');
const { clientCrypto, parseDcHeader } = await import('./tg-crypto.mjs');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('[PASS] ' + name); }
  else { fail++; console.log('[FAIL] ' + name + (detail ? ' :: ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const SECRET = new Uint8Array(16).fill(7);

const MULTI_CONF = `
proxy_for 1 149.154.175.50:8888;
proxy_for -1 149.154.175.50:8888;
proxy_for 2 149.154.161.144:8888;
proxy_for -2 149.154.161.144:8888;
proxy_for 4 149.154.165.250:8888;
proxy_for -4 149.154.165.250:8888;
`;

async function testDcResolution() {
  const cache = new DcConfigCache({ seed: parseProxyMultiConf(MULTI_CONF), fetchImpl: async () => { throw new Error('no network in test'); } });
  for (const dc of [1, 2, 3, 4, 5]) {
    const general = await cache.resolveAll(dc);
    const media = await cache.resolveAll(-dc);
    check(`dc ${dc}: media id -${dc} resolves to the same direct DC address as +${dc}`, JSON.stringify(general) === JSON.stringify(media) && media.length > 0, JSON.stringify({ general, media }));
    check(`dc ${dc}: no middle-proxy (:8888) address is ever used as a direct DC target`, [...general, ...media].every((a) => a.endsWith(':443')), JSON.stringify(media));
  }
  let thrown = null;
  try { await cache.resolveAll(10002); } catch (e) { thrown = e; }
  check('test-DC id 10002 is refused instead of guessed', thrown instanceof UnknownDcError);
  thrown = null;
  try { await cache.resolveAll(0); } catch (e) { thrown = e; }
  check('dc 0 is refused', thrown instanceof UnknownDcError);
  const start = Date.now();
  await cache.resolveAll(-2);
  check('resolving a DC never waits on a network fetch', Date.now() - start < 50);
}

function makeFakeDc(script) {
  const state = { writes: [], header: null, parsed: null, dc: null };
  let controller;
  const readable = new ReadableStream({ start(c) { controller = c; } });
  let resolveClosed;
  const closed = new Promise((r) => { resolveClosed = r; });
  const writable = new WritableStream({
    write(chunk) {
      const bytes = new Uint8Array(chunk);
      if (!state.header) {
        state.header = bytes.slice(0, 64);
        state.parsed = parseDcHeader(state.header);
        state.dc = state.parsed.dc;
        const rest = bytes.slice(64);
        if (rest.length) state.writes.push(state.parsed.decrypt(rest));
        script?.onHeader?.(state, controller, resolveClosed);
        return;
      }
      state.writes.push(state.parsed.decrypt(bytes));
    }
  });
  return { state, socket: { readable, writable, closed, close: async () => { try { controller.close(); } catch {} resolveClosed(); } }, controller, resolveClosed };
}

async function runSession({ dcId, payloadFromDc, grantEvery, closeAfterSend, initialCredit }) {
  const frames = [];
  const decoder = new FrameDecoder('client-inbound');
  const closes = [];
  const resolved = [];
  const fake = makeFakeDc();
  const session = new Session(
    (bytes) => { decoder.push(bytes); for (const f of decoder.drain()) frames.push(f); },
    (code, reason) => closes.push([code, reason]),
    async () => fake.socket,
    {
      secret: SECRET,
      dcResolver: { resolveAll: async (id) => { resolved.push(id); return ['127.0.0.1:1']; } },
      initialStreamCredit: initialCredit
    }
  );
  session.onFrame({ type: FRAME.HELLO, streamId: 0, payload: new Uint8Array([1]) });
  session.markWelcomeSent();
  session.onFrame({ type: FRAME.OPEN, streamId: 1, payload: new Uint8Array(0) });
  const keys = await buildClientHeader(dcId, FRAME_TAG.ABRIDGED, SECRET);
  const crypt = clientCrypto(keys);
  const first = crypt.encrypt(new Uint8Array([1, 2, 3, 4]));
  session.onFrame({ type: FRAME.DATA, streamId: 1, payload: cat(keys.wireBytes, first) });
  for (let i = 0; i < 100 && !fake.state.parsed; i++) await sleep(10);
  if (!fake.state.parsed) return { frames, resolved, fake, ok: false, got: new Uint8Array(0), closed: false, session };
  const enc = fake.state.parsed.encrypt(payloadFromDc);
  for (let off = 0; off < enc.length; off += 1400) fake.controller.enqueue(enc.slice(off, off + 1400));
  if (closeAfterSend) { fake.controller.close(); fake.resolveClosed(); }
  let got = new Uint8Array(0);
  let closedSeen = false;
  const deadline = Date.now() + 8000;
  let consumed = 0;
  while (Date.now() < deadline && !closedSeen) {
    await sleep(5);
    while (consumed < frames.length) {
      const f = frames[consumed++];
      if (f.type === FRAME.DATA) {
        got = cat(got, crypt.decrypt(f.payload));
        if (grantEvery) session.onFrame({ type: FRAME.WINDOW, streamId: 1, payload: encodeWindow(1, f.payload.length).slice(8) });
      }
      if (f.type === FRAME.CLOSE) closedSeen = true;
    }
  }
  return { frames, resolved, fake, ok: true, got, closed: closedSeen, session };
}

async function testSession() {
  const payload = crypto.randomBytes(300 * 1024);
  const a = await runSession({ dcId: -2, payloadFromDc: payload, grantEvery: true, closeAfterSend: false, initialCredit: 64 * 1024 });
  check('media DC id -2 from the app is passed to the resolver as received', a.resolved[0] === -2, JSON.stringify(a.resolved));
  check('media DC id -2 reaches the DC header as -2', a.fake.state.dc === -2, String(a.fake.state.dc));
  check('300 KiB DC->app transfer with a small window (64 KiB) arrives complete and in order', Buffer.from(a.got).equals(payload), `${a.got.length}/${payload.length}`);

  const b = await runSession({ dcId: 3, payloadFromDc: payload, grantEvery: true, closeAfterSend: true, initialCredit: 64 * 1024 });
  check('backend closing right after sending: every byte is delivered before CLOSE', Buffer.from(b.got).equals(payload) && b.closed, `${b.got.length}/${payload.length} closed=${b.closed}`);
  const lastData = b.frames.map((f) => f.type).lastIndexOf(FRAME.DATA);
  const closeIdx = b.frames.map((f) => f.type).indexOf(FRAME.CLOSE);
  check('CLOSE is never sent ahead of pending DATA', closeIdx > lastData, `close=${closeIdx} lastData=${lastData}`);

  const big = crypto.randomBytes(3 * 1024 * 1024);
  const c = await runSession({ dcId: 5, payloadFromDc: big, grantEvery: true, closeAfterSend: true, initialCredit: 256 * 1024 });
  check('3 MiB DC->app transfer, backend closes at end, 256 KiB window: complete and identical', Buffer.from(c.got).equals(big) && c.closed, `${c.got.length}/${big.length}`);
}

await testDcResolution();
await testSession();
console.log(`\n${pass}/${pass + fail} media regression checks passed.`);
process.exit(fail ? 1 : 0);