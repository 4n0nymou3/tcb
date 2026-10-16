import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const esbuildBin = createRequire(import.meta.url).resolve('esbuild/bin/esbuild');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = execFileSync(esbuildBin, [path.join(root, 'js/app.js'), '--bundle', '--format=iife', '--log-level=error'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log('[PASS] ' + name); } else { fail++; console.log('[FAIL] ' + name + (detail ? ' :: ' + detail : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const downloads = [];
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://tcb.example/' });
const w = dom.window;
w.TextEncoder = TextEncoder;
w.TextDecoder = TextDecoder;
w.URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:x'; };
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () { downloads.push({ anchor: this.download }); };
w.fetch = async (url) => {
  const file = path.join(root, String(url));
  if (!fs.existsSync(file)) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => fs.readFileSync(file, 'utf8') };
};
let clip = '';
w.Element.prototype.scrollIntoView = function () {};
Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (v) => { clip = v; } }, configurable: true });
w.eval(bundle);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
await sleep(200);

const $ = (id) => w.document.getElementById(id);
const click = (id) => $(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const setVal = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
const setCk = (id, v) => { $(id).checked = v; $(id).dispatchEvent(new w.Event('change', { bubbles: true })); };

check('default: telegram is off and its body hidden', !$('tgEnable').checked && $('tgBody').style.display === 'none');
check('default: classic copy/download buttons visible', $('btn-cp-worker').style.display !== 'none' && $('btn-dl-worker').style.display !== 'none');

setVal('wdom', 'myworker.someone.workers.dev');
setCk('tgEnable', true);
check('enable: body visible and classic copy/download hidden', $('tgBody').style.display === 'block' && $('btn-cp-worker').style.display === 'none' && $('btn-dl-worker').style.display === 'none');
const secret1 = $('tgSecret').value;
check('enable: secret is 32 lowercase hex', /^[0-9a-f]{32}$/.test(secret1), secret1);
check('enable: hostname comes from the worker domain', $('tgHost').value === 'myworker.someone.workers.dev');
check('enable: link is the t.me/webproxy format', $('tgLink').value === `https://t.me/webproxy?server=myworker.someone.workers.dev&secret=${secret1}`, $('tgLink').value);

setCk('tgPadding', true);
check('padding: secret gets dd prefix and keeps the same random part', $('tgSecret').value === 'dd' + secret1 && /^dd[0-9a-f]{32}$/.test($('tgSecret').value));
setCk('tgPadding', false);
check('padding: toggling back restores the plain secret', $('tgSecret').value === secret1);

click('btn-mk-tg');
check('regenerate: a different secret is produced', $('tgSecret').value !== secret1 && /^[0-9a-f]{32}$/.test($('tgSecret').value));

check('manual secret: the field is editable (not readonly)', !$('tgSecret').readOnly && !$('tgSecret').hasAttribute('readonly'));
const manual = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
setVal('tgSecret', manual);
check('manual secret: a valid pasted secret is kept as typed', $('tgSecret').value === manual && $('tgSecret').dataset.base === manual && !$('tgPadding').checked, $('tgSecret').value);
check('manual secret: the link uses the pasted secret', $('tgLink').value === `https://t.me/webproxy?server=myworker.someone.workers.dev&secret=${manual}`, $('tgLink').value);
setVal('uid', $('uid').value + '');
setVal('wdom', 'myworker.someone.workers.dev');
check('manual secret: unrelated panel edits do not replace it', $('tgSecret').value === manual);
setCk('tgPadding', true);
check('manual secret: padding toggle keeps the pasted random part', $('tgSecret').value === 'dd' + manual);
setCk('tgPadding', false);
setVal('tgSecret', 'DD' + manual.toUpperCase());
check('manual secret: dd-prefixed uppercase paste is normalised and turns padding on', $('tgSecret').value === 'dd' + manual && $('tgPadding').checked && $('tgSecret').dataset.base === manual, $('tgSecret').value);
check('manual secret: link carries the dd secret', $('tgLink').value.endsWith('secret=dd' + manual), $('tgLink').value);
setCk('tgPadding', false);
setVal('tgSecret', '  ' + manual + '  ');
check('manual secret: surrounding whitespace is accepted and trimmed', $('tgSecret').value === manual, JSON.stringify($('tgSecret').value));
const bad = manual.slice(0, 20);
setVal('tgSecret', bad);
check('invalid secret: typed text is not replaced by a random one', $('tgSecret').value === bad, $('tgSecret').value);
check('invalid secret: link is emptied and a warning is shown', $('tgLink').value === '' && $('tgWarn').style.display !== 'none' && $('tgWarnText').textContent.includes('Secret'), $('tgWarnText').textContent);
setVal('uid', $('uid').value);
check('invalid secret: other panel edits still do not overwrite the draft', $('tgSecret').value === bad);
const dlBefore = downloads.length;
click('btn-dl-tg');
await sleep(400);
check('invalid secret: package download is blocked', downloads.length === dlBefore, String(downloads.length - dlBefore));
setVal('tgSecret', 'zz' + manual.slice(2));
check('invalid secret: non-hex characters are rejected', $('tgSecret').dataset.draft === '1' && $('tgLink').value === '');
setVal('tgSecret', '');
check('invalid secret: an empty box is not silently refilled', $('tgSecret').value === '' && $('tgSecret').dataset.draft === '1');
setVal('tgSecret', manual);
check('invalid secret: fixing the value restores link and clears the warning state', $('tgSecret').dataset.draft === undefined && $('tgLink').value.endsWith('secret=' + manual));
setVal('tgSecret', bad);
click('btn-mk-tg');
check('manual secret: New replaces even an invalid draft with a fresh random secret', /^[0-9a-f]{32}$/.test($('tgSecret').value) && $('tgSecret').value !== manual && $('tgSecret').dataset.draft === undefined, $('tgSecret').value);
setVal('tgSecret', manual);
const dl0 = downloads.length;
click('btn-dl-tg');
await sleep(800);
const zipBlobs = downloads.slice(dl0).filter((d) => !d.anchor);
let zipHasSecret = true;
try {
  zipHasSecret = false;
  for (const b of zipBlobs) {
    const buf = Buffer.from(await new Promise((res, rej) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(b); }));
    if (buf.includes(Buffer.from(manual))) zipHasSecret = true;
  }
} catch { zipHasSecret = true; }
check('manual secret: package download still works and the ZIP never contains the secret', downloads.length > dl0 && zipBlobs.length > 0 && !zipHasSecret, `blobs=${zipBlobs.length}`);
check('manual secret: field still shows the typed secret after download', $('tgSecret').value === manual);
click('btn-mk-tg');

