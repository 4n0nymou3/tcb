import { buildWorker } from './worker-builder.js';
import { buildConfig, buildTrojanConfig, buildJsonConfig } from './config-builder.js';
import { buildSingboxConfig } from './singbox-builder.js';
import { buildClashConfig } from './clash-builder.js';
import { parseChainConfig } from './chain-parser.js';
import { toast, getChecked, row, downloadFile, renderCodeBlock, highlightJsonLine, highlightYamlLine, highlightJsLine } from './ui.js';
import { exportSettingsToString, isValidImportPayload, applyImportedSettings } from './settings-io.js';
import { generateQRMatrix, qrMatrixToSvg } from './qrcode.js';

let allC = [];
let lastJsonStr = '';
let lastSingboxStr = '';
let lastClashStr = '';

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function genPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 24; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function renderWorker(token, password) {
  if (!token || !password) return;
  const code = await buildWorker(token, password);
  renderCodeBlock('workerDisplay', code, highlightJsLine);
}

function currentPassword() {
  return document.getElementById('tpw').value.trim();
}

function mkToken() {
  const t = uuid4();
  document.getElementById('uid').value = t;
  renderWorker(t, currentPassword());
  toast('Token جدید — کد Worker آپدیت شد');
}

function cpToken() {
  const v = document.getElementById('uid').value.trim();
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => toast('Token کپی شد'));
}

function mkPassword() {
  const p = genPassword();
  document.getElementById('tpw').value = p;
  renderWorker(document.getElementById('uid').value.trim(), p);
  toast('Password جدید — کد Worker آپدیت شد');
}

function cpPassword() {
  const v = document.getElementById('tpw').value.trim();
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => toast('Password کپی شد'));
}

async function cpWorker() {
  const token = document.getElementById('uid').value.trim();
  const password = currentPassword();
  if (!token || !password) { toast('ابتدا Token و Password بساز'); return; }
  const code = await buildWorker(token, password);
  navigator.clipboard.writeText(code).then(() => toast('کد Worker کپی شد'));
}

async function dlWorker() {
  const token = document.getElementById('uid').value.trim();
  const password = currentPassword();
  if (!token || !password) { toast('ابتدا Token و Password وارد کن'); return; }
  const code = await buildWorker(token, password);
  downloadFile(code, 'worker.js', 'text/javascript');
  toast('فایل worker.js دانلود شد');
}

function toggleFrag() {
  const en = document.getElementById('fragEnable').checked;
  const ff = document.getElementById('fragFields');
  const echWrap = document.getElementById('echWrap');
  const echEnable = document.getElementById('echEnable');
  if (en) {
    ff.classList.remove('disabled');
    echEnable.checked = false;
    echWrap.classList.add('ech-blocked');
    document.getElementById('echFields').classList.add('disabled');
  } else {
    ff.classList.add('disabled');
    echWrap.classList.remove('ech-blocked');
  }
}

function toggleEch() {
  const en = document.getElementById('echEnable').checked;
  const ef = document.getElementById('echFields');
  if (en) { ef.classList.remove('disabled'); } else { ef.classList.add('disabled'); }
}

function collectSettings() {
  const fragEnable = document.getElementById('fragEnable').checked;
  const echEnable  = document.getElementById('echEnable').checked;
  return {
    basePath:     document.getElementById('pathSelect').value,
    fragEnable:   fragEnable,
    fragPackets:  document.getElementById('fragPackets').value.trim() || 'tlshello',
    fragLength:   document.getElementById('fragLength').value.trim()  || '10-20',
    fragInterval: document.getElementById('fragInterval').value.trim() || '10-20',
    fragMaxSplit: document.getElementById('fragMaxSplit').value.trim() || '10',
    fakeDnsEnable: document.getElementById('fakeDns').value === '1',
    ipv6Enable:   document.getElementById('ipv6').value === '1',
    lanAccess:    document.getElementById('lanAccess').value === '1',
    remoteDnsVal: document.getElementById('remoteDns').value.trim() || 'https://cloudflare-dns.com/dns-query',
    localDnsVal:  document.getElementById('localDns').value.trim()  || '8.8.8.8',
    tcpFastOpen:  document.getElementById('tcpFastOpen').value === '1',
    echEnable:    echEnable && !fragEnable,
    echDns:       document.getElementById('echDns').value.trim() || 'https://cloudflare-dns.com/dns-query',
    jsonName:     document.getElementById('jsonName').value.trim(),
    routingCountries: {
      ir: document.getElementById('routeIr').checked,
      cn: document.getElementById('routeCn').checked,
      ru: document.getElementById('routeRu').checked
    },
    blockRules: {
      ads: document.getElementById('blockAds').checked,
      porn: document.getElementById('blockPorn').checked,
      quic: document.getElementById('blockQuic').checked,
      malware: document.getElementById('blockMalware').checked,
      phishing: document.getElementById('blockPhishing').checked,
      cryptominers: document.getElementById('blockCryptominers').checked
    },
    pingInterval: document.getElementById('pingInterval').value.trim() || '180',
    chainConfig: document.getElementById('chainConfig').value.trim()
  };
}

