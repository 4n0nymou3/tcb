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
const broken = JSON.parse(exportedText); broken.data.telegramWebProxy.secretBase = 'zz';
check('settings: v7 payload with invalid secret base is rejected', !w.IO.isCompatibleExport(broken));
const missing = JSON.parse(exportedText); delete missing.data.telegramWebProxy;
check('settings: v7 payload without telegram block is rejected', !w.IO.isCompatibleExport(missing));
const v7NoLan = JSON.parse(exportedText); delete v7NoLan.data.advancedJson.lanPassword;
check('settings: v7 payload without LAN password is rejected', !w.IO.isCompatibleExport(v7NoLan));
const badSelect = JSON.parse(exportedText); badSelect.data.fingerprint = 'nonexistent';
check('settings: v7 payload with an unknown select value is rejected', !w.IO.isCompatibleExport(badSelect));
const asVersion = (v) => { const c = JSON.parse(exportedText); if (v === undefined) delete c.schemaVersion; else c.schemaVersion = v; return c; };
check('settings: v6 file with current fields present is rejected', !w.IO.isCompatibleExport(asVersion(6)));
const v6Plain = asVersion(6); delete v6Plain.data.advancedJson.lanUsername; delete v6Plain.data.advancedJson.lanPassword;
check('settings: genuine v6 file is rejected', !w.IO.isCompatibleExport(v6Plain));
const v5Plain = asVersion(5); delete v5Plain.data.advancedJson.lanUsername; delete v5Plain.data.advancedJson.lanPassword; delete v5Plain.data.telegramWebProxy;
check('settings: genuine v5 file is rejected', !w.IO.isCompatibleExport(v5Plain));
check('settings: v5 file with current fields present is rejected', !w.IO.isCompatibleExport(asVersion(5)));
check('settings: missing, string and future schema versions are rejected', !w.IO.isCompatibleExport(asVersion(undefined)) && !w.IO.isCompatibleExport(asVersion('7')) && !w.IO.isCompatibleExport(asVersion(8)) && !w.IO.isCompatibleExport(asVersion(null)));
const wrongApp = JSON.parse(exportedText); wrongApp.appId = 'other';
check('settings: wrong appId is not a valid import payload', !w.IO.isValidImportPayload(wrongApp));