setCk('customDomainUsed', true);
setVal('customDomainInput', 'Proxy.Example.com');
check('custom domain: hostname switches to the lowercase custom domain', $('tgHost').value === 'proxy.example.com', $('tgHost').value);
setCk('customDomainUsed', false);
check('custom domain off: hostname returns to the worker domain', $('tgHost').value === 'myworker.someone.workers.dev');

setVal('wdom', 'not a domain');
check('invalid domain: link empty and warning shown', $('tgLink').value === '' && $('tgWarn').style.display !== 'none');
setVal('wdom', 'myworker.someone.workers.dev');

click('tab-pages');
check('pages tab: download button label is the two-ZIP Pages label', $('btn-dl-tg').textContent.includes('Pages') && $('btn-dl-tg').textContent.includes('ZIP'), $('btn-dl-tg').textContent);
check('pages tab: classic pages zip button hidden while telegram is on', $('btn-dl-worker-zip').style.display === 'none');
click('tab-worker');

const names = () => downloads.filter((d) => d.anchor).map((d) => d.anchor);
const before = names().length;
click('btn-dl-tg');
await sleep(800);
check('download (worker): exactly one file named tcb-telegram-worker.zip', JSON.stringify(names().slice(before)) === JSON.stringify(['tcb-telegram-worker.zip']), JSON.stringify(names().slice(before)));

