import { buildWorker, hl } from './worker-builder.js';
import { buildConfig, buildJsonConfig } from './config-builder.js';
import { toast, getChecked, row, downloadFile } from './ui.js';

let allC = [];

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function renderWorker(token) {
  if (!token) return;
  const code = await buildWorker(token);
  document.getElementById('workerDisplay').innerHTML = hl(code);
}

function mkToken() {
  const t = uuid4();
  document.getElementById('uid').value = t;
  renderWorker(t);
  toast('Token جدید — کد Worker آپدیت شد');
}

function cpToken() {
  const v = document.getElementById('uid').value.trim();
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => toast('Token کپی شد'));
}

async function cpWorker() {
  const token = document.getElementById('uid').value.trim();
  if (!token) { toast('ابتدا Token بساز'); return; }
  const code = await buildWorker(token);
  navigator.clipboard.writeText(code).then(() => toast('کد Worker کپی شد'));
}

async function dlWorker() {
  const token = document.getElementById('uid').value.trim();
  if (!token) { toast('ابتدا Token وارد کن'); return; }
  const code = await buildWorker(token);
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
    fakeDnsEnable: document.getElementById('fakeDns').value === '1',
    ipv6Enable:   document.getElementById('ipv6').value === '1',
    lanAccess:    document.getElementById('lanAccess').value === '1',
    remoteDnsVal: document.getElementById('remoteDns').value.trim() || 'https://cloudflare-dns.com/dns-query',
    localDnsVal:  document.getElementById('localDns').value.trim()  || '8.8.8.8',
    tcpFastOpen:  document.getElementById('tcpFastOpen').value === '1',
    echEnable:    echEnable && !fragEnable,
    echDns:       document.getElementById('echDns').value.trim() || 'https://cloudflare-dns.com/dns-query',
    jsonName:     document.getElementById('jsonName').value.trim()
  };
}

function gen() {
  const token   = document.getElementById('uid').value.trim();
  const raw_dom = document.getElementById('wdom').value.trim();
  const dom     = raw_dom.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const raw     = document.getElementById('ips').value.trim();

  if (!token) { toast('Token موجود نیست'); return; }
  if (!dom)   { toast('آدرس Worker را وارد کن'); return; }
  if (!raw)   { toast('حداقل یک IP وارد کن'); return; }

  const settings  = collectSettings();
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
        const label = `${ipLabel}-TLS${port}-${fp}`;
        allC.push({ cfg: buildConfig(token, dom, ip, port, 'tls', fp, settings.basePath, label, settings.echEnable, settings.echDns), tag: `TLS-${port}`, tagColor: 'var(--blue)' });
        tlsCount++;
      });
      wsPorts.forEach(port => {
        const label = `${ipLabel}-WS${port}`;
        allC.push({ cfg: buildConfig(token, dom, ip, port, 'none', '', settings.basePath, label, false, ''), tag: `WS-${port}`, tagColor: 'var(--orange)' });
        wsCount++;
      });
    });

    document.getElementById('lAll').innerHTML = allC.map((c, i) => row(c, i + 1)).join('');
    document.getElementById('sv').textContent  = tlsCount;
    document.getElementById('si').textContent  = wsCount;
    document.getElementById('sa').textContent  = allC.length;
    document.getElementById('cb2').textContent = allC.length;

    const jsonStr = buildJsonConfig(token, dom, ips, tlsPorts, wsPorts, fp, settings);
    document.getElementById('jsonDisplay').textContent = jsonStr;

    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

    ['sn1', 'sn2', 'sn3'].forEach(id => { document.getElementById(id).className = 'step done'; });
    document.getElementById('sn4').className = 'step active';
    btn.innerHTML = '✓ ساخته شد — دوباره بساز';
    btn.disabled = false;
    toast(`${allC.length} کانفیگ VLESS ساخته شد (${tlsCount} TLS + ${wsCount} WS)`);
  }, 400);
}

function cpJson() {
  const txt = document.getElementById('jsonDisplay').textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => toast('کانفیگ JSON کپی شد'));
}

function dlJson() {
  const txt = document.getElementById('jsonDisplay').textContent;
  if (!txt) return;
  const fragEnabled = document.getElementById('fragEnable').checked;
  const fileName = fragEnabled ? 'TCB_Fragment.json' : 'TCB_Normal.json';
  downloadFile(txt, fileName, 'application/json');
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

document.addEventListener('DOMContentLoaded', () => {
  const t = uuid4();
  document.getElementById('uid').value = t;
  renderWorker(t);

  document.getElementById('uid').addEventListener('input', e => renderWorker(e.target.value.trim()));
  document.getElementById('btn-cp-worker').addEventListener('click', cpWorker);
  document.getElementById('btn-dl-worker').addEventListener('click', dlWorker);
  document.getElementById('btn-mk-token').addEventListener('click', mkToken);
  document.getElementById('btn-cp-token').addEventListener('click', cpToken);
  document.getElementById('fragEnable').addEventListener('change', toggleFrag);
  document.getElementById('echEnable').addEventListener('change', toggleEch);
  document.getElementById('gb').addEventListener('click', gen);
  document.getElementById('btn-cp-all').addEventListener('click', cpAll);
  document.getElementById('btn-dl-all').addEventListener('click', dlAll);
  document.getElementById('btn-cp-json').addEventListener('click', cpJson);
  document.getElementById('btn-dl-json').addEventListener('click', dlJson);
  document.getElementById('btn-cp-json-2').addEventListener('click', cpJson);
  document.getElementById('btn-dl-json-2').addEventListener('click', dlJson);

  document.getElementById('lAll').addEventListener('click', e => {
    const btn = e.target.closest('.bcp');
    if (!btn) return;
    navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cfg)).then(() => {
      btn.textContent = '✓';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'کپی'; btn.classList.remove('ok'); }, 1800);
    });
  });
});