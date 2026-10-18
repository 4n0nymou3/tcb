import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const core = (name) => import(path.join(root, 'manual-worker/telegram/core', name));
const { deriveCapability } = await core('capability.js');
const { mintTokenWithNonce, TOKEN_KIND } = await core('token.js');
const { FrameDecoder, FRAME, encodeHello, encodeOpen, encodeData } = await core('protocol-v3.js');
const { buildClientHeader, FRAME_TAG } = await core('obfuscated2.js');
const { clientCrypto } = await import('./tg-crypto.mjs');
const { buildPageScript } = await core('bridge-page.js');

const SECRET = process.env.TG_SECRET || '0102030405060708090a0b0c0d0e0f10';
const HOST = process.env.TG_HOST || 'tcb-test.example.workers.dev';
const BASE = 'http://127.0.0.1:8787';
const WS_BASE = 'ws://127.0.0.1:8787';
const KEY_BYTES = new Uint8Array(Buffer.from(SECRET.slice(-32), 'hex'));
const TAG = SECRET.length === 34 ? FRAME_TAG.INTERMEDIATE_PADDED : FRAME_TAG.ABRIDGED;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('[PASS] ' + name); }
  else { fail++; console.log('[FAIL] ' + name + (detail ? ' :: ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

const secretBytes = new Uint8Array(Buffer.from(SECRET, 'hex'));
const hmacKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const signingKey = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode('tcb-telegram-token-signing-v1')));

const capability = await deriveCapability(HOST, SECRET);

async function fetchBridge() {
  const res = await fetch(`${BASE}/?bridge=${capability}`);
  const html = await res.text();
  const token = /const bootstrap="([A-Za-z0-9_-]{43})"/.exec(html)?.[1];
  return { res, html, token };
}

async function createSession(token, body = encodeHello()) {
  return fetch(`${BASE}/api/v1/session`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
}

function frameReader(ws) {
  const decoder = new FrameDecoder('client-inbound');
  const queue = []; const waiters = [];
  ws.binaryType = 'arraybuffer';
  ws.on('message', (d) => {
    decoder.push(new Uint8Array(d));
    for (const f of decoder.drain()) { queue.push(f); const w = waiters.shift(); if (w) w(queue.shift()); }
  });
  return (ms = 5000) => queue.length ? Promise.resolve(queue.shift()) : new Promise((res, rej) => {
    const t = setTimeout(() => { const i = waiters.indexOf(w); if (i !== -1) waiters.splice(i, 1); rej(new Error('timeout')); }, ms);
    const w = (f) => { clearTimeout(t); res(f); }; waiters.push(w);
  });
}

function openWs(sessionToken) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/v1/ws`, [`tproxy-v1.${sessionToken}`]);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (req, res) => reject(Object.assign(new Error('rejected'), { status: res.statusCode })));
  });
}

function oddChunks(total) {
  const sizes = [13, 29, 1, 777, 3, 160, 7];
  const out = [];
  let left = total, i = 0;
  while (left > 0) { const n = Math.min(left, sizes[i++ % sizes.length]); out.push(n); left -= n; }
  return out;
}

async function relayOnce(ws, next, streamId, size) {
  ws.send(encodeOpen(streamId));
  const keys = await buildClientHeader(2, TAG, KEY_BYTES);
  const crypt = clientCrypto(keys);
  const payload = crypto.randomBytes(size);
  let offset = 0;
  let first = true;
  for (const n of oddChunks(payload.length)) {
    const enc = crypt.encrypt(payload.subarray(offset, offset + n));
    ws.send(encodeData(streamId, first ? cat(keys.wireBytes, enc) : enc));
    first = false;
    offset += n;
    await sleep(3);
  }
  let got = new Uint8Array(0);
  const deadline = Date.now() + 8000;
  while (got.length < payload.length && Date.now() < deadline) {
    const f = await next(4000).catch(() => null);
    if (!f) break;
    if (f.type === FRAME.DATA) got = cat(got, crypt.decrypt(f.payload));
  }
  const expected = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) expected[i] = payload[i] ^ 0xa5;
  return Buffer.from(got).equals(expected);
}

function dcLog() {
  const file = process.env.TG_DC_LOG;
  if (!file) return [];
  try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

async function testDcLeg() {
  const entries = dcLog();
  check('dc leg: the fake DC accepted proxy connections that started with a valid obfuscated2 header', entries.some((e) => e.evt === 'accepted' && e.dc === 2), JSON.stringify(entries.slice(0, 3)));
  check('dc leg: the DC saw the same transport tag the client announced', entries.filter((e) => e.evt === 'accepted').every((e) => e.tag === TAG.toString(16)), JSON.stringify(entries.slice(0, 3)));
  check('dc leg: the fake DC rejected no connection', !entries.some((e) => e.evt === 'rejected'));
}

async function testRouting() {
  const pub = await fetch(`${BASE}/`);
  check('non-telegram GET / follows the existing TCB worker (200, empty fallback)', pub.status === 200 && (await pub.text()) === '');
  const { res, html, token } = await fetchBridge();
  check('bridge: valid capability returns the bridge document', res.status === 200 && !!token, String(res.status));
  check('bridge: no-store and CSP with nonce and wss origin', res.headers.get('cache-control') === 'no-store' && /script-src 'nonce-[A-Za-z0-9_-]+'/.test(res.headers.get('content-security-policy') || '') && (res.headers.get('content-security-policy') || '').includes(`connect-src 'self' wss://${HOST}`));
  check('bridge: script tag carries the CSP nonce', (() => { const n = /nonce-([A-Za-z0-9_-]+)/.exec(res.headers.get('content-security-policy'))?.[1]; return html.includes(`<script nonce="${n}">`); })());
  const wrongValue = await fetch(`${BASE}/?bridge=${'A'.repeat(43)}`);
  check('bridge: wrong 43-char value follows the public path', wrongValue.status === 200 && (await wrongValue.text()) === '');
  const wrongPath = await fetch(`${BASE}/other?bridge=${capability}`);
  check('bridge: authentic capability on wrong path gets local 404', wrongPath.status === 404);
  const dup = await fetch(`${BASE}/?bridge=${capability}&bridge=${capability}`);
  check('bridge: duplicate parameter gets local 404', dup.status === 404);
  const extra = await fetch(`${BASE}/?bridge=${capability}&x=1`);
  check('bridge: extra parameter gets local 404', extra.status === 404);
}

async function testBootstrapAndSession() {
  const { token } = await fetchBridge();
  const res = await createSession(token);
  const body = new Uint8Array(await res.arrayBuffer());
  check('create: 200 with X-Carrier-Mode websocket', res.status === 200 && res.headers.get('x-carrier-mode') === 'websocket', String(res.status));
  check('create: X-Down-Cursor 0 and no-store', res.headers.get('x-down-cursor') === '0' && res.headers.get('cache-control') === 'no-store');
  check('create: body is a WELCOME frame', body.length === 8 && body[0] === FRAME.WELCOME);
  const session = res.headers.get('x-session-token');
  check('create: session token is 43 chars', session?.length === 43);
  const again = await createSession(token);
  check('create: byte-identical retry returns the same session token', again.status === 200 && again.headers.get('x-session-token') === session);

  const random = await fetch(`${BASE}/api/v1/session`, { method: 'POST', headers: { Authorization: 'Bearer ' + 'B'.repeat(43) }, body: encodeHello() });
  check('create: random bearer follows the public path (not 404/401)', random.status === 200 && (await random.text()) === '');
  const noAuth = await fetch(`${BASE}/api/v1/session`, { method: 'POST', body: encodeHello() });
  check('create: missing bearer follows the public path', noAuth.status === 200);

  const badBodyToken = (await fetchBridge()).token;
  const badBody = await createSession(badBodyToken, encodeOpen(1));
  check('create: authentic token with a non-HELLO body gets local 404', badBody.status === 404);
  const bigBody = await createSession((await fetchBridge()).token, new Uint8Array(100));
  check('create: oversized body is rejected (413)', bigBody.status === 413);

  const oldNonce = new Uint8Array(16); crypto.getRandomValues(oldNonce);
  new DataView(oldNonce.buffer).setUint32(0, Math.floor(Date.now() / 1000) - 600, false);
  const oldToken = await mintTokenWithNonce(TOKEN_KIND.BOOTSTRAP, oldNonce, signingKey);
  const expired = await createSession(oldToken);
  check('create: expired bootstrap gets local 404', expired.status === 404);

  const sessionAsBootstrap = await createSession(session);
  check('create: a session token used as bootstrap follows the public path', sessionAsBootstrap.status === 200 && (await sessionAsBootstrap.text()) === '');
  return session;
}

async function testWsFlow(session) {
  const ws = await openWs(session);
  check('ws: upgrade succeeds and subprotocol is echoed', ws.readyState === ws.OPEN && ws.protocol === `tproxy-v1.${session}`);
  const next = frameReader(ws);
  let second = null;
  try { await openWs(session); } catch (e) { second = e.status; }
  check('ws: second socket on the same session is rejected (409)', second === 409, String(second));
  const ok = await relayOnce(ws, next, 1, 3000);
  check('ws: OPEN+DATA relayed through the real DO, TCP and fake DC, bytes match', ok);
  const ok2 = await relayOnce(ws, next, 2, 700);
  check('ws: second stream on the same session also works', ok2);
  const closed = new Promise((r) => ws.once('close', (code) => r(code)));
  ws.send(encodeHello());
  const code = await closed;
  check('ws: a HELLO after session creation closes the session (4010)', code === 4010, String(code));
}

async function testReattachAndDelete() {
  const { token } = await fetchBridge();
  const res = await createSession(token);
  const session = res.headers.get('x-session-token');
  const ws = await openWs(session);
  await sleep(200);
  ws.close();
  await sleep(500);
  const ws2 = await openWs(session);
  const next = frameReader(ws2);
  check('reattach: a new socket may attach shortly after the old one closed', ws2.readyState === ws2.OPEN);
  check('reattach: relay works on the re-attached socket', await relayOnce(ws2, next, 1, 500));
  const closed = new Promise((r) => ws2.once('close', (code) => r(code)));
  const d1 = await fetch(`${BASE}/api/v1/session`, { method: 'DELETE', headers: { Authorization: `Bearer ${session}` } });
  check('delete: 204 and the attached socket is closed (4030)', d1.status === 204 && (await closed) === 4030);
  const d2 = await fetch(`${BASE}/api/v1/session`, { method: 'DELETE', headers: { Authorization: `Bearer ${session}` } });
  check('delete: repeated delete is idempotent (204)', d2.status === 204);
  let after = null;
  try { await openWs(session); } catch (e) { after = e.status; }
  check('delete: attaching after delete is rejected (404)', after === 404, String(after));
  const randomDelete = await fetch(`${BASE}/api/v1/session`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + 'C'.repeat(43) } });
  check('delete: random credentials follow the public path', randomDelete.status === 200);
}

