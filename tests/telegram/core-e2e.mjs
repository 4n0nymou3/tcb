import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import http2 from 'node:http2';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const coresDir = process.env.CORES_DIR;
if (!coresDir) { console.log('[SKIP] core-e2e: set CORES_DIR to a folder holding xray/xray and mihomo'); process.exit(0); }
const xrayBin = path.join(coresDir, 'xray/xray');
const mihomoBin = path.join(coresDir, 'mihomo');
const TOKEN = '11111111-2222-4333-8444-555555555555';
const HPORT = 8790, WPORT = 8788, EPORT = 9101, WINSP = 9391;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcb-core-e2e-'));
const procs = [];
const keyF = path.join(tmp, 'k.pem'), crtF = path.join(tmp, 'c.pem');
await new Promise((res, rej) => execFile('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyF, '-out', crtF, '-days', '2', '-subj', '/CN=x.example', '-addext', 'subjectAltName=DNS:x.example,DNS:localhost,IP:127.0.0.1'], (e) => (e ? rej(e) : res())));
const pin = crypto.createHash('sha256').update(new crypto.X509Certificate(fs.readFileSync(crtF)).raw).digest('hex');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('[PASS] ' + n); } else { fail++; console.log('[FAIL] ' + n + (d ? ' :: ' + String(d).slice(0, 300) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, opts = {}) => { const lf = fs.openSync(path.join(tmp, path.basename(cmd) + procs.length + '.log'), 'w'); const p = spawn(cmd, args, { stdio: ['ignore', lf, lf], detached: false, ...opts }); procs.push(p); return p; };
const sh = (cmd, args, timeout = 40000) => new Promise((res) => execFile(cmd, args, { timeout, encoding: 'buffer', maxBuffer: 1 << 26 }, (e, out) => res({ err: e, out })));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

globalThis.fetch = async (u) => { const f = path.join(root, String(u)); return fs.existsSync(f) ? { ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8') } : { ok: false, status: 404, text: async () => '' }; };
const { buildWorker } = await import(path.join(root, 'js/worker-builder.js'));
const wdir = path.join(tmp, 'w'); fs.mkdirSync(wdir);
fs.writeFileSync(path.join(wdir, 'index.js'), await buildWorker(TOKEN, 'pw-test', ''));
fs.writeFileSync(path.join(wdir, 'wrangler.toml'), 'name="t"\nmain="index.js"\ncompatibility_date="2026-09-23"\n');

const blob = crypto.randomBytes(3 * 1024 * 1024);
const upBlob = crypto.randomBytes(3 * 1024 * 1024);
const srv = http.createServer((req, res) => {
  if (req.method === 'POST') { const h = crypto.createHash('sha256'); req.on('data', (c) => h.update(c)); req.on('end', () => { res.end(h.digest('hex')); }); return; }
  res.setHeader('content-length', blob.length); res.end(blob);
}).listen(EPORT, '127.0.0.1');

const wr = run('npx', ['--prefix', path.join(root, 'tests/telegram'), 'wrangler', 'dev', '--local', '--port', String(WPORT), '--inspector-port', String(WINSP)], { cwd: wdir });
let up = false;
for (let i = 0; i < 60 && !up; i++) { await sleep(1000); try { const r = await fetch0(`http://127.0.0.1:${WPORT}/`); up = r === 200; } catch (_) {} }
function fetch0(u) { return new Promise((res, rej) => http.get(u, (r) => { r.resume(); res(r.statusCode); }).on('error', rej)); }
check('local workerd serves the built worker', up);

const xrayCfg = (port, stream, target = WPORT) => ({ log: { loglevel: 'warning' }, inbounds: [{ listen: '127.0.0.1', port, protocol: 'socks', settings: { udp: true } }], outbounds: [{ protocol: 'vless', settings: { vnext: [{ address: '127.0.0.1', port: target, users: [{ id: TOKEN, encryption: 'none' }] }] }, streamSettings: stream }] });
fs.writeFileSync(path.join(tmp, 'x-ws.json'), JSON.stringify(xrayCfg(10821, { network: 'ws', wsSettings: { host: 'x.example', path: '/?ed=2560' } })));
const h2front = http2.createSecureServer({ key: fs.readFileSync(keyF), cert: fs.readFileSync(crtF), allowHTTP1: false });
h2front.on('request', (req, res) => {
  const up = http.request({ host: '127.0.0.1', port: WPORT, method: req.method, path: req.url, headers: { host: 'x.example', 'content-type': req.headers['content-type'] || 'application/octet-stream', 'transfer-encoding': 'chunked' } }, (ur) => { res.writeHead(ur.statusCode, { 'content-type': ur.headers['content-type'], 'cache-control': 'no-store' }); ur.pipe(res); });
  up.on('error', () => { try { res.destroy(); } catch (_) {} });
  req.pipe(up);
  res.on('close', () => up.destroy());
});
h2front.listen(HPORT, '127.0.0.1');
fs.writeFileSync(path.join(tmp, 'x-xh.json'), JSON.stringify(xrayCfg(10822, { network: 'xhttp', xhttpSettings: { host: 'x.example', path: '/', mode: 'stream-one' }, security: 'tls', tlsSettings: { serverName: 'x.example', alpn: ['h2'], pinnedPeerCertSha256: pin } }, HPORT)));
const mh = path.join(tmp, 'mh'); fs.mkdirSync(mh);
fs.writeFileSync(path.join(mh, 'config.yaml'), JSON.stringify({ 'mixed-port': 10823, mode: 'global', 'log-level': 'warning', proxies: [{ name: 'p', type: 'vless', server: '127.0.0.1', port: HPORT, uuid: TOKEN, udp: false, tls: true, 'skip-cert-verify': true, servername: 'x.example', alpn: ['h2'], network: 'xhttp', 'xhttp-opts': { path: '/', host: 'x.example', mode: 'stream-one' } }], 'proxy-groups': [{ name: 'GLOBAL', type: 'select', proxies: ['p'] }] }));
const env = { ...process.env, XRAY_LOCATION_ASSET: coresDir };
run(xrayBin, ['run', '-c', path.join(tmp, 'x-ws.json')], { env });
run(xrayBin, ['run', '-c', path.join(tmp, 'x-xh.json')], { env });
run(mihomoBin, ['-d', mh, '-f', path.join(mh, 'config.yaml')]);
await sleep(3000);

const upFile = path.join(tmp, 'up.bin'); fs.writeFileSync(upFile, upBlob);
for (const [label, scheme, port] of [['xray over WebSocket', 'socks5h', 10821], ['xray over XHTTP stream-one', 'socks5h', 10822], ['mihomo over XHTTP stream-one', 'http', 10823]]) {
  const proxy = `${scheme}://127.0.0.1:${port}`;
  const d = await sh('curl', ['-s', '-m', '40', '-x', proxy, `http://127.0.0.1:${EPORT}/big`]);
  check(`${label}: 3 MB download arrives intact`, !d.err && d.out.length === blob.length && sha(d.out) === sha(blob), d.err && d.err.message);
  const u = await sh('curl', ['-s', '-m', '40', '-x', proxy, '--data-binary', '@' + upFile, '-H', 'content-type: application/octet-stream', `http://127.0.0.1:${EPORT}/up`]);
  check(`${label}: 3 MB upload arrives intact`, !u.err && u.out.toString() === sha(upBlob), u.err && u.err.message);
  let ok = 0;
  const rs = await Promise.all(Array.from({ length: 8 }, () => sh('curl', ['-s', '-m', '30', '-x', proxy, `http://127.0.0.1:${EPORT}/big`])));
  for (const r of rs) if (!r.err && r.out.length === blob.length) ok++;
  check(`${label}: 8 parallel connections all complete`, ok === 8, ok + '/8');
}

for (const p of procs) { try { p.kill('SIGKILL'); } catch (_) {} }
srv.close(); h2front.close();
await sleep(500);
if (!process.env.KEEP_TMP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('tmp kept: ' + tmp);
console.log(`\n${pass}/${pass + fail} core e2e checks passed.`);
process.exit(fail ? 1 : 0);