function collectProtocols() {
  return {
    vless: document.getElementById('protoVless').checked,
    trojan: document.getElementById('protoTrojan').checked
  };
}

function gen() {
  const token    = document.getElementById('uid').value.trim();
  const password = currentPassword();
  const raw_dom  = document.getElementById('wdom').value.trim();
  const dom      = raw_dom.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const raw      = document.getElementById('ips').value.trim();

  if (!token)    { toast('Token موجود نیست'); return; }
  if (!password) { toast('Password موجود نیست'); return; }
  if (!dom)      { toast('آدرس Worker را وارد کن'); return; }
  if (!raw)      { toast('حداقل یک IP وارد کن'); return; }

  const protocols = collectProtocols();
  if (!protocols.vless && !protocols.trojan) { toast('حداقل یک پروتکل (VLESS یا Trojan) انتخاب کن'); return; }

  const settings  = collectSettings();
  if (!settings.routingCountries.ir && !settings.routingCountries.cn && !settings.routingCountries.ru) {
    toast('حداقل یک کشور برای قوانین مسیریابی انتخاب کن');
    return;
  }
  if (!(parseInt(settings.pingInterval) > 0)) {
    toast('Best Ping Interval باید یک عدد مثبت باشد');
    return;
  }
  if (settings.chainConfig) {
    try {
      parseChainConfig(settings.chainConfig);
    } catch (e) {
      toast(e.message);
      return;
    }
  }
  const allIps    = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const ips       = settings.ipv6Enable ? allIps : allIps.filter(ip => !ip.includes(':'));

  if (!ips.length) { toast('پس از فیلتر IPv6 هیچ IP‌ای باقی نماند'); return; }

  const tlsPorts = getChecked('ptls');
  const wsPorts  = getChecked('pws');
  const fp       = document.getElementById('fpSelect').value;

  if (!tlsPorts.length && !wsPorts.length) { toast('حداقل یک پورت انتخاب کن'); return; }

  const btn = document.getElementById('gb');
  btn.innerHTML = '<span class="sp"></span> در حال ساخت...';
  btn.disabled = true;

  setTimeout(() => {
    allC = [];
    let tlsCount = 0, wsCount = 0;

    ips.forEach((ip, ipIdx) => {
      const ipLabel = `IP${ipIdx + 1}`;
      tlsPorts.forEach(port => {
        if (protocols.vless) {
          const label = `VLESS-${ipLabel}-TLS${port}-${fp}`;
          allC.push({ cfg: buildConfig(token, dom, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `VLESS-TLS-${port}`, tagColor: 'var(--blue)' });
          tlsCount++;
        }
        if (protocols.trojan) {
          const label = `TROJAN-${ipLabel}-TLS${port}-${fp}`;
          allC.push({ cfg: buildTrojanConfig(password, dom, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `TROJAN-TLS-${port}`, tagColor: 'var(--green)' });
          tlsCount++;
        }
      });
      wsPorts.forEach(port => {
        if (protocols.vless) {
          const label = `VLESS-${ipLabel}-WS${port}`;
          allC.push({ cfg: buildConfig(token, dom, ip, port, 'none', '', settings.basePath, label, false, ''), tag: `VLESS-WS-${port}`, tagColor: 'var(--orange)' });
          wsCount++;
        }
        if (protocols.trojan) {
          const label = `TROJAN-${ipLabel}-WS${port}`;
          allC.push({ cfg: buildTrojanConfig(password, dom, ip, port, 'none', '', settings.basePath, label, false, ''), tag: `TROJAN-WS-${port}`, tagColor: 'var(--yellow)' });
          wsCount++;
        }
      });
    });

    document.getElementById('lAll').innerHTML = allC.map((c, i) => row(c, i + 1)).join('');
    document.getElementById('sv').textContent  = tlsCount;
    document.getElementById('si').textContent  = wsCount;
    document.getElementById('sa').textContent  = allC.length;
    document.getElementById('cb2').textContent = allC.length;

    const jsonStr = buildJsonConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols);
    lastJsonStr = jsonStr;
    renderCodeBlock('jsonDisplay', jsonStr, highlightJsonLine);

    const singboxStr = buildSingboxConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols);
    lastSingboxStr = singboxStr;
    renderCodeBlock('singboxDisplay', singboxStr, highlightJsonLine);

    const clashStr = buildClashConfig(token, password, dom, ips, tlsPorts, wsPorts, fp, settings, protocols);
    lastClashStr = clashStr;
    renderCodeBlock('clashDisplay', clashStr, highlightYamlLine);

    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

    ['sn1', 'sn2', 'sn3'].forEach(id => { document.getElementById(id).className = 'step done'; });
    document.getElementById('sn4').className = 'step active';
    btn.innerHTML = '✓ ساخته شد — دوباره بساز';
    btn.disabled = false;
    toast(`${allC.length} کانفیگ ساخته شد (${tlsCount} TLS + ${wsCount} WS)`);
  }, 400);
}