click('tab-pages');
const beforePages = names().length;
click('btn-dl-tg');
await sleep(1500);
check('download (pages): pages-worker.zip then telegram-worker.zip', JSON.stringify(names().slice(beforePages)) === JSON.stringify(['tcb-pages-worker.zip', 'tcb-telegram-worker.zip']), JSON.stringify(names().slice(beforePages)));
click('tab-worker');

const io = execFileSync(esbuildBin, ['--bundle', '--format=iife', '--global-name=IO', '--log-level=error'], { input: `export * from '${path.join(root, 'js/settings-io.js')}';`, encoding: 'utf8' });
w.eval(io);
setCk('tgEnable', true);
setCk('tgPadding', true);
const baseBefore = $('tgSecret').dataset.base;
const exportedText = w.IO.exportSettingsToString('worker');
const payload = JSON.parse(exportedText);
check('settings: schema version is 7 and telegram block is present', payload.schemaVersion === 7 && payload.data.telegramWebProxy.enabled === true && payload.data.telegramWebProxy.secretBase === baseBefore && payload.data.telegramWebProxy.randomPadding === true);
check('settings: v7 payload passes compatibility check', w.IO.isCompatibleExport(payload));
setCk('tgEnable', false); setCk('tgPadding', false); $('tgSecret').dataset.base = '';
w.IO.applyImportedSettings(payload);
check('settings: import restores enabled, padding and secret base', $('tgEnable').checked && $('tgPadding').checked && $('tgSecret').dataset.base === baseBefore);
const legacy = JSON.parse(exportedText);
legacy.schemaVersion = 5; delete legacy.data.telegramWebProxy;
check('settings: legacy v5 payload is still accepted', w.IO.isCompatibleExport(legacy));
w.IO.applyImportedSettings(legacy);
check('settings: importing v5 turns telegram off', !$('tgEnable').checked);
const broken = JSON.parse(exportedText); broken.data.telegramWebProxy.secretBase = 'zz';
check('settings: v7 payload with invalid secret base is rejected', !w.IO.isCompatibleExport(broken));
const missing = JSON.parse(exportedText); delete missing.data.telegramWebProxy;
check('settings: v7 payload without telegram block is rejected', !w.IO.isCompatibleExport(missing));
const v6 = JSON.parse(exportedText);
v6.schemaVersion = 6; delete v6.data.advancedJson.lanUsername; delete v6.data.advancedJson.lanPassword;
check('settings: legacy v6 payload is still accepted', w.IO.isCompatibleExport(v6));
$('lanUsername').value = 'x'; $('lanPassword').value = 'y';
w.IO.applyImportedSettings(v6);
check('settings: importing v6 leaves LAN credentials empty', $('lanUsername').value === '' && $('lanPassword').value === '');
const v7NoLan = JSON.parse(exportedText); delete v7NoLan.data.advancedJson.lanPassword;
check('settings: v7 payload without LAN password is rejected', !w.IO.isCompatibleExport(v7NoLan));