async function testBridgePageAgainstRelay() {
  const { token } = await fetchBridge();
  const script = buildPageScript({ bootstrap: token, relayBase: 'https://' + HOST + '/', diag: false });
  const androidNonce = 'N'.repeat(43);
  const toLocal = (u) => String(u).replace(/^https:\/\/[^/]+/, BASE).replace(/^wss:\/\/[^/]+/, WS_BASE);
  const posted = [];
  const bridge = { onmessage: null, postMessage(v) { posted.push(v); } };
  const fakeWindow = {
    location: { origin: 'https://' + HOST, pathname: '/', hash: '#android=' + androidNonce },
    history: { replaceState() {} },
    document: { readyState: 'complete' },
    addEventListener() {},
    parent: {},
    TelegramWebProxy: bridge,
    fetch: (u, o) => fetch(toLocal(u), o),
    WebSocket: class extends WebSocket { constructor(u, p) { super(toLocal(u), p); } },
    ArrayBuffer, DataView, Error, URL, Uint8Array, JSON, Object, Promise, setTimeout, clearTimeout
  };
  const run = new Function('window', `with(window){ const globalThis=window; ${script} }`);
  run(fakeWindow);
  check('page: android init message is sent with the nonce', (() => { const m = posted.map((p) => { try { return JSON.parse(p); } catch { return null; } }).find((m) => m && m.t === 'tproxy-android-init'); return m && m.nonce === androidNonce && m.v === 1; })());
  const hello = encodeHello();
  bridge.onmessage({ data: hello.buffer.slice(hello.byteOffset, hello.byteOffset + hello.byteLength) });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !posted.some((p) => p instanceof ArrayBuffer)) await sleep(50);
  const welcome = posted.find((p) => p instanceof ArrayBuffer);
  check('page: WELCOME frame is forwarded to the app after session + websocket are up', !!welcome && new Uint8Array(welcome)[0] === FRAME.WELCOME);
  const states = posted.map((p) => { try { return typeof p === 'string' ? JSON.parse(p) : null; } catch { return null; } }).filter((m) => m && m.t === 'status').map((m) => m.state);
  check('page: status goes connecting then connected', states[0] === 'connecting' && states.includes('connected'), states.join(','));

  const keys = await buildClientHeader(2, TAG, KEY_BYTES);
  const crypt = clientCrypto(keys);
  const payload = crypto.randomBytes(1200);
  let seen = posted.length;
  const ab = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
  bridge.onmessage({ data: ab(encodeOpen(1)) });
  let sentAt = 0, firstFrame = true;
  for (const n of oddChunks(payload.length)) {
    const enc = crypt.encrypt(payload.subarray(sentAt, sentAt + n));
    bridge.onmessage({ data: ab(encodeData(1, firstFrame ? cat(keys.wireBytes, enc) : enc)) });
    firstFrame = false;
    sentAt += n;
    await sleep(3);
  }
  const dataSizes = [];
  let got = new Uint8Array(0);
  const dl2 = Date.now() + 8000;
  while (got.length < payload.length && Date.now() < dl2) {
    await sleep(50);
    while (seen < posted.length) {
      const p = posted[seen++];
      if (!(p instanceof ArrayBuffer)) continue;
      const bytes = new Uint8Array(p);
      if (bytes[0] !== FRAME.DATA) continue;
      const len = new DataView(p).getUint32(4, false);
      got = cat(got, crypt.decrypt(bytes.slice(8, 8 + len)));
      dataSizes.push(len);
    }
  }
  const expected = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) expected[i] = payload[i] ^ 0xa5;
  check('page: app frames travel page -> relay -> fake DC -> page -> app, bytes match', Buffer.from(got).equals(expected), `${got.length}/${payload.length} frames=${dataSizes.join(',')} sentChunks=${oddChunks(payload.length).join(',')} states=${posted.filter((p) => typeof p === 'string').join('|')}`);
  bridge.onmessage({ data: JSON.stringify({ t: 'close' }) });
  await sleep(500);
}

