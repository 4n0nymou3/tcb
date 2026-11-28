import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const coresDir = process.env.CORES_DIR || '';
const esbuildBin = createRequire(import.meta.url).resolve('esbuild/bin/esbuild');
const bundle = execFileSync(esbuildBin, [path.join(root, 'js/app.js'), '--bundle', '--format=iife', '--log-level=error'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log('[PASS] ' + name); } else { fail++; console.log('[FAIL] ' + name + (detail ? ' :: ' + detail : '')); } };

async function boot() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://tcb.example/' });
  const w = dom.window;
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.confirm = () => true;
  w.fetch = async (url) => { const f = path.join(root, String(url)); if (!fs.existsSync(f)) return { ok: false, status: 404, text: async () => '' }; return { ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8') }; };
  let clip = '';
  w.Element.prototype.scrollIntoView = function () {};
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (v) => { clip = v; } }, configurable: true });
  w.eval(bundle);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(200);
  const $ = (id) => w.document.getElementById(id);
  const click = (id) => $(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const setVal = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); $(id).dispatchEvent(new w.Event('change', { bubbles: true })); };
  const setCk = (id, v) => { $(id).checked = v; $(id).dispatchEvent(new w.Event('change', { bubbles: true })); };
  const setCls = (sel, v) => { const el = w.document.querySelector(sel); el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const grab = async (id) => { clip = ''; click(id); await sleep(30); return clip; };
  return { w, $, click, setVal, setCk, setCls, grab };
}