const translations = (() => { const src = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8').replace(/export /g, ''); return new Function(`${src}; return translations;`)(); })();
const comparable = () => { const c = JSON.parse(w.IO.exportSettingsToString()); delete c.exportedAt; return JSON.stringify(c); };
const importFile = async (text) => {
  const input = $('importFileInput');
  Object.defineProperty(input, 'files', { value: [new w.File([text], 'TCB_Settings.json')], configurable: true });
  input.dispatchEvent(new w.Event('change'));
  await sleep(150);
};
setVal('fragPackets', 'sentinel-before');
const stateBefore = comparable();
const rejectedInputs = {
  'v6 file': JSON.stringify(v6Plain),
  'v5 file': JSON.stringify(v5Plain),
  'v6 with current fields': JSON.stringify(asVersion(6)),
  'broken structure': JSON.stringify(broken),
  'not json': '{oops',
  'foreign app': JSON.stringify(wrongApp)
};
for (const [label, text] of Object.entries(rejectedInputs)) {
  await importFile(text);
  check(`settings: rejected import (${label}) leaves every setting untouched`, comparable() === stateBefore);
}
await importFile(JSON.stringify(v6Plain));
check('settings: rejected old file shows the translated error toast', $('toast').textContent === translations.fa['toast.oldSettingsFile']);
const goodFile = JSON.parse(exportedText); goodFile.data.fragment.packets = 'sentinel-after';
await importFile(JSON.stringify(goodFile));
check('settings: valid v7 file imports through the real file input', $('fragPackets').value === 'sentinel-after');

const topKeys = Object.keys(JSON.parse(exportedText));
check('export: metadata keys come first in a fixed order', JSON.stringify(topKeys) === JSON.stringify(['appId', 'schemaVersion', 'exportedAt', 'data']));
const expectedDataKeys = ['deployTarget', 'telegramWebProxy', 'token', 'trojanPassword', 'workerDomain', 'customDomainUsed', 'customDomain', 'fallbackDomain', 'ips', 'protocols', 'tlsPorts', 'wsPorts', 'fingerprint', 'wsPath', 'fragment', 'advancedJson', 'ech', 'dns', 'routingCountries', 'blockRules', 'sanctionDns', 'sanctionBypass', 'customSanctionRules', 'customBypassRules', 'customBlockRules', 'observatory', 'chainConfig', 'jsonName'];
check('export: data keys follow the exact panel order', JSON.stringify(Object.keys(JSON.parse(exportedText).data)) === JSON.stringify(expectedDataKeys), Object.keys(JSON.parse(exportedText).data).join());
const controlFor = {
  deployTarget: 'tab-worker', 'telegramWebProxy.enabled': 'tgEnable', 'telegramWebProxy.secretBase': 'tgSecret', 'telegramWebProxy.randomPadding': 'tgPadding',
  token: 'uid', trojanPassword: 'tpw', workerDomain: 'wdom', customDomainUsed: 'customDomainUsed', customDomain: 'customDomainInput', fallbackDomain: 'fallbackDomain', ips: 'ips',
  'protocols.vless': 'protoVless', 'protocols.trojan': 'protoTrojan', tlsPorts: '.ptls', wsPorts: '.pws', fingerprint: 'fpSelect', wsPath: 'pathSelect',
  'fragment.enabled': 'fragEnable', 'fragment.packets': 'fragPackets', 'fragment.interval': 'fragInterval', 'fragment.length': 'fragLength', 'fragment.maxSplit': 'fragMaxSplit',
  'fragment.stage2.enabled': 'frag2Enable', 'fragment.stage2.packets': 'frag2Packets', 'fragment.stage2.interval': 'frag2Interval', 'fragment.stage2.length': 'frag2Length', 'fragment.stage2.maxSplit': 'frag2MaxSplit',
  'fragment.xrayTls.unsafeFingerprint': 'fpUnsafeXray', 'fragment.xrayTls.cipherSuites': 'cipherSuitesXray',
  'advancedJson.fakeDns': 'fakeDns', 'advancedJson.ipv6': 'ipv6', 'advancedJson.lanAccess': 'lanAccess', 'advancedJson.tcpFastOpen': 'tcpFastOpen', 'advancedJson.lanUsername': 'lanUsername', 'advancedJson.lanPassword': 'lanPassword',
  'ech.enabled': 'echEnable', 'ech.dns': 'echDns', 'dns.local': 'localDns', 'dns.remote': 'remoteDns',
  'routingCountries.ir': 'routeIr', 'routingCountries.cn': 'routeCn', 'routingCountries.ru': 'routeRu',
  'blockRules.ads': 'blockPromo', 'blockRules.porn': 'blockPorn', 'blockRules.quic': 'blockQuic', 'blockRules.malware': 'blockMalware', 'blockRules.phishing': 'blockPhishing', 'blockRules.cryptominers': 'blockCryptominers',
  sanctionDns: 'sanctionDns',
  'sanctionBypass.openai': 'sanctionOpenai', 'sanctionBypass.googleai': 'sanctionGoogleai', 'sanctionBypass.anthropic': 'sanctionAnthropic', 'sanctionBypass.xai': 'sanctionXai', 'sanctionBypass.microsoft': 'sanctionMicrosoft', 'sanctionBypass.oracle': 'sanctionOracle', 'sanctionBypass.docker': 'sanctionDocker', 'sanctionBypass.adobe': 'sanctionAdobe', 'sanctionBypass.epicgames': 'sanctionEpicgames', 'sanctionBypass.intel': 'sanctionIntel', 'sanctionBypass.amd': 'sanctionAmd', 'sanctionBypass.nvidia': 'sanctionNvidia', 'sanctionBypass.asus': 'sanctionAsus', 'sanctionBypass.hp': 'sanctionHp', 'sanctionBypass.lenovo': 'sanctionLenovo',
  customSanctionRules: 'customSanctionRules', customBypassRules: 'customBypassRules', customBlockRules: 'customBlockRules',
  'observatory.leastPingInterval': 'leastPingInterval', 'observatory.leastLoadInterval': 'leastLoadInterval', 'observatory.leastLoadMode': 'leastLoadMode', 'observatory.leastLoadSampling': 'leastLoadSampling', 'observatory.leastLoadTimeout': 'leastLoadTimeout',
  chainConfig: 'chainConfig', jsonName: 'jsonName'
};
const leafPaths = [];
const walk = (obj, prefix) => { for (const [k, v] of Object.entries(obj)) { const pth = prefix ? `${prefix}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, pth); else leafPaths.push(pth); } };
walk(JSON.parse(exportedText).data, '');
check('export: every exported leaf is mapped to a panel control', leafPaths.every((lp) => lp in controlFor), leafPaths.filter((lp) => !(lp in controlFor)).join());
const domOrder = (sel) => { const el = sel.startsWith('.') ? w.document.querySelector(sel) : $(sel); return el; };
let orderOk = true; let orderMsg = '';
for (let i = 1; i < leafPaths.length; i++) {
  const prev = domOrder(controlFor[leafPaths[i - 1]]); const cur = domOrder(controlFor[leafPaths[i]]);
  if (!(prev.compareDocumentPosition(cur) & w.Node.DOCUMENT_POSITION_FOLLOWING)) { orderOk = false; orderMsg = `${leafPaths[i - 1]} -> ${leafPaths[i]}`; break; }
}
check('export: leaf order matches the on-screen order of the controls', orderOk, orderMsg);

const faKeys = Object.keys(translations.fa); const enKeys = Object.keys(translations.en);
check('i18n: fa and en define exactly the same keys', faKeys.length === enKeys.length && faKeys.every((k) => k in translations.en));
const firstLetter = (str) => { const plain = str.replace(/<[^>]*>/g, ''); for (const ch of plain) if (/\p{L}/u.test(ch)) return ch; return ''; };
const identifierOnly = new Set(['lbl.leastPingInterval', 'lbl.leastLoadInterval', 'lbl.leastLoadMode', 'lbl.leastLoadSampling', 'lbl.leastLoadTimeout', 'tab.worker', 'tab.pages']);
const latinStart = faKeys.filter((k) => !identifierOnly.has(k) && /[A-Za-z]/.test(firstLetter(translations.fa[k])));
check('i18n: every Persian text starts with a Persian word', latinStart.length === 0, latinStart.join());
const digitStart = faKeys.filter((k) => /^\s*(\{[a-z]+\}|[0-9])/.test(translations.fa[k].replace(/<[^>]*>/g, '')));
check('i18n: no Persian text starts with a number or placeholder', digitStart.length === 0, digitStart.join());
check('i18n: header description mentions Telegram Web Proxy in both languages', translations.fa['hdr.sub'].includes('Telegram Web Proxy') && translations.en['hdr.sub'].includes('Telegram Web Proxy') && translations.fa['hdr.sub'].includes('VLESS') && translations.fa['hdr.sub'].includes('Trojan') && translations.en['hdr.sub'].includes('Trojan'));
check('i18n: rendered header description follows the selected language', (() => { $('btn-lang-en').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); const en = w.document.querySelector('.hdr-sub').textContent; $('btn-lang-fa').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); const fa = w.document.querySelector('.hdr-sub').textContent; return en === translations.en['hdr.sub'] && fa === translations.fa['hdr.sub']; })());
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const txtDirLabels = [...indexSource.matchAll(/<label class="adv-lbl[^"]*txt-dir[^"]*"[^>]*data-i18n="([^"]+)"/g)].map((m) => m[1]);
check('rtl: descriptive labels that contain Persian follow the page direction', txtDirLabels.length >= 11 && txtDirLabels.every((k) => /[\u0600-\u06FF]/.test(translations.fa[k])), txtDirLabels.join());
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
check('rtl: technical inputs, code boxes and inline code stay LTR in the stylesheet', /input,textarea,select\{[^}]*direction:ltr/.test(css) && /\.code-viewer-body\{[^}]*direction:ltr/.test(css) && /\ncode\{[^}]*direction:ltr;unicode-bidi:isolate/.test(css));

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

click('btn-mk-token'); click('btn-mk-pw');
await sleep(100);
click('btn-cp-worker');
await sleep(50);
const rawWorker = clip;
const shownLines = [...$('workerDisplay').querySelectorAll('.code-content')].map((el) => el.textContent);
check('code view: worker code is rendered and the copy button yields it', rawWorker.length > 1000 && shownLines.length > 20, `${rawWorker.length} ${shownLines.length}`);
check('code view: visible text equals the copied code exactly (no entities)', shownLines.join('\n') === rawWorker.replace(/\n$/, '').split('\n').map((l) => l || ' ').join('\n'));
check('code view: no HTML entity text leaks into the visible worker code', !/&#39;|&quot;|&amp;|&lt;|&gt;/.test(shownLines.join('\n')));
check('code view: single-quoted strings are highlighted as whole strings', [...$('workerDisplay').querySelectorAll('span.s')].some((el) => el.textContent === "'cloudflare:sockets'"));
check('code view: numbers inside entities no longer get highlighted', [...$('workerDisplay').querySelectorAll('span.n')].every((el) => /^\d+$/.test(el.textContent)));
const uiMod = w.eval(execFileSync(esbuildBin, ['--bundle', '--format=iife', '--global-name=UIM', '--log-level=error'], { input: `export * from '${path.join(root, 'js/ui.js')}';`, encoding: 'utf8' }) + ';UIM');
const strip = (h) => { const d = w.document.createElement('div'); d.innerHTML = h; return d.textContent; };
const samples = ["import{a as b}from'x\\'y';", 'const s="a&b<c>"; // 5', '"key": "v<1>&\'q\'", 7,'];
check('code view: every highlighter preserves its input text exactly', samples.every((sm) => strip(uiMod.highlightJsLine(sm)) === sm && strip(uiMod.highlightJsonLine(sm)) === sm && strip(uiMod.highlightYamlLine(sm)) === sm));
check('code view: JSON keys and strings are highlighted', uiMod.highlightJsonLine('  "a": "b",').includes('<span class="jk">&quot;a&quot;:</span>') && uiMod.highlightJsonLine('  "a": "b",').includes('<span class="js">&quot;b&quot;</span>'));
check('code view: special characters stay escaped in generated markup', uiMod.highlightJsLine("x = '<b>';").includes('&lt;b&gt;') && !uiMod.highlightJsLine("x = '<b>';").includes('<b>'));
const cssNow = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
check('rtl: inline code wraps only when a string cannot fit, not mid-word', /\ncode\{[^}]*overflow-wrap:anywhere/.test(cssNow) && !/\ncode\{[^}]*word-break:break-all/.test(cssNow));

setVal('wdom', 'myworker.someone.workers.dev');
setVal('ips', '104.16.0.1');
click('gb');
await sleep(800);
click('btn-cp-clash');
await sleep(50);
const rawClash = clip;
const clashLines = [...$('clashDisplay').querySelectorAll('.code-content')].map((el) => el.textContent);
const clashKeys = [...$('clashDisplay').querySelectorAll('span.jk')].map((el) => el.textContent);
check('clash view: visible text equals the copied Clash config exactly', clashLines.join('\n') === rawClash.replace(/\n$/, '').split('\n').map((l) => l || ' ').join('\n'));
check('clash view: top-level keys use the JSON key class', clashKeys.includes('"mixed-port":') && clashKeys.includes('"allow-lan":') && clashKeys.includes('"proxies":'), clashKeys.slice(0, 5).join());
check('clash view: every quoted key is highlighted as a key', clashLines.filter((l) => /^\s*"[^"]*"\s*:/.test(l)).length === clashKeys.length);
check('clash view: strings, numbers and booleans are highlighted', $('clashDisplay').querySelectorAll('span.js').length > 0 && $('clashDisplay').querySelectorAll('span.jn').length > 0 && $('clashDisplay').querySelectorAll('span.jb').length > 0);
check('clash view: copied config is still valid JSON text with the same mixed-port', JSON.parse(rawClash)['mixed-port'] === 7890);
click('btn-dl-clash');
check('clash view: download keeps the .yaml name', downloads.some((d) => d.anchor === 'TCB.yaml' || (d.anchor && d.anchor.endsWith('.yaml'))), JSON.stringify(downloads.filter((d) => d.anchor).map((d) => d.anchor)));

console.log(`\n${pass}/${pass + fail} ui checks passed.`);
process.exit(fail ? 1 : 0);