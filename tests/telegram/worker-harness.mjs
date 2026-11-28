import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TOKEN = '11111111-2222-4333-8444-555555555555';
export const RealResponse = globalThis.Response;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
export const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));

const xorArr = (s) => '[' + [...s].map((c) => c.charCodeAt(0) ^ 75).join(',') + ']';

export function fillTemplate(src) {
  return src.replace('__WORKER_TOKEN_ARRAY__', xorArr(TOKEN)).replace('__WORKER_TROJAN_ARRAY__', xorArr('pw-test')).replace('__WORKER_FALLBACK_STRING__', '""');
}

export async function sources() {
  const manual = fillTemplate(fs.readFileSync(process.env.WORKER_SRC_OVERRIDE || path.join(root, 'manual-worker/worker.js'), 'utf8'));
  const realFetch = globalThis.fetch;
  const url = 'file://' + path.join(root, 'js/worker-builder.js');
  globalThis.fetch = async (u) => {
    const f = path.join(root, String(u));
    return fs.existsSync(f) ? { ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8') } : { ok: false, status: 404, text: async () => '' };
  };
  const viaTemplate = await (await import(url + '?tpl')).buildWorker(TOKEN, 'pw-test', '');
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
  const hardcoded = await (await import(url + '?hardcoded')).buildWorker(TOKEN, 'pw-test', '');
  globalThis.fetch = realFetch;
  return { manual, viaTemplate, hardcoded };
}

export function installFakeTimers(delays) {
  const timers = new Map();
  let next = 1;
  globalThis.setTimeout = (fn, ms, ...a) => {
    if (delays.includes(ms)) { const id = 'f' + next++; timers.set(id, { fn: () => fn(...a), ms }); return id; }
    return realSetTimeout(fn, ms, ...a);
  };
  globalThis.clearTimeout = (id) => { if (typeof id === 'string' && id[0] === 'f') timers.delete(id); else realClearTimeout(id); };
  return {
    count: (ms) => [...timers.values()].filter((t) => ms === undefined || t.ms === ms).length,
    fire: (ms) => { for (const [id, t] of [...timers]) if (ms === undefined || t.ms === ms) { timers.delete(id); t.fn(); } },
    clear: () => timers.clear(),
    restore: () => { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }
  };
}

class FakeWS extends EventTarget {
  constructor() { super(); this.readyState = 1; this.binaryType = 'blob'; this.peer = null; this.closeCount = 0; this.sent = []; }
  accept() {}
  send(d) {
    if (this.readyState !== 1) throw new Error('send on closed socket');
    this.sent.push(d);
    const peer = this.peer;
    Promise.resolve().then(() => { const e = new Event('message'); e.data = d; peer.dispatchEvent(e); });
  }
  close() {
    this.closeCount++;
    if (this.readyState === 3) return;
    this.readyState = 3;
    const peer = this.peer;
    Promise.resolve().then(() => { this.dispatchEvent(new Event('close')); if (peer.readyState !== 3) { peer.readyState = 3; peer.dispatchEvent(new Event('close')); } });
  }
}

export function installRuntimeFakes() {
  globalThis.WebSocketPair = class { constructor() { const a = new FakeWS(), b = new FakeWS(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } };
  globalThis.Response = class extends RealResponse {
    constructor(body, init = {}) {
      if (init.status === 101) { super(null, { status: 200 }); Object.defineProperty(this, 'status', { value: 101 }); this.webSocket = init.webSocket; Object.defineProperty(this, 'headers', { value: new Headers(init.headers || {}) }); return; }
      super(body, init);
    }
  };
}

export async function loadWorker(src, tag) {
  const stub = "const __connect = (o) => globalThis.__tcbConnect(o);";
  const imp = src.match(/import\s*\{\s*connect as (\w+)\s*\}\s*from\s*['"]cloudflare:sockets['"];?/);
  if (!imp) throw new Error('socket import not found');
  const code = src.replace(imp[0], `const ${imp[1]} = (o) => globalThis.__tcbConnect(o);`) + `\n//${tag}-${Math.random()}`;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return mod.default;
}

export const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
export const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
export const vlessHeader = (cmd, port, addr) => {
  const a = Uint8Array.from(addr.split('.').map(Number));
  return Uint8Array.from([0, ...hexToBytes(TOKEN.replace(/-/g, '')), 0, cmd, port >> 8, port & 255, 1, ...a]);
};
export const vlessHeaderDomain = (cmd, port, name) => {
  const n = new TextEncoder().encode(name);
  return Uint8Array.from([0, ...hexToBytes(TOKEN.replace(/-/g, '')), 0, cmd, port >> 8, port & 255, 2, n.length, ...n]);
};
export const dnsQuery = (id) => Uint8Array.from([id >> 8, id & 255, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0, 0, 1, 0, 1]);
export const frame = (m) => cat(Uint8Array.from([m.length >> 8, m.length & 255]), m);
export const queryId = (m) => (m[0] << 8) | m[1];

export function bodyController() {
  let ctrl;
  const stream = new ReadableStream({ start(c) { ctrl = c; } });
  return { stream, push: (u) => { try { ctrl.enqueue(u); } catch (_) {} }, end: () => { try { ctrl.close(); } catch (_) {} }, error: (e) => { try { ctrl.error(e || new Error('client abort')); } catch (_) {} } };
}

export async function readUntilDone(res, ms = 2000) {
  const reader = res.body.getReader();
  const chunks = [];
  const t0 = Date.now();
  for (;;) {
    const left = ms - (Date.now() - t0);
    if (left <= 0) { try { reader.cancel(); } catch (_) {} return { closed: false, data: cat(...chunks), chunks }; }
    const r = await Promise.race([reader.read().catch((e) => ({ error: e })), sleep(left).then(() => ({ timeout: true }))]);
    if (r.timeout) { try { reader.cancel(); } catch (_) {} return { closed: false, data: cat(...chunks), chunks }; }
    if (r.error) return { closed: true, errored: true, data: cat(...chunks), chunks };
    if (r.done) return { closed: true, data: cat(...chunks), chunks };
    chunks.push(r.value);
  }
}

export function splitAnswers(data, hasHeader = true) {
  let i = 0;
  const header = hasHeader ? data.slice(0, 2) : new Uint8Array(0);
  i = header.length;
  const answers = [];
  let clean = true;
  while (i < data.length) {
    if (data.length - i < 2) { clean = false; break; }
    const l = (data[i] << 8) | data[i + 1];
    if (data.length - i - 2 < l) { clean = false; break; }
    answers.push(data.slice(i + 2, i + 2 + l));
    i += 2 + l;
  }
  return { header, answers, clean };
}

export function makeDoh() {
  const st = { calls: [], inflight: 0, maxInflight: 0, aborted: 0, handler: null, bodyCancels: 0 };
  globalThis.fetch = (url, init = {}) => {
    const u = String(url);
    const call = { url: u, init, aborted: false };
    st.calls.push(call);
    st.inflight++; st.maxInflight = Math.max(st.maxInflight, st.inflight);
    return new Promise((resolve, reject) => {
      const sig = init.signal;
      const fin = () => { st.inflight--; };
      const onAbort = () => { call.aborted = true; st.aborted++; fin(); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); };
      if (sig) { if (sig.aborted) return onAbort(); sig.addEventListener('abort', onAbort, { once: true }); }
      Promise.resolve(st.handler(call)).then((r) => { if (call.aborted) return; if (sig) sig.removeEventListener('abort', onAbort); fin(); resolve(r); }, (e) => { if (call.aborted) return; if (sig) sig.removeEventListener('abort', onAbort); fin(); reject(e); });
    });
  };
  return st;
}

export const answerFor = (q) => { const q8 = new Uint8Array(q); const a = new Uint8Array(q8.length + 4); a.set(q8); a[2] = 0x81; a[3] = 0x80; a.set([0xde, 0xad, 0xbe, 0xef], q8.length); return a; };
export const okAnswer = (call) => new RealResponse(answerFor(call.init.body), { status: 200, headers: { 'content-type': 'application/dns-message' } });

export function makeCheck() {
  const s = { pass: 0, fail: 0 };
  const check = (n, c, d) => { if (c) { s.pass++; console.log('[PASS] ' + n); } else { s.fail++; console.log('[FAIL] ' + n + (d ? ' :: ' + String(d).slice(0, 300) : '')); } };
  return { s, check };
}
