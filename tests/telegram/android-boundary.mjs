import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { buildPageScript } = await import(path.join(root, 'manual-worker/telegram/core/bridge-page.js'));

const HOST = 'tcb.axoz.ir';
const NONCE = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE';
const BOOTSTRAP = 'B'.repeat(43);
const SESSION = 'S'.repeat(43);
const CAPABILITY = 'C'.repeat(43);
const SECRETS = [NONCE, BOOTSTRAP, SESSION, CAPABILITY];

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log('[PASS] ' + name); } else { fail++; console.log('[FAIL] ' + name + (detail ? ' :: ' + detail : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function frame(w, type, streamId, payload) {
  const body = payload || new Uint8Array(0);
  const buf = new w.ArrayBuffer(8 + body.length);
  const view = new w.DataView(buf);
  view.setUint8(0, type);
  view.setUint8(1, (streamId >> 16) & 0xff);
  view.setUint8(2, (streamId >> 8) & 0xff);
  view.setUint8(3, streamId & 0xff);
  view.setUint32(4, body.length, false);
  new w.Uint8Array(buf).set(body, 8);
  return buf;
}

function startScenario({ hash = '#android=' + NONCE, bridge = 'ok', helloAs = 'ArrayBuffer', origin = 'https://' + HOST, diag = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: origin + '/?bridge=' + CAPABILITY + hash });
  const w = dom.window;
  const toNative = [];
  const diagBodies = [];
  const requests = [];
  const wsSent = [];
  const state = { initSeen: false, nativeRejected: [] };
  const proxy = {
    onmessage: null,
    postMessage(value) {
      if (typeof value === 'string') {
        toNative.push({ kind: 'string', value });
        let parsed = null;
        try { parsed = JSON.parse(value); } catch {}
        if (parsed && parsed.t === 'tproxy-android-init' && parsed.v === 1 && parsed.nonce === NONCE && !state.initSeen) {
          state.initSeen = true;
          setTimeout(() => {
            const hello = frame(w, 0x10, 0, new w.Uint8Array([1]));
            let data = hello;
            if (helloAs === 'Uint8Array') data = new w.Uint8Array(hello);
            else if (helloAs === 'base64') data = Buffer.from(new Uint8Array(hello)).toString('base64');
            else if (helloAs === 'nodeRealmBuffer') data = Uint8Array.from(new w.Uint8Array(hello)).buffer;
            else if (helloAs === 'json') data = JSON.stringify({ t: 'hello' });
            proxy.onmessage({ data });
          }, 5);
        }
      } else if (value instanceof w.ArrayBuffer) {
        toNative.push({ kind: 'ArrayBuffer', value });
      } else {
        const error = new TypeError('only String and ArrayBuffer are accepted by the native message port');
        state.nativeRejected.push(Object.prototype.toString.call(value));
        throw error;
      }
    }
  };
  if (bridge === 'ok') w.TelegramWebProxy = proxy;
  else if (bridge === 'nopost') w.TelegramWebProxy = { onmessage: null };
  w.fetch = async (url, options) => {
    const u = String(url);
    if (u.endsWith('/api/v1/diag')) { diagBodies.push(JSON.parse(options.body)); return { status: 204 }; }
    requests.push({ url: u, method: options.method, auth: options.headers && options.headers.Authorization, body: options.body });
    return {
      status: 200,
      headers: { get: (k) => ({ 'x-carrier-mode': 'websocket', 'x-session-token': SESSION })[k.toLowerCase()] ?? null },
      arrayBuffer: async () => frame(w, 0x11, 0)
    };
  };
  const sockets = [];
  w.WebSocket = class {
    constructor(url, protocol) {
      this.url = url; this.protocol = protocol; this.readyState = 0; sockets.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 5);
    }
    send(data) { wsSent.push(data); }
    close() { this.readyState = 3; }
  };
  w.WebSocket.OPEN = 1;
  w.eval(buildPageScript({ bootstrap: BOOTSTRAP, relayBase: 'https://' + HOST + '/', diag }));
  return { w, proxy, toNative, diagBodies, requests, wsSent, sockets, state };
}

const steps = (s) => s.diagBodies.map((b) => b.s);

{
  const s = startScenario();
  await sleep(150);
  const strings = s.toNative.filter((m) => m.kind === 'string').map((m) => JSON.parse(m.value));
  check('android: first message to native is the connecting status, second is the init with v=1 and the fragment nonce', strings[0]?.t === 'status' && strings[0]?.state === 'connecting' && strings[1]?.t === 'tproxy-android-init' && strings[1]?.v === 1 && strings[1]?.nonce === NONCE, JSON.stringify(strings));
  check('android: the fragment is removed from the visible URL after init', !s.w.location.hash && !s.w.location.href.includes('android='));
  check('android: only String or ArrayBuffer ever reach the native port', s.state.nativeRejected.length === 0, s.state.nativeRejected.join(','));
  const post = s.requests.find((r) => r.method === 'POST');
  check('android: the native HELLO frame triggers POST /api/v1/session with the bootstrap bearer and the HELLO bytes', !!post && post.url === 'https://' + HOST + '/api/v1/session' && post.auth === 'Bearer ' + BOOTSTRAP && post.body.byteLength === 9 && new s.w.Uint8Array(post.body)[0] === 0x10);
  check('android: websocket is opened with the session subprotocol on the configured host', s.sockets.length === 1 && s.sockets[0].url === 'wss://' + HOST + '/api/v1/ws' && s.sockets[0].protocol === 'tproxy-v1.' + SESSION);
  const forwarded = s.toNative.filter((m) => m.kind === 'ArrayBuffer');
  check('android: WELCOME reaches native as one 8-byte ArrayBuffer frame', forwarded.length === 1 && forwarded[0].value.byteLength === 8 && new s.w.Uint8Array(forwarded[0].value)[0] === 0x11);

  const open = frame(s.w, 0x01, 1);
  const data = frame(s.w, 0x02, 1, new s.w.Uint8Array([1, 2, 3, 4]));
  s.proxy.onmessage({ data: open });
  s.proxy.onmessage({ data });
  await sleep(30);
  check('android: later native frames go to the websocket one per message as ArrayBuffers', s.wsSent.length === 2 && s.wsSent.every((m) => m instanceof s.w.ArrayBuffer) && s.wsSent[0].byteLength === 8 && s.wsSent[1].byteLength === 12);

  const batch = new s.w.ArrayBuffer(8 + 12);
  new s.w.Uint8Array(batch).set(new s.w.Uint8Array(frame(s.w, 0x04, 1, new s.w.Uint8Array([0, 0, 0, 9]))), 0);
  new s.w.Uint8Array(batch).set(new s.w.Uint8Array(frame(s.w, 0x04, 1, new s.w.Uint8Array([0, 0, 0, 7]))).slice(0, 12), 8);
  const before = s.toNative.filter((m) => m.kind === 'ArrayBuffer').length;
  s.sockets[0].onmessage({ data: batch.slice(0, 12) });
  const twoFrames = new s.w.ArrayBuffer(24);
  new s.w.Uint8Array(twoFrames).set(new s.w.Uint8Array(frame(s.w, 0x04, 1, new s.w.Uint8Array([0, 0, 0, 9]))), 0);
  new s.w.Uint8Array(twoFrames).set(new s.w.Uint8Array(frame(s.w, 0x04, 1, new s.w.Uint8Array([0, 0, 0, 7]))), 12);
  s.sockets[0].onmessage({ data: twoFrames });
  const after = s.toNative.filter((m) => m.kind === 'ArrayBuffer');
  check('android: a websocket message holding two frames is delivered to native as two separate ArrayBuffers', after.length - before === 3 && after[after.length - 1].value.byteLength === 12 && after[after.length - 2].value.byteLength === 12, String(after.length - before));

  const order = steps(s);
  const expected = ['page-start', 'branch', 'init-sent', 'native-msg', 'first-binary', 'create-start', 'create-status', 'ws-attempt', 'ws-open', 'welcome-forwarded'];
  let cursor = 0;
  for (const step of order) if (step === expected[cursor]) cursor++;
  check('diagnostics: the full android sequence is reported in order', cursor === expected.length, order.join(','));
  const pageStart = s.diagBodies.find((b) => b.s === 'page-start');
  check('diagnostics: page-start reports hash android-ok, bridge object, postMessage function', pageStart.hash === 'android-ok' && pageStart.bridgeObj === 'object' && pageStart.postFn === true);
  const nativeMsg = s.diagBodies.find((b) => b.s === 'native-msg');
  check('diagnostics: native-msg reports ArrayBuffer and its byte length only', nativeMsg.rep === 'ArrayBuffer' && nativeMsg.len === 9 && nativeMsg.tag === 'ArrayBuffer');
  const createStatus = s.diagBodies.find((b) => b.s === 'create-status');
  check('diagnostics: create-status reports status 200, carrier ok, token present', createStatus.status === 200 && createStatus.mode === true && createStatus.tok === true);
  const allDiag = JSON.stringify(s.diagBodies);
  check('diagnostics: no nonce, bootstrap token, session token or capability appears in any diagnostic payload', SECRETS.every((x) => !allDiag.includes(x)));
}

{
  const s = startScenario({ helloAs: 'Uint8Array' });
  await sleep(150);
  check('hello as Uint8Array: ignored by the page (matches the reference page) and no session is created', !s.requests.some((r) => r.method === 'POST'));
  const m = s.diagBodies.find((b) => b.s === 'native-msg');
  check('hello as Uint8Array: the diagnostic names the representation', m && m.rep === 'view:Uint8Array' && m.len === 9, JSON.stringify(m));
}
{
  const s = startScenario({ helloAs: 'base64' });
  await sleep(150);
  const m = s.diagBodies.find((b) => b.s === 'native-msg');
  check('hello as base64 string: ignored, and the diagnostic reports a string that is not JSON', !s.requests.some((r) => r.method === 'POST') && m && m.rep === 'string' && m.ct === 'unparsable', JSON.stringify(m));
}
{
  const s = startScenario({ helloAs: 'nodeRealmBuffer' });
  await sleep(150);
  const m = s.diagBodies.find((b) => b.s === 'native-msg');
  check('hello as a foreign-realm ArrayBuffer: instanceof fails so it is ignored, and the diagnostic tag still says ArrayBuffer', !s.requests.some((r) => r.method === 'POST') && m && m.tag === 'ArrayBuffer' && m.rep !== 'ArrayBuffer', JSON.stringify(m));
}
{
  const s = startScenario({ hash: '' });
  await sleep(100);
  const strings = s.toNative.filter((m) => m.kind === 'string');
  check('no fragment: page does not touch the native port and reports hash none and branch none', strings.length === 0 && s.diagBodies.find((b) => b.s === 'page-start').hash === 'none' && s.diagBodies.find((b) => b.s === 'branch').p === 'none');
}
{
  const s = startScenario({ hash: '#android=short' });
  await sleep(100);
  check('malformed fragment: reported as other and no init is sent', s.diagBodies.find((b) => b.s === 'page-start').hash === 'other' && s.toNative.length === 0);
}
{
  const s = startScenario({ bridge: 'nopost' });
  await sleep(100);
  const p = s.diagBodies.find((b) => b.s === 'page-start');
  check('bridge object without postMessage: reported and no init is attempted', p.bridgeObj === 'object' && p.postFn === false && s.diagBodies.find((b) => b.s === 'branch').p === 'none');
}
{
  const s = startScenario({ bridge: 'missing' });
  await sleep(100);
  const p = s.diagBodies.find((b) => b.s === 'page-start');
  check('bridge object absent: reported as undefined', p.bridgeObj === 'undefined' && p.postFn === false);
}
{
  const s = startScenario({ origin: 'https://other.example' });
  await sleep(150);
  const post = s.requests.find((r) => r.method === 'POST');
  check('relay base comes from the server-provided hostname, not from location.origin', !!post && post.url === 'https://' + HOST + '/api/v1/session');
}
{
  const s = startScenario({ diag: false });
  await sleep(150);
  check('diagnostics off: no diag request is ever made', s.diagBodies.length === 0 && s.requests.some((r) => r.method === 'POST'));
}

console.log(`\n${pass}/${pass + fail} android boundary checks passed.`);
process.exit(fail ? 1 : 0);
