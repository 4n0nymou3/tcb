import {
  sources, installFakeTimers, installRuntimeFakes, loadWorker, makeDoh, makeCheck, bodyController, readUntilDone, splitAnswers,
  vlessHeader, dnsQuery, frame, cat, queryId, okAnswer, answerFor, sleep, RealResponse
} from './worker-harness.mjs';

const { s, check } = makeCheck();
const ft = installFakeTimers([3000, 5000]);
installRuntimeFakes();
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(e));
const srcs = await sources();

const RealRequest = Request;
const isServfail = (a, id) => queryId(a) === id && (a[2] & 0x80) === 0x80 && (a[3] & 0x0f) === 2;
const idsOf = (answers) => answers.map(queryId).sort((x, y) => x - y);

async function xhttpOpen(worker, closeSpy) {
  const bc = bodyController();
  let closes = 0;
  const OrigTS = globalThis.TransformStream;
  const OrigIdentity = globalThis.IdentityTransformStream;
  if (closeSpy) {
    globalThis.IdentityTransformStream = undefined;
    globalThis.TransformStream = class extends OrigTS {
      constructor(...a) { super(...a); const w = this.writable; const gw = w.getWriter.bind(w); w.getWriter = () => { const wr = gw(); const c = wr.close.bind(wr); wr.close = (...x) => { closes++; return c(...x); }; return wr; }; }
    };
  }
  const res = await worker.fetch(new RealRequest('https://w.example/', { method: 'POST', body: bc.stream, duplex: 'half' }));
  if (closeSpy) { globalThis.TransformStream = OrigTS; globalThis.IdentityTransformStream = OrigIdentity; }
  return { bc, res, closes: () => closes };
}

async function wsOpen(worker) {
  const res = await worker.fetch(new RealRequest('https://w.example/', { headers: { upgrade: 'websocket' } }));
  const cl = res.webSocket;
  cl.accept();
  const msgs = [];
  let closed = 0;
  cl.addEventListener('message', (e) => msgs.push(new Uint8Array(e.data)));
  cl.addEventListener('close', () => { closed++; });
  const sv = cl.peer;
  return { res, cl, sv, msgs, closed: () => closed };
}
const toAB = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.length);

async function until(fn, ms = 2000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(5); } return fn(); }