async function testNoSecret() {
  const r = await fetch(`${BASE}/?bridge=${capability}`);
  check('no secret: bridge path is not served and the TCB worker answers', r.status === 200 && (await r.text()) === '');
  const p = await fetch(`${BASE}/api/v1/session`, { method: 'POST', headers: { Authorization: 'Bearer ' + 'Q'.repeat(43) }, body: encodeHello() });
  check('no secret: session endpoint falls through to the TCB worker', p.status === 200 && (await p.text()) === '');
}

async function testTcbWebsocketStillWorks() {
  const ws = new WebSocket(`${WS_BASE}/`);
  const result = await new Promise((resolve) => {
    ws.once('open', () => resolve('open'));
    ws.once('unexpected-response', (req, res) => resolve('status ' + res.statusCode));
    ws.once('error', () => resolve('error'));
  });
  check('a non-telegram websocket upgrade is accepted by the TCB worker', result === 'open', result);
  try { ws.close(); } catch {}
  const wrongProto = new WebSocket(`${WS_BASE}/api/v1/ws`, ['tproxy-v1.' + 'A'.repeat(43)]);
  const result2 = await new Promise((resolve) => {
    wrongProto.once('open', () => resolve('open'));
    wrongProto.once('unexpected-response', (req, res) => resolve('status ' + res.statusCode));
    wrongProto.once('error', () => resolve('error'));
  });
  check('a forged session subprotocol is not handled by telegram (falls to the TCB worker)', result2 !== 'status 404' && result2 !== 'status 409', result2);
  try { wrongProto.close(); } catch {}
}