function cpJson() {
  if (!lastJsonStr) return;
  navigator.clipboard.writeText(lastJsonStr).then(() => toast('کانفیگ JSON کپی شد'));
}

function dlJson() {
  if (!lastJsonStr) return;
  const fragEnabled = document.getElementById('fragEnable').checked;
  const fileName = fragEnabled ? 'TCB_Fragment.json' : 'TCB_Normal.json';
  downloadFile(lastJsonStr, fileName, 'application/json');
  toast('فایل ' + fileName + ' دانلود شد');
}

function cpSingbox() {
  if (!lastSingboxStr) return;
  navigator.clipboard.writeText(lastSingboxStr).then(() => toast('کانفیگ Sing-box کپی شد'));
}

function dlSingbox() {
  if (!lastSingboxStr) return;
  const fragEnabled = document.getElementById('fragEnable').checked;
  const fileName = fragEnabled ? 'TCB_Singbox_Fragment.json' : 'TCB_Singbox_Normal.json';
  downloadFile(lastSingboxStr, fileName, 'application/json');
  toast('فایل ' + fileName + ' دانلود شد');
}

function cpClash() {
  if (!lastClashStr) return;
  navigator.clipboard.writeText(lastClashStr).then(() => toast('کانفیگ Clash کپی شد'));
}

function dlClash() {
  if (!lastClashStr) return;
  const fileName = 'TCB_Clash.yaml';
  downloadFile(lastClashStr, fileName, 'text/yaml');
  toast('فایل ' + fileName + ' دانلود شد');
}

function cpAll() {
  navigator.clipboard.writeText(allC.map(c => c.cfg).join('\n'))
    .then(() => toast(`${allC.length} کانفیگ کپی شد`));
}

function dlAll() {
  if (!allC.length) return;
  downloadFile(allC.map(c => c.cfg).join('\n'), 'TCB.txt', 'text/plain');
  toast(`فایل TCB.txt با ${allC.length} کانفیگ دانلود شد`);
}

function exportSettings() {
  const json = exportSettingsToString();
  downloadFile(json, 'TCB_Settings.json', 'application/json');
  toast('فایل تنظیمات دانلود شد');
}