const grab = async (id) => { click(id); await sleep(30); return clip; };
const resultsOf = async () => { click('gb'); await sleep(700); return { xray: await grab('btn-cp-json'), sing: await grab('btn-cp-singbox'), clash: await grab('btn-cp-clash') }; };
const inboundOf = (o) => ({ x: JSON.parse(o.xray).inbounds[0].settings, s: JSON.parse(o.sing).inbounds.find((i) => i.tag === 'mixed-in'), c: JSON.parse(o.clash) });
setVal('wdom', 'myworker.someone.workers.dev');
setVal('ips', '104.16.0.1');
check('lan auth: boxes hidden by default', $('lanAuthWrap').style.display === 'none' && $('lanUsername').value === '' && $('lanPassword').value === '' && $('lanPassword').type === 'password');
$('lanAccess').value = '1'; $('lanAccess').dispatchEvent(new w.Event('change', { bubbles: true }));
check('lan auth: boxes shown when Allow LAN is enabled', $('lanAuthWrap').style.display === '');
let r = await resultsOf(); let ib = inboundOf(r);
check('lan auth: both empty keeps noauth in all cores', ib.x.auth === 'noauth' && !ib.x.accounts && ib.s.users === undefined && ib.c.authentication === undefined && ib.c['allow-lan'] === true);
setVal('lanUsername', 'alice');
$('jsonDisplay').innerHTML = ''; $('singboxDisplay').innerHTML = ''; $('clashDisplay').innerHTML = ''; $('lAll').innerHTML = '';
click('gb'); await sleep(700);
check('lan auth: only one box filled produces no config at all', $('jsonDisplay').textContent === '' && $('singboxDisplay').textContent === '' && $('clashDisplay').textContent === '' && $('lAll').innerHTML === '');
setVal('lanPassword', 'p@ss:w"o\\rd');
r = await resultsOf(); ib = inboundOf(r);
check('lan auth: xray mixed uses password auth with accounts', ib.x.auth === 'password' && ib.x.accounts.length === 1 && ib.x.accounts[0].user === 'alice' && ib.x.accounts[0].pass === 'p@ss:w"o\\rd' && ib.x.udp === true && ib.x.userLevel === 8);
check('lan auth: sing-box mixed has users', JSON.stringify(ib.s.users) === JSON.stringify([{ username: 'alice', password: 'p@ss:w"o\\rd' }]) && ib.s.listen === '0.0.0.0' && ib.s.listen_port === 2080);
check('lan auth: clash has authentication user:pass', JSON.stringify(ib.c.authentication) === JSON.stringify(['alice:p@ss:w"o\\rd']) && ib.c['mixed-port'] === 7890);
setVal('lanUsername', 'a:b');
$('jsonDisplay').innerHTML = '';
click('gb'); await sleep(700);
check('lan auth: colon in username blocks generation', $('jsonDisplay').textContent === '');
setVal('lanUsername', 'alice');
const exp7 = JSON.parse(w.IO.exportSettingsToString());
check('lan auth: export carries credentials after tcpFastOpen', exp7.data.advancedJson.lanUsername === 'alice' && exp7.data.advancedJson.lanPassword === 'p@ss:w"o\\rd' && Object.keys(exp7.data.advancedJson).join() === 'fakeDns,ipv6,lanAccess,tcpFastOpen,lanUsername,lanPassword');
setVal('lanUsername', ''); setVal('lanPassword', '');
$('lanAccess').value = '0'; $('lanAccess').dispatchEvent(new w.Event('change', { bubbles: true }));
w.IO.applyImportedSettings(exp7);
check('lan auth: import restores credentials', $('lanUsername').value === 'alice' && $('lanPassword').value === 'p@ss:w"o\\rd');
$('lanAccess').value = '0'; $('lanAccess').dispatchEvent(new w.Event('change', { bubbles: true }));
check('lan auth: boxes hide again when Allow LAN is disabled', $('lanAuthWrap').style.display === 'none');
r = await resultsOf(); ib = inboundOf(r);
check('lan auth: LAN disabled ignores credentials in all cores', ib.x.auth === 'noauth' && ib.s.users === undefined && ib.s.listen === '127.0.0.1' && ib.c.authentication === undefined && ib.c['allow-lan'] === false && JSON.parse(r.xray).inbounds[0].listen === '127.0.0.1');
w.dispatchEvent(new w.Event('pagehide'));
check('lan auth: pagehide wipes credentials', $('lanUsername').value === '' && $('lanPassword').value === '');
setCk('tgEnable', true); setCk('tgEnable', false);
check('disable: classic buttons return and body hides', $('btn-cp-worker').style.display === '' && $('tgBody').style.display === 'none');

console.log(`\n${pass}/${pass + fail} ui checks passed.`);
process.exit(fail ? 1 : 0);