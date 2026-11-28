import {
  sources, installFakeTimers, installRuntimeFakes, loadWorker, makeDoh, makeCheck, bodyController, readUntilDone,
  vlessHeader, vlessHeaderDomain, cat, sleep, RealResponse
} from './worker-harness.mjs';

const { s, check } = makeCheck();
const ft = installFakeTimers([3000, 5000]);
installRuntimeFakes();
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(e));
const srcs = await sources();
const RealRequest = Request;
const enc = new TextEncoder();
const td = new TextDecoder();

function mkSocket(kind, chunks = []) {
  const sock = { kind, closeCalls: 0, writes: [], resolveOpened: null, rejectOpened: null };
  sock.opened = new Promise((res, rej) => { sock.resolveOpened = res; sock.rejectOpened = rej; });
  if (kind === 'ok') sock.resolveOpened();
  if (kind === 'fail') { sock.opened.catch(() => {}); sock.rejectOpened(new Error('refused')); }
  if (kind === 'hang') sock.opened.catch(() => {});
  let rc;
  sock.readable = new ReadableStream({ start(c) { rc = c; for (const ch of chunks) c.enqueue(enc.encode(ch)); if (kind === 'ok' || kind === 'late') c.close(); } });
  sock.closeReadable = () => { try { rc.close(); } catch (_) {} };
  sock.writable = new WritableStream({ write(c) { sock.writes.push(td.decode(c)); } });
  sock.close = () => { sock.closeCalls++; try { rc.close(); } catch (_) {} };
  return sock;
}

let plan = [];
let connects = [];
globalThis.__tcbConnect = (o) => { connects.push(o); const mk = plan[connects.length - 1]; if (!mk) throw new Error('unexpected connect #' + connects.length); const sk = mk(); sk.target = o; made.push(sk); return sk; };
let made = [];
const reset = (...p) => { plan = p; connects = []; made = []; ft.clear(); };

async function call(worker, header, payload = '') {
  const bc = bodyController();
  const res = await worker.fetch(new RealRequest('https://w.example/', { method: 'POST', body: bc.stream, duplex: 'half' }));
  bc.push(cat(header, enc.encode(payload)));
  return { bc, res };
}
const text = (u) => td.decode(u.slice(2));

async function suite(label, worker) {
  const p = (n) => `${label}: ${n}`;
  const v4h = vlessHeader(1, 80, '93.184.216.34');
  const dohJson = makeDoh();

  {
    reset(() => mkSocket('ok', ['HELLO']));
    const { bc, res } = await call(worker, v4h, 'GET / HTTP/1.0\r\n\r\n');
    const r = await readUntilDone(res);
    bc.end();
    check(p('connect succeeds before the timeout: data flows, stream closes, no fallback'), r.closed && r.data[0] === 0 && r.data[1] === 0 && text(r.data) === 'HELLO' && connects.length === 1 && made[0].writes.join('') === 'GET / HTTP/1.0\r\n\r\n', `calls=${connects.length}`);
    check(p('connect succeeds: the 3 s timer is cancelled and nothing is left pending'), ft.count() === 0, `timers=${ft.count()}`);
    check(p('connect succeeds: the target was the original host and port'), connects[0].hostname === '93.184.216.34' && connects[0].port === 80);
  }

  {
    reset(() => mkSocket('fail'), () => mkSocket('ok', ['VIA-NAT64']));
    const { bc, res } = await call(worker, v4h, 'PING');
    const r = await readUntilDone(res);
    bc.end();
    check(p('failed connection: the failed socket is closed exactly once'), made[0].closeCalls === 1, `closes=${made[0].closeCalls}`);
    check(p('failed connection: NAT64 fallback runs exactly once with the IPv4 embedded in an IPv6 address'), connects.length === 2 && /^\[[0-9a-f:]+\]$/i.test(connects[1].hostname) && connects[1].hostname.toLowerCase().endsWith('5db8:d822]') && connects[1].port === 80, `hosts=${connects.map((c) => c.hostname).join(',')}`);
    check(p('failed connection: the client receives the data from the fallback connection and the initial bytes were re-sent'), r.closed && text(r.data) === 'VIA-NAT64' && made[1].writes.join('') === 'PING');
    check(p('failed connection: no timer is left'), ft.count() === 0);
  }

  {
    reset(() => mkSocket('hang'), () => mkSocket('ok', ['AFTER-TIMEOUT']));
    const { bc, res } = await call(worker, v4h, 'PING');
    await sleep(60);
    check(p('hanging connection: before the timeout fires there is exactly one attempt and one 3 s timer'), connects.length === 1 && ft.count(3000) === 1, `calls=${connects.length} timers=${ft.count(3000)}`);
    ft.fire(3000);
    const r = await readUntilDone(res);
    bc.end();
    check(p('hanging connection: after 3 s the hung socket is closed once and the fallback runs exactly once'), made[0].closeCalls === 1 && connects.length === 2 && connects[1].hostname.startsWith('['), `closes=${made[0].closeCalls} calls=${connects.length}`);
    check(p('hanging connection: the fallback connection delivers its data and the stream closes'), r.closed && text(r.data) === 'AFTER-TIMEOUT');
    made[0].resolveOpened();
    await sleep(40);
    check(p('hanging connection: a late "opened" of the abandoned socket changes nothing'), connects.length === 2 && ft.count() === 0);
  }

  {
    reset(() => mkSocket('hang'), () => mkSocket('hang'));
    const { bc, res } = await call(worker, v4h, 'PING');
    await sleep(40);
    ft.fire(3000);
    await sleep(40);
    const t2 = ft.count(3000);
    ft.fire(3000);
    const r = await readUntilDone(res);
    bc.end();
    check(p('hang then hang: each attempt gets its own 3 s timer, both sockets are closed, the stream closes without data'), r.closed && r.data.length === 0 && made.length === 2 && made.every((x) => x.closeCalls === 1) && t2 === 1, `closed=${r.closed} made=${made.length} t2=${t2}`);
    check(p('hang then hang: there is no third attempt and no timer is left'), connects.length === 2 && ft.count() === 0);
  }

  {
    reset(() => mkSocket('hang', ['DATA']));
    const { bc, res } = await call(worker, v4h, 'PING');
    await sleep(40);
    made[0].resolveOpened();
    await sleep(40);
    ft.fire(3000);
    made[0].closeReadable();
    await sleep(40);
    check(p('success just before the deadline: the old timer cannot trigger a fallback later'), connects.length === 1 && made[0].closeCalls === 0 && ft.count() === 0, `calls=${connects.length} closes=${made[0].closeCalls}`);
    bc.end();
    await readUntilDone(res, 500);
  }

  {
    reset(() => mkSocket('ok', []), () => mkSocket('ok', ['SECOND']));
    const { bc, res } = await call(worker, v4h, 'PING');
    const r = await readUntilDone(res);
    bc.end();
    check(p('connected but no data and closed: fallback runs once and its data is delivered'), connects.length === 2 && text(r.data) === 'SECOND' && r.closed, `calls=${connects.length}`);
  }

  {
    reset(() => mkSocket('ok', []), () => mkSocket('ok', []));
    const { bc, res } = await call(worker, v4h, 'PING');
    const r = await readUntilDone(res);
    bc.end();
    check(p('no data twice: the fallback is not repeated and the stream closes'), connects.length === 2 && r.closed && r.data.length === 0, `calls=${connects.length}`);
  }

  {
    const v6 = Uint8Array.from([0, ...vlessHeader(1, 80, '1.1.1.1').slice(1, 18), 1, 0, 80, 3, 0x26, 0x06, 0x47, 0, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10, 0x01]);
    reset(() => mkSocket('fail'));
    const { bc, res } = await call(worker, v6, 'PING');
    const r = await readUntilDone(res);
    bc.end();
    check(p('IPv6 target that fails: no NAT64 fallback is attempted and the stream closes'), r.closed && connects.length === 1);
  }

  {
    dohJson.calls.length = 0;
    dohJson.handler = async () => new RealResponse(JSON.stringify({ Answer: [{ type: 1, data: '93.184.216.34' }] }), { status: 200 });
    reset(() => mkSocket('fail'), () => mkSocket('ok', ['DOMAIN-FALLBACK']));
    const { bc, res } = await call(worker, vlessHeaderDomain(1, 443, 'example.org'), 'PING');
    const r = await readUntilDone(res);
    bc.end();
    check(p('domain target that fails: the name is resolved once and the NAT64 fallback runs once'), r.closed && text(r.data) === 'DOMAIN-FALLBACK' && dohJson.calls.length === 1 && connects.length === 2 && connects[1].hostname.toLowerCase().endsWith('5db8:d822]'), `calls=${connects.length} doh=${dohJson.calls.length}`);
  }

  {
    dohJson.calls.length = 0;
    dohJson.handler = async () => new RealResponse(JSON.stringify({}), { status: 200 });
    reset(() => mkSocket('hang'));
    const { bc, res } = await call(worker, vlessHeaderDomain(1, 443, 'example.org'), 'PING');
    await sleep(30);
    ft.fire(3000);
    const r = await readUntilDone(res);
    bc.end();
    check(p('domain target that hangs and cannot be resolved: the stream closes with no data and no second connect'), r.closed && r.data.length === 0 && connects.length === 1 && made[0].closeCalls === 1 && ft.count() === 0);
  }
}

await suite('manual', await loadWorker(srcs.manual, 'm'));
await suite('hardcoded', await loadWorker(srcs.hardcoded, 'h'));
check('no unhandled promise rejection during the connect tests', unhandled.length === 0, unhandled.map((e) => e && e.message).join('|'));
ft.restore();
console.log(`\n${s.pass}/${s.pass + s.fail} worker connect/fallback checks passed.`);
process.exit(s.fail ? 1 : 0);