async function testDiagEndpoint() {
  const on = process.env.TG_DIAG === '1';
  const good = await fetch(`${BASE}/api/v1/diag`, { method: 'POST', body: JSON.stringify({ s: 'page-start', hash: 'android-ok', bridgeObj: 'object', postFn: true, ready: 'loading' }) });
  const junk = await fetch(`${BASE}/api/v1/diag`, { method: 'POST', body: JSON.stringify({ s: 'page-start', hash: 'SECRETVALUE', extra: 'LEAKME', n: 'bad value!' }) });
  const huge = await fetch(`${BASE}/api/v1/diag`, { method: 'POST', body: 'x'.repeat(5000) });
  const notJson = await fetch(`${BASE}/api/v1/diag`, { method: 'POST', body: 'not json' });
  const get = await fetch(`${BASE}/api/v1/diag`);
  if (on) {
    check('diag on: accepted payloads, junk and oversized bodies all answer 204', [good, junk, huge, notJson].every((r) => r.status === 204), [good, junk, huge, notJson].map((r) => r.status).join(','));
    check('diag on: GET is not served by the diag handler', get.status === 200);
    const { bridge } = await (async () => { const b = await fetchBridge(); return { bridge: b }; })();
    check('diag on: bridge page embeds diagnostics flag true', /const diagOn=true;/.test(bridge.html));
  } else {
    check('diag off: the diag endpoint is not handled (falls through to the TCB worker)', [good, junk, huge, notJson].every((r) => r.status === 200 && true));
    const bridge = await fetchBridge();
    check('diag off: bridge page embeds diagnostics flag false', /const diagOn=false;/.test(bridge.html));
  }
}

const suites = process.env.TG_NO_SECRET === '1' ? [testNoSecret] : [testRouting, testDiagEndpoint, testTcbWebsocketStillWorks, async () => { const s = await testBootstrapAndSession(); await testWsFlow(s); }, testReattachAndDelete, testBridgePageAgainstRelay, testDcLeg];
for (const suite of suites) {
  try { await suite(); } catch (err) { fail++; console.log('[FAIL] suite crashed: ' + err.stack); }
}
console.log(`\n${pass}/${pass + fail} telegram e2e checks passed.`);
process.exit(fail ? 1 : 0);