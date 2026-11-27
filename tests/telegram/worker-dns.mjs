import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let src = fs.readFileSync(path.join(root, 'manual-worker/worker.js'), 'utf8');
const imp = src.match(/import\s*\{\s*connect as (\w+)\s*\}\s*from\s*['"]cloudflare:sockets['"];?/);
if (!imp) throw new Error('socket import not found');
src = src.replace(imp[0], `const ${imp[1]} = () => { throw new Error('direct connect is not expected in this test'); };`);
const TOKEN = '11111111-2222-4333-8444-555555555555';
const xorArr = (s) => '[' + [...s].map((c) => c.charCodeAt(0) ^ 75).join(',') + ']';
src = src.replace('__WORKER_TOKEN_ARRAY__', xorArr(TOKEN)).replace('__WORKER_TROJAN_ARRAY__', xorArr('pw-test')).replace('__WORKER_FALLBACK_STRING__', "''");
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('[PASS] ' + n); } else { fail++; console.log('[FAIL] ' + n + (d ? ' :: ' + d : '')); } };

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const q = new Uint8Array(init.body);
  const ans = new Uint8Array(q.length + 4);
  ans.set(q); ans.set([0xde, 0xad, 0xbe, 0xef], q.length);
  return new Response(ans, { status: 200, headers: { 'content-type': 'application/dns-message' } });
};
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const worker = mod.default;
const uuidHex = TOKEN.replace(/-/g, '');
check('worker template placeholders are all filled', !/__WORKER_/.test(src));

const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
const vlessHeader = (cmd, port, addr) => {
  const a = Uint8Array.from(addr.split('.').map(Number));
  return Uint8Array.from([0, ...hexToBytes(uuidHex), 0, cmd, port >> 8, port & 255, 1, ...a]);
};
const dnsFrame = (id, extra = 0) => { const m = Uint8Array.from([id >> 8, id & 255, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0, 0, 1, 0, 1]); return Uint8Array.from([m.length >> 8, m.length & 255, ...m]); };
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

async function post(chunks) {
  const body = new ReadableStream({ async start(c) { for (const ch of chunks) { c.enqueue(ch); await new Promise((r) => setTimeout(r, 5)); } await new Promise((r) => setTimeout(r, 50)); c.close(); } });
  const res = await worker.fetch(new Request('https://w.example/', { method: 'POST', body, duplex: 'half' }));
  const reader = res.body.getReader();
  const out = [];
  const t = Date.now();
  while (Date.now() - t < 1500) {
    const r = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ timeout: true }), 400))]);
    if (r.timeout || r.done) break;
    out.push(r.value);
  }
  try { reader.cancel(); } catch (_) {}
  return { status: res.status, ctype: res.headers.get('content-type'), data: cat(...out) };
}

if (uuidHex) {
  calls.length = 0;
  const f1 = dnsFrame(0x1234);
  const r1 = await post([cat(vlessHeader(2, 53, '1.1.1.1'), f1)]);
  check('xhttp: response is 200 octet-stream', r1.status === 200 && r1.ctype === 'application/octet-stream');
  check('xhttp: UDP/53 to 1.1.1.1 is answered through DoH with the cloudflare-dns.com endpoint', calls.length === 1 && calls[0].url === 'https://cloudflare-dns.com/dns-query' && calls[0].init.method === 'POST' && calls[0].init.headers['content-type'] === 'application/dns-message');
  const ansLen = f1.length - 2 + 4;
  check('xhttp: reply starts with the 2-byte VLESS response header and a length-prefixed DNS answer', r1.data.length === 2 + 2 + ansLen && r1.data[0] === 0 && r1.data[1] === 0 && ((r1.data[2] << 8) | r1.data[3]) === ansLen && r1.data[2 + 2 + ansLen - 1] === 0xef);

  calls.length = 0;
  const r2 = await post([vlessHeader(1, 53, '1.1.1.3'), dnsFrame(1), dnsFrame(2)]);
  check('xhttp: TCP/53 to 1.1.1.3 uses the family endpoint, one query per frame', calls.length === 2 && calls.every((c) => c.url === 'https://family.cloudflare-dns.com/dns-query'));
  check('xhttp: only the first reply carries the VLESS response header', r2.data.length === 2 + 2 * (2 + dnsFrame(1).length - 2 + 4) && r2.data[0] === 0 && r2.data[1] === 0);

  calls.length = 0;
  const split = cat(vlessHeader(2, 53, '1.0.0.2'), dnsFrame(7));
  const r3 = await post([split.slice(0, 5), split.slice(5, 30), split.slice(30)]);
  check('xhttp: a VLESS header split over several chunks is reassembled; 1.0.0.2 uses the security endpoint', calls.length === 1 && calls[0].url === 'https://security.cloudflare-dns.com/dns-query' && r3.data.length > 4);

  calls.length = 0;
  const bad = Uint8Array.from([1, ...hexToBytes(uuidHex), 0, 1, 0, 53, 1, 1, 1, 1, 1]);
  const r4 = await post([bad]);
  check('xhttp: a wrong VLESS version is dropped without any DoH call or data', calls.length === 0 && r4.data.length === 0);

  const wrongId = vlessHeader(2, 53, '1.1.1.1'); wrongId[1] ^= 0xff;
  calls.length = 0;
  const r5 = await post([cat(wrongId, dnsFrame(9))]);
  check('xhttp: an unknown token is dropped without any DoH call or data', calls.length === 0 && r5.data.length === 0);

  const r6 = await post([new Uint8Array(9000)]);
  check('xhttp: an oversized non-VLESS first chunk is dropped', r6.data.length === 0);

  const g = await worker.fetch(new Request('https://w.example/'));
  check('plain GET still reaches the fallback handler', g.status === 200 || g.status === 404 || g.status === 502);
}

console.log(`\n${pass}/${pass + fail} worker dns/xhttp checks passed.`);
process.exit(fail ? 1 : 0);