function importSettings(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (e) {
      toast('فایل انتخاب‌شده یک فایل JSON معتبر نیست');
      return;
    }
    if (!isValidImportPayload(parsed)) {
      toast('این فایل مخصوص TCB نیست و قابل ایمپورت نمی‌باشد');
      return;
    }
    applyImportedSettings(parsed);
    toggleFrag();
    toggleEch();
    renderWorker(document.getElementById('uid').value.trim(), currentPassword());
    toast('تنظیمات با موفقیت ایمپورت شد');
  };
  reader.onerror = () => toast('خطا در خواندن فایل');
  reader.readAsText(file);
}

function showQrModal(cfgText) {
  const box = document.getElementById('qrModalBox');
  try {
    const qr = generateQRMatrix(cfgText, 'M');
    box.innerHTML = qrMatrixToSvg(qr, 4);
  } catch (e) {
    toast('این کانفیگ برای تولید QR Code بیش از حد طولانی است');
    return;
  }
  document.getElementById('qrModal').classList.add('show');
}

function hideQrModal() {
  document.getElementById('qrModal').classList.remove('show');
  document.getElementById('qrModalBox').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const t = uuid4();
  const p = genPassword();
  document.getElementById('uid').value = t;
  document.getElementById('tpw').value = p;
  renderWorker(t, p);

  document.getElementById('uid').addEventListener('input', e => renderWorker(e.target.value.trim(), currentPassword()));
  document.getElementById('tpw').addEventListener('input', e => renderWorker(document.getElementById('uid').value.trim(), e.target.value.trim()));
  document.getElementById('btn-cp-worker').addEventListener('click', cpWorker);
  document.getElementById('btn-dl-worker').addEventListener('click', dlWorker);
  document.getElementById('btn-mk-token').addEventListener('click', mkToken);
  document.getElementById('btn-cp-token').addEventListener('click', cpToken);
  document.getElementById('btn-mk-pw').addEventListener('click', mkPassword);
  document.getElementById('btn-cp-pw').addEventListener('click', cpPassword);
  document.getElementById('fragEnable').addEventListener('change', toggleFrag);
  document.getElementById('echEnable').addEventListener('change', toggleEch);
  document.getElementById('btn-export-settings').addEventListener('click', exportSettings);
  document.getElementById('btn-import-settings').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    importSettings(file);
    e.target.value = '';
  });
  document.querySelectorAll('.sec-hdr-toggle').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const target = document.getElementById(hdr.dataset.target);
      if (!target) return;
      target.classList.toggle('collapsed');
      hdr.classList.toggle('open');
    });
  });

  document.getElementById('gb').addEventListener('click', gen);
  document.getElementById('btn-cp-all').addEventListener('click', cpAll);
  document.getElementById('btn-dl-all').addEventListener('click', dlAll);
  document.getElementById('btn-cp-json').addEventListener('click', cpJson);
  document.getElementById('btn-dl-json').addEventListener('click', dlJson);
  document.getElementById('btn-cp-json-2').addEventListener('click', cpJson);
  document.getElementById('btn-dl-json-2').addEventListener('click', dlJson);
  document.getElementById('btn-cp-singbox').addEventListener('click', cpSingbox);
  document.getElementById('btn-dl-singbox').addEventListener('click', dlSingbox);
  document.getElementById('btn-cp-singbox-2').addEventListener('click', cpSingbox);
  document.getElementById('btn-dl-singbox-2').addEventListener('click', dlSingbox);
  document.getElementById('btn-cp-clash').addEventListener('click', cpClash);
  document.getElementById('btn-dl-clash').addEventListener('click', dlClash);
  document.getElementById('btn-cp-clash-2').addEventListener('click', cpClash);
  document.getElementById('btn-dl-clash-2').addEventListener('click', dlClash);

  document.getElementById('lAll').addEventListener('click', e => {
    const qrBtn = e.target.closest('.bqr');
    if (qrBtn) {
      showQrModal(decodeURIComponent(qrBtn.dataset.cfg));
      return;
    }
    const btn = e.target.closest('.bcp');
    if (!btn) return;
    navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cfg)).then(() => {
      btn.textContent = '✓';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'کپی'; btn.classList.remove('ok'); }, 1800);
    });
  });

  document.getElementById('qrModalClose').addEventListener('click', hideQrModal);
  document.getElementById('qrModal').addEventListener('click', e => {
    if (e.target.id === 'qrModal') hideQrModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideQrModal();
  });
});