const common = (h) => { h.setVal('wdom', 'myworker.someone.workers.dev'); h.setVal('ips', '104.16.0.1\n104.17.0.1'); };
const chainLink = 'vless://11111111-2222-4333-8444-555555555555@chain.example.com:443?encryption=none&security=tls&sni=chain.example.com&fp=chrome&type=ws&host=chain.example.com&path=%2Fws#c';
const scenarios = {
  default: () => {},
  fragment: (h) => h.setCk('fragEnable', true),
  fragment2: (h) => { h.setCk('fragEnable', true); h.setCk('frag2Enable', true); },
  ech: (h) => h.setCk('echEnable', true),
  chain: (h) => h.setVal('chainConfig', chainLink),
  custom_domain: (h) => { h.setCk('customDomainUsed', true); h.setVal('customDomainInput', 'my.example.com'); },
  multi_port: (h) => { h.setCls('.ptls[value="8443"]', true); h.setCls('.ptls[value="2053"]', true); },
  block_all: (h) => { for (const id of ['blockPromo', 'blockPorn', 'blockQuic', 'blockMalware', 'blockPhishing', 'blockCryptominers']) h.setCk(id, true); },
  sanction_all: (h) => { for (const id of ['sanctionOpenai', 'sanctionGoogleai', 'sanctionAnthropic', 'sanctionXai', 'sanctionMicrosoft', 'sanctionOracle', 'sanctionDocker', 'sanctionAdobe', 'sanctionEpicgames', 'sanctionIntel', 'sanctionAmd', 'sanctionNvidia', 'sanctionAsus', 'sanctionHp', 'sanctionLenovo']) h.setCk(id, true); },
  lan_auth: (h) => { h.setVal('lanAccess', '1'); h.setVal('lanUsername', 'alice'); h.setVal('lanPassword', 'secret'); },
  ipv6_fakedns: (h) => { h.setVal('ipv6', '1'); h.setVal('fakeDns', '1'); h.setVal('ips', '104.16.0.1\n2606:4700::1'); },
  countries: (h) => { h.setCk('routeCn', true); h.setCk('routeRu', true); },
  both_protocols: (h) => h.setCk('protoTrojan', true),
  pages_target: (h) => h.click('tab-pages'),
  path_and_fingerprint: (h) => { const ps = h.$('pathSelect'); const fs = h.$('fpSelect'); h.setVal('pathSelect', ps.options[Math.min(2, ps.options.length - 1)].value); h.setVal('fpSelect', fs.options[Math.min(2, fs.options.length - 1)].value); },
  custom_rules: (h) => { h.setVal('customBypassRules', 'domain:bypass.example'); h.setVal('customBlockRules', 'domain:block.example'); h.setVal('customSanctionRules', 'domain:sanction.example'); },
  ech_and_chain: (h) => { h.setCk('echEnable', true); h.setVal('chainConfig', chainLink); },
  fragment_custom_domain: (h) => { h.setCk('fragEnable', true); h.setCk('frag2Enable', true); h.setCk('customDomainUsed', true); h.setVal('customDomainInput', 'my.example.com'); },
  kitchen_sink: (h) => { h.setCk('protoTrojan', true); h.setCk('echEnable', true); h.setCk('fragEnable', true); h.setCk('frag2Enable', true); h.setVal('chainConfig', chainLink); h.setCk('customDomainUsed', true); h.setVal('customDomainInput', 'my.example.com'); h.setCls('.ptls[value="8443"]', true); h.setCls('.ptls[value="2053"]', true); for (const id of ['blockPromo', 'blockPorn', 'blockQuic', 'blockMalware', 'blockPhishing', 'blockCryptominers', 'sanctionOpenai', 'sanctionGoogleai', 'sanctionAnthropic', 'routeCn', 'routeRu']) h.setCk(id, true); h.setVal('lanAccess', '1'); h.setVal('lanUsername', 'alice'); h.setVal('lanPassword', 'secret'); h.setVal('ipv6', '1'); h.setVal('fakeDns', '1'); h.setVal('ips', '104.16.0.1\n2606:4700::1'); },
  kitchen_sink_pages: (h) => { h.click('tab-pages'); h.setCk('echEnable', true); h.setCk('fragEnable', true); h.setVal('chainConfig', chainLink); for (const id of ['blockPromo', 'blockMalware', 'sanctionOpenai', 'routeCn']) h.setCk(id, true); h.setVal('ipv6', '1'); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcb-core-'));
const outputs = [];
for (const transport of ['ws', 'xhttp']) {
  for (const [name, fn] of Object.entries(scenarios)) {
    const h = await boot();
    common(h);
    h.setVal('transport', transport);
    await fn(h);
    h.click('gb'); await sleep(800);
    const xray = await h.grab('btn-cp-json');
    const sing = await h.grab('btn-cp-singbox');
    const clash = await h.grab('btn-cp-clash');
    const links = await h.grab('btn-cp-all');
    const singShown = h.$('singboxDisplay').textContent;
    outputs.push({ label: `${transport}/${name}`, transport, name, xray, sing, clash, links, singShown });
    h.w.close();
  }
}

for (const o of outputs) {
  const x = JSON.parse(o.xray);
  const proxyOuts = x.outbounds.filter((b) => b.protocol === 'vless' || b.protocol === 'trojan').filter((b) => !b.tag.startsWith('chain-'));
  const c = JSON.parse(o.clash);
  const clashProxies = c.proxies.filter((p) => !p.name.startsWith('chain-'));
  const freedom = x.outbounds.find((b) => b.protocol === 'freedom');
  check(`${o.label}: xray freedom uses sockopt.domainStrategy, not the deprecated field`, freedom.streamSettings && freedom.streamSettings.sockopt.domainStrategy === 'UseIP' && !(freedom.settings && 'domainStrategy' in freedom.settings));
  if (o.transport === 'ws') {
    check(`${o.label}: xray ws uses the independent host field`, proxyOuts.every((b) => b.streamSettings.network === 'ws' && b.streamSettings.wsSettings.host && !b.streamSettings.wsSettings.headers));
    check(`${o.label}: sing-box output is present`, o.sing.length > 0 && !!JSON.parse(o.sing).outbounds);
  } else {
    check(`${o.label}: xray outbounds are VLESS over xhttp stream-one with h2`, proxyOuts.length > 0 && proxyOuts.every((b) => b.protocol === 'vless' && b.streamSettings.network === 'xhttp' && b.streamSettings.xhttpSettings.mode === 'stream-one' && b.streamSettings.xhttpSettings.host && b.streamSettings.tlsSettings.alpn.length === 1 && b.streamSettings.tlsSettings.alpn[0] === 'h2' && !b.streamSettings.wsSettings && !b.streamSettings.xhttpSettings.path.includes('?ed=')));
    check(`${o.label}: clash proxies are VLESS xhttp with h2 and no ws options`, clashProxies.length > 0 && clashProxies.every((p) => p.type === 'vless' && p.network === 'xhttp' && p['xhttp-opts'].mode === 'stream-one' && p['xhttp-opts'].host && !p['ws-opts'] && p.alpn.length === 1 && p.alpn[0] === 'h2' && p.tls === true));
    check(`${o.label}: sing-box output is withheld and a notice is shown`, o.sing === '' && o.singShown.length > 20 && !o.singShown.includes('"outbounds"'));
    const linkLines = o.links.split('\n').filter(Boolean);
    check(`${o.label}: share links are vless xhttp stream-one TLS links`, linkLines.length > 0 && linkLines.every((l) => l.startsWith('vless://') && /type=xhttp/.test(l) && /mode=stream-one/.test(l) && /alpn=h2/.test(l) && /security=tls/.test(l) && !/ed=2560/.test(l)));
  }
}

const bin = (name, rel) => (coresDir ? path.join(coresDir, rel) : '');
const have = (p) => p && fs.existsSync(p);
const xrayBin = bin('xray', 'xray/xray');
const sbBin = bin('sing-box', 'sing-box');
const mhBin = bin('mihomo', 'mihomo');
let mhBytes = null;

if (!coresDir) {
  console.log('[SKIP] real-core validation: set CORES_DIR to a folder holding xray/xray, sing-box and mihomo');
} else {
  for (const o of outputs) {
    if (have(xrayBin)) {
      const f = path.join(tmp, o.label.replace('/', '_') + '.xray.json');
      fs.writeFileSync(f, o.xray);
      const r = spawnSync(xrayBin, ['run', '-test', '-c', f], { encoding: 'utf8', env: { ...process.env, XRAY_LOCATION_ASSET: coresDir } });
      const text = (r.stdout || '') + (r.stderr || '');
      const usesTrojan = o.transport === 'ws' && /protocols|kitchen/.test(o.name);
      const dep = text.split('\n').filter((l) => /deprecat/i.test(l) && !/WebSocket transport/i.test(l) && !(usesTrojan && /Trojan \(with no Flow/i.test(l)));
      check(`xray core: ${o.label} passes -test with no deprecation notice other than the known WebSocket and Trojan ones`, r.status === 0 && /Configuration OK/.test(text) && dep.length === 0, dep.join(' | ') || text.slice(-300));
    }
    if (have(sbBin) && o.sing) {
      const f = path.join(tmp, o.label.replace('/', '_') + '.singbox.json');
      fs.writeFileSync(f, o.sing);
      const r = spawnSync(sbBin, ['check', '-c', f], { encoding: 'utf8' });
      const text = (r.stdout || '') + (r.stderr || '');
      check(`sing-box core: ${o.label} passes check with no warnings`, r.status === 0 && !/warn|deprecat/i.test(text), text.slice(-300));
    }
    if (have(mhBin)) {
      mhBytes = mhBytes || fs.readFileSync(mhBin);
      const c = JSON.parse(o.clash);
      const keys = new Set(Object.keys(c));
      for (const k of ['dns', 'tun', 'sniffer', 'profile']) if (c[k] && typeof c[k] === 'object') Object.keys(c[k]).forEach((x) => keys.add(x));
      for (const px of c.proxies || []) { Object.keys(px).forEach((x) => keys.add(x)); for (const k of ['ws-opts', 'xhttp-opts', 'ech-opts', 'grpc-opts', 'reality-opts']) if (px[k]) Object.keys(px[k]).forEach((x) => keys.add(x)); }
      for (const g of c['proxy-groups'] || []) Object.keys(g).forEach((x) => keys.add(x));
      for (const rp of Object.values(c['rule-providers'] || {})) Object.keys(rp).forEach((x) => keys.add(x));
      const missing = [...keys].filter((k) => !mhBytes.includes(Buffer.from(k)));
      check(`mihomo core: ${o.label} every structural key exists in the mihomo binary`, missing.length === 0, missing.join(','));
      const d = path.join(tmp, 'mh_' + o.label.replace('/', '_'));
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'config.yaml'), o.clash);
      const r = spawnSync(mhBin, ['-t', '-d', d, '-f', path.join(d, 'config.yaml')], { encoding: 'utf8' });
      const text = (r.stdout || '') + (r.stderr || '');
      check(`mihomo core: ${o.label} passes -t`, r.status === 0 && /test is successful/.test(text), text.slice(-300));
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} core-validate checks passed.`);
process.exit(fail ? 1 : 0);