async function suite(label, worker, src) {
  const dbMatch = src.match(/const _DB=(\d+)/);
  const DB = dbMatch ? Number(dbMatch[1]) : null;
  const p = (n) => `${label}: ${n}`;
  const doh = makeDoh();
  doh.handler = async (c) => okAnswer(c);

  {
    doh.calls.length = 0;
    const { bc, res } = await xhttpOpen(worker);
    const q = dnsQuery(0x1234);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(q)));
    await sleep(30);
    bc.end();
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    check(p('xhttp single query: response stream really closes (done:true) after the request body ends'), r.closed, 'stream stayed open');
    check(p('xhttp single query: VLESS response header is exactly [0,0]'), sp.header.length === 2 && sp.header[0] === 0 && sp.header[1] === 0);
    check(p('xhttp single query: every byte of the answer arrived and the length prefix matches'), sp.clean && sp.answers.length === 1 && sp.answers[0].length === q.length + 4 && queryId(sp.answers[0]) === 0x1234 && r.data.length === 2 + 2 + q.length + 4);
    check(p('xhttp single query: answer content is intact'), sp.answers[0] && sp.answers[0][sp.answers[0].length - 1] === 0xef);
    check(p('xhttp single query: one DoH call to the cloudflare-dns.com endpoint with the DNS message content type'), doh.calls.length === 1 && doh.calls[0].url === 'https://cloudflare-dns.com/dns-query' && doh.calls[0].init.headers['content-type'] === 'application/dns-message');
    check(p('xhttp single query: no DoH request is left in flight and no timer is left behind'), doh.inflight === 0 && ft.count() === 0, `inflight=${doh.inflight} timers=${ft.count()}`);
  }

  {
    doh.calls.length = 0;
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(1, 53, '1.1.1.3'), frame(dnsQuery(1)), frame(dnsQuery(2))));
    await sleep(30);
    bc.end();
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    check(p('xhttp TCP/53: two queries in one stream are both answered, header once, stream closes'), r.closed && sp.clean && idsOf(sp.answers).join() === '1,2' && doh.calls.length === 2 && doh.calls.every((c) => c.url === 'https://family.cloudflare-dns.com/dns-query'));
  }

  {
    doh.calls.length = 0;
    const { bc, res } = await xhttpOpen(worker);
    const all = cat(vlessHeader(2, 53, '1.0.0.2'), frame(dnsQuery(7)), frame(dnsQuery(8)));
    for (const [a, b] of [[0, 5], [5, 30], [30, 40], [40, 41], [41, 43], [43, 50], [50, all.length]]) { bc.push(all.slice(a, b)); await sleep(3); }
    bc.end();
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    check(p('xhttp chunked input: VLESS header and DNS frames split across many chunks are reassembled'), r.closed && sp.clean && idsOf(sp.answers).join() === '7,8' && doh.calls.every((c) => c.url === 'https://security.cloudflare-dns.com/dns-query'));
  }

  {
    doh.calls.length = 0; doh.maxInflight = 0;
    doh.handler = async (c) => { const id = queryId(new Uint8Array(c.init.body)); await sleep(5 * (12 - (id % 12))); return okAnswer(c); };
    const { bc, res } = await xhttpOpen(worker);
    const ids = Array.from({ length: 10 }, (_, i) => 100 + i);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), ...ids.map((i) => frame(dnsQuery(i)))));
    bc.end();
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    check(p('xhttp concurrency: 10 queries answered out of order, none lost, header once, stream closes'), r.closed && sp.clean && idsOf(sp.answers).join() === ids.join() && r.data.slice(0, 2).join() === '0,0', `answers=${sp.answers.length} closed=${r.closed}`);
    check(p('xhttp concurrency: simultaneous DoH requests stay below the 6-connection platform limit'), doh.maxInflight <= 4 && doh.maxInflight >= 1, `max=${doh.maxInflight}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0;
    doh.handler = async (c) => { await sleep(60); return okAnswer(c); };
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(31)), frame(dnsQuery(32))));
    bc.end();
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    check(p('xhttp end of input while answers are pending: the answers are still delivered before the stream closes'), r.closed && sp.clean && idsOf(sp.answers).join() === '31,32', `closed=${r.closed} answers=${sp.answers.length}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0;
    doh.handler = async (c) => { const id = queryId(new Uint8Array(c.init.body)); if (id === 42) return new RealResponse('x', { status: 500 }); if (id === 43) throw new Error('network down'); return okAnswer(c); };
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(41)), frame(dnsQuery(42)), frame(dnsQuery(43)), frame(dnsQuery(44))));
    bc.end();
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    const by = Object.fromEntries(sp.answers.map((a) => [queryId(a), a]));
    check(p('xhttp DoH errors: HTTP 500 and a network error give that query a SERVFAIL, neighbours are unaffected'), r.closed && sp.clean && sp.answers.length === 4 && by[41] && by[41][by[41].length - 1] === 0xef && by[44] && by[44][by[44].length - 1] === 0xef && by[42] && isServfail(by[42], 42) && by[43] && isServfail(by[43], 43), `closed=${r.closed} n=${sp.answers.length}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0; doh.aborted = 0; ft.clear();
    doh.handler = async (c) => { const id = queryId(new Uint8Array(c.init.body)); if (id === 52) return new Promise(() => {}); return okAnswer(c); };
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(51)), frame(dnsQuery(52))));
    bc.end();
    await sleep(80);
    const timersWhileWaiting = ft.count(5000);
    ft.fire(5000);
    const r = await readUntilDone(res);
    const sp = splitAnswers(r.data);
    const by = Object.fromEntries(sp.answers.map((a) => [queryId(a), a]));
    check(p('xhttp DoH timeout: a hung query is aborted at the timeout and answered with SERVFAIL, the good answer is kept'), r.closed && sp.clean && by[51] && by[51][by[51].length - 1] === 0xef && by[52] && isServfail(by[52], 52), `closed=${r.closed} n=${sp.answers.length}`);
    check(p('xhttp DoH timeout: the timed-out request was really aborted and the timer was a normal cancellable timer'), doh.aborted === 1 && timersWhileWaiting >= 1, `aborted=${doh.aborted} timers=${timersWhileWaiting}`);
    check(p('xhttp DoH timeout: nothing is left pending afterwards'), doh.inflight === 0 && ft.count() === 0, `inflight=${doh.inflight} timers=${ft.count()}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0; doh.aborted = 0; ft.clear();
    doh.handler = async () => new Promise(() => {});
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(61)), frame(dnsQuery(62)), frame(dnsQuery(63))));
    await sleep(60);
    await res.body.cancel();
    await sleep(60);
    check(p('xhttp client cancel: cancelling the response aborts every in-flight DoH request'), doh.calls.length >= 1 && doh.aborted === doh.calls.length && doh.inflight === 0, `calls=${doh.calls.length} aborted=${doh.aborted}`);
    const before = doh.calls.length;
    try { bc.push(frame(dnsQuery(64))); } catch (_) {}
    await sleep(40);
    check(p('xhttp client cancel: no new DoH request is started after cancel and no timer is left'), doh.calls.length === before && ft.count() === 0, `timers=${ft.count()}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0; doh.aborted = 0; ft.clear();
    doh.handler = async () => new Promise(() => {});
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(71))));
    await sleep(60);
    bc.error(new Error('client reset'));
    const r = await readUntilDone(res);
    check(p('xhttp request aborted by the client: in-flight DoH is aborted and the response stream closes'), r.closed && doh.aborted === doh.calls.length && doh.inflight === 0 && ft.count() === 0, `closed=${r.closed} aborted=${doh.aborted}/${doh.calls.length}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0;
    const { bc, res, closes } = await xhttpOpen(worker, true);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(81)), frame(dnsQuery(82))));
    await sleep(40);
    bc.end();
    const r = await readUntilDone(res);
    await sleep(40);
    check(p('xhttp closing: the output stream is closed exactly once'), r.closed && closes() === 1, `closes=${closes()}`);
  }

  {
    doh.calls.length = 0;
    const { bc, res } = await xhttpOpen(worker);
    const n = 70;
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1')));
    for (let i = 0; i < n; i++) { bc.push(frame(dnsQuery(1000 + i))); await sleep(2); }
    const r = await readUntilDone(res, 4000);
    const sp = splitAnswers(r.data);
    check(p('subrequest budget: a long-lived stream is capped at the budget, delivers every answer it already produced, then closes'), DB !== null && r.closed && sp.clean && sp.answers.length === doh.calls.length && doh.calls.length === DB, `DB=${DB} calls=${doh.calls.length} answers=${sp.answers.length} closed=${r.closed}`);
    check(p('subrequest budget: the budget stays below the Free plan limit of 50 subrequests per invocation'), DB !== null && DB < 50);
  }

  {
    doh.calls.length = 0;
    doh.handler = async (c) => { await sleep(20); return okAnswer(c); };
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(vlessHeader(2, 53, '1.1.1.1'), ...Array.from({ length: 200 }, (_, i) => frame(dnsQuery(2000 + i)))));
    const r = await readUntilDone(res, 4000);
    const sp = splitAnswers(r.data);
    check(p('queue limit: a flood of queries is bounded, answers already produced are delivered, the stream closes'), r.closed && sp.clean && sp.answers.length === doh.calls.length && doh.calls.length >= 1 && doh.calls.length <= (DB || 0), `calls=${doh.calls.length} answers=${sp.answers.length} closed=${r.closed}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0;
    const bad = Uint8Array.from([1, ...vlessHeader(2, 53, '1.1.1.1').slice(1)]);
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(bad, frame(dnsQuery(5))));
    const r = await readUntilDone(res);
    check(p('xhttp invalid VLESS version: stream closes with no data and no DoH call'), r.closed && r.data.length === 0 && doh.calls.length === 0);
  }

  {
    doh.calls.length = 0;
    const wrong = vlessHeader(2, 53, '1.1.1.1'); wrong[1] ^= 0xff;
    const { bc, res } = await xhttpOpen(worker);
    bc.push(cat(wrong, frame(dnsQuery(5))));
    const r = await readUntilDone(res);
    check(p('xhttp unknown token: stream closes with no data and no DoH call'), r.closed && r.data.length === 0 && doh.calls.length === 0);
  }

  {
    const { bc, res } = await xhttpOpen(worker);
    bc.push(new Uint8Array(9000));
    const r = await readUntilDone(res);
    check(p('xhttp oversized non-VLESS first chunk: stream closes with no data'), r.closed && r.data.length === 0);
  }

  {
    doh.calls.length = 0;
    const w = await wsOpen(worker);
    const q = dnsQuery(0x2222);
    w.cl.send(toAB(cat(vlessHeader(2, 53, '1.1.1.1'), frame(q))));
    await until(() => w.msgs.length >= 1);
    const sp = splitAnswers(w.msgs[0]);
    check(p('ws single query: header [0,0] then one length-prefixed answer, all bytes present'), w.msgs.length === 1 && sp.clean && sp.header.join() === '0,0' && sp.answers.length === 1 && queryId(sp.answers[0]) === 0x2222 && w.msgs[0].length === 2 + 2 + q.length + 4);
    w.cl.send(toAB(frame(dnsQuery(0x2223))));
    await until(() => w.msgs.length >= 2);
    const sp2 = splitAnswers(w.msgs[1], false);
    check(p('ws follow-up query on the same socket: answered without a second VLESS header'), w.msgs.length === 2 && sp2.clean && sp2.answers.length === 1 && queryId(sp2.answers[0]) === 0x2223);
    w.cl.close();
    await sleep(40);
    check(p('ws client close: server socket is closed once and nothing is left in flight'), w.sv.readyState === 3 && doh.inflight === 0 && ft.count() === 0);
  }

  {
    doh.calls.length = 0; doh.maxInflight = 0;
    doh.handler = async (c) => { const id = queryId(new Uint8Array(c.init.body)); await sleep(5 * (12 - (id % 12))); return okAnswer(c); };
    const w = await wsOpen(worker);
    const ids = Array.from({ length: 10 }, (_, i) => 300 + i);
    w.cl.send(toAB(cat(vlessHeader(2, 53, '1.1.1.1'), ...ids.map((i) => frame(dnsQuery(i))))));
    await until(() => w.msgs.length >= 10, 3000);
    const flat = cat(...w.msgs);
    const sp = splitAnswers(flat);
    check(p('ws concurrency: 10 queries all answered out of order with the header sent once and DoH concurrency bounded'), sp.clean && idsOf(sp.answers).join() === ids.join() && doh.maxInflight <= 4, `answers=${sp.answers.length} max=${doh.maxInflight}`);
    w.cl.close();
    await sleep(30);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0;
    doh.handler = async (c) => { const id = queryId(new Uint8Array(c.init.body)); if (id === 402) return new RealResponse('x', { status: 503 }); return okAnswer(c); };
    const w = await wsOpen(worker);
    w.cl.send(toAB(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(401)), frame(dnsQuery(402)), frame(dnsQuery(403)))));
    await until(() => w.msgs.length >= 3);
    const sp = splitAnswers(cat(...w.msgs));
    const by = Object.fromEntries(sp.answers.map((a) => [queryId(a), a]));
    check(p('ws DoH error: that query gets SERVFAIL, the socket stays open and the other answers are kept'), sp.answers.length === 3 && by[402] && isServfail(by[402], 402) && by[401] && by[403] && w.sv.readyState === 1);
    w.cl.close();
    await sleep(30);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0; doh.aborted = 0; ft.clear();
    doh.handler = async (c) => { const id = queryId(new Uint8Array(c.init.body)); if (id === 502) return new Promise(() => {}); return okAnswer(c); };
    const w = await wsOpen(worker);
    w.cl.send(toAB(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(501)), frame(dnsQuery(502)))));
    await sleep(80);
    ft.fire(5000);
    await until(() => w.msgs.length >= 2);
    const sp = splitAnswers(cat(...w.msgs));
    const by = Object.fromEntries(sp.answers.map((a) => [queryId(a), a]));
    check(p('ws DoH timeout: aborted at the timeout, SERVFAIL for it, earlier answer kept, no leftovers'), sp.answers.length === 2 && by[502] && isServfail(by[502], 502) && doh.aborted === 1 && doh.inflight === 0 && ft.count() === 0);
    w.cl.close();
    await sleep(30);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0; doh.aborted = 0; ft.clear();
    doh.handler = async () => new Promise(() => {});
    const w = await wsOpen(worker);
    w.cl.send(toAB(cat(vlessHeader(2, 53, '1.1.1.1'), frame(dnsQuery(601)), frame(dnsQuery(602)))));
    await sleep(60);
    w.cl.close();
    await sleep(60);
    check(p('ws client cancel: closing the socket aborts all in-flight DoH requests and leaves no timers'), doh.calls.length >= 1 && doh.aborted === doh.calls.length && doh.inflight === 0 && ft.count() === 0, `calls=${doh.calls.length} aborted=${doh.aborted} timers=${ft.count()}`);
    doh.handler = async (c) => okAnswer(c);
  }

  {
    doh.calls.length = 0;
    const w = await wsOpen(worker);
    w.cl.send(toAB(vlessHeader(2, 53, '1.1.1.1')));
    await sleep(20);
    for (let i = 0; i < 60; i++) { if (w.sv.readyState === 3) break; w.cl.send(toAB(frame(dnsQuery(700 + i)))); await sleep(3); }
    await until(() => w.sv.readyState === 3, 4000);
    const sp = splitAnswers(cat(...w.msgs));
    check(p('ws subrequest budget: capped at the budget, every produced answer delivered, then the socket closes'), DB !== null && w.sv.readyState === 3 && sp.clean && sp.answers.length === doh.calls.length && doh.calls.length === DB, `DB=${DB} calls=${doh.calls.length} answers=${sp.answers.length} state=${w.sv.readyState}`);
  }
}

await suite('manual', await loadWorker(srcs.manual, 'm'), srcs.manual);
await suite('hardcoded', await loadWorker(srcs.hardcoded, 'h'), srcs.hardcoded);

check('manual Worker and the hardcoded copy in worker-builder.js contain identical DNS logic', (() => { const pick = (x) => { const a = x.indexOf('const _CFD='); const b = x.indexOf('async function _hw('); return x.slice(a, b); }; return pick(srcs.manual) === pick(srcs.hardcoded) && pick(srcs.manual).length > 500; })());
check('manual Worker, template-built Worker and hardcoded copy are byte-identical after placeholder substitution', srcs.manual === srcs.viaTemplate && srcs.manual === srcs.hardcoded);
check('no unhandled promise rejection happened during the DNS tests', unhandled.length === 0, unhandled.map((e) => e && e.message).join('|'));

ft.restore();
console.log(`\n${s.pass}/${s.pass + s.fail} worker dns/xhttp checks passed.`);
process.exit(s.fail ? 1 : 0);
