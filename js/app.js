const XK = 0x4B;
let _workerTpl = null;

function xenc(s) {
  return [...s].map(c => c.charCodeAt(0) ^ XK);
}

async function fetchWorkerTpl() {
  if (_workerTpl !== null) return _workerTpl;
  try {
    const r = await fetch('manual-worker/worker.js');
    if (r.ok) { _workerTpl = await r.text(); }
  } catch(e) {}
  return _workerTpl;
}

async function buildWorker(token) {
  const enc = xenc(token);
  const tpl = await fetchWorkerTpl();
  if (tpl) {
    return tpl.replace('__WORKER_TOKEN_ARRAY__', `[${enc.join(',')}]`);
  }
  return `import{connect as _a}from'cloudflare:sockets';
const _b=${XK};
const _c=a=>a.map(v=>String.fromCharCode(v^_b)).join('');
const _d=[${enc.join(',')}];
const _e=(()=>{const _f=_d.map(v=>String.fromCharCode(v^_b)).join('').replace(/-/g,'').toLowerCase();return _f})();
export default{async fetch(r){if((r.headers.get(_c([30,59,44,57,42,47,46]))||'').toLowerCase()===_c([60,46,41,56,36,40,32,46,63]))return _g(r);return new Response('',{status:200})}};
async function _g(r){
const[_h,_i]=Object.values(new WebSocketPair());
_i.accept();
let _j=0,_k=null,_l=[];
_i.addEventListener(_c([38,46,56,56,42,44,46]),async({data:_m})=>{
const _n=_m instanceof ArrayBuffer?new Uint8Array(_m):new Uint8Array(await _m.arrayBuffer());
if(!_j){
if(_n.length<19){_i.close(1002);return;}
const _o=[..._n.slice(1,17)].map(v=>v.toString(16).padStart(2,'0')).join('');
if(_o!==_e){_i.close(1008);return;}
const _p=_n[17];
let _q=18+_p+1;
const _r=(_n[_q]<<8)|_n[_q+1];_q+=2;
const _s=_n[_q++];
let _t='';
if(_s===1){_t=_n.slice(_q,_q+4).join('.');_q+=4;}
else if(_s===2){const _u=_n[_q++];_t=new TextDecoder().decode(_n.slice(_q,_q+_u));_q+=_u;}
else if(_s===3){const _v=_n.slice(_q,_q+16);_t=[...Array(8)].map((_,i)=>((_v[i*2]<<8)|_v[i*2+1]).toString(16)).join(':');_q+=16;}
else{_i.close(1002);return;}
const _w=_n.slice(_q);
_j=1;
_i.send(new Uint8Array(2));
try{
_k=_a({hostname:_t,port:_r});
const _x=_k.writable.getWriter();
if(_w.length)await _x.write(_w);
for(const _y of _l)await _x.write(_y);
_l=[];_x.releaseLock();
(async()=>{try{const _z=_k.readable.getReader();for(;;){const{done:_A,value:_B}=await _z.read();if(_A)break;_i.send(_B);}}catch(_){}try{_i.close();}catch(_){}})();
}catch(_){_i.close(1011);}
}else if(_k){const _x=_k.writable.getWriter();await _x.write(_n);_x.releaseLock();}
else _l.push(_n);
});
_i.addEventListener(_c([40,39,36,56,46]),()=>{try{_k?.readable.cancel();}catch(_){}});
return new Response(null,{status:101,webSocket:_h});
}`;
}

function hl(code) {
  let h = code
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  h = h.replace(/\b(import|from|const|let|async|await|return|if|else|for|of|new|try|catch|null|true|false)\b/g,
    '<span class="k">$1</span>');
  h = h.replace(/('[^']*')/g, '<span class="s">$1</span>');
  h = h.replace(/\b(\d+)\b/g, '<span class="n">$1</span>');
  return h;
}

async function renderWorker(token) {
  if (!token) return;
  const code = await buildWorker(token);
  document.getElementById('workerDisplay').innerHTML = hl(code);
}

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
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
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'worker.js';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('فایل worker.js دانلود شد');
}

window.addEventListener('DOMContentLoaded', () => {
  const t = uuid4();
  document.getElementById('uid').value = t;
  renderWorker(t);
});

function toggleFrag() {
  const en = document.getElementById('fragEnable').checked;
  const ff = document.getElementById('fragFields');
  if (en) { ff.classList.remove('disabled'); } else { ff.classList.add('disabled'); }
}

function buildJsonConfig(token, dom, ips, tlsPorts, wsPorts, fps, paths) {
  const fragEnable = document.getElementById('fragEnable').checked;
  const fragPackets = document.getElementById('fragPackets').value.trim() || 'tlshello';
  const fragLength = document.getElementById('fragLength').value.trim() || '10-20';
  const fragInterval = document.getElementById('fragInterval').value.trim() || '10-20';

  const outbounds = [];
  let idx = 1;

  ips.forEach(ip => {
    tlsPorts.forEach(port => {
      fps.forEach(fp => {
        paths.forEach(path => {
          const streamSettings = {
            network: 'ws',
            security: 'tls',
            tlsSettings: { allowInsecure: false, fingerprint: fp, serverName: dom, show: false },
            wsSettings: { headers: { Host: dom }, path: path }
          };
          if (fragEnable) {
            streamSettings.settings = { fragment: { packets: fragPackets, length: fragLength, interval: fragInterval } };
          }
          outbounds.push({
            mux: { concurrency: -1, enabled: false },
            protocol: 'vless',
            settings: { vnext: [{ address: ip, port: parseInt(port), users: [{ encryption: 'none', id: token, level: 8 }] }] },
            streamSettings: streamSettings,
            tag: 'proxy-' + idx
          });
          idx++;
        });
      });
    });

    wsPorts.forEach(port => {
      paths.forEach(path => {
        const streamSettings = {
          network: 'ws',
          wsSettings: { headers: { Host: dom }, path: path }
        };
        if (fragEnable) {
          streamSettings.settings = { fragment: { packets: fragPackets, length: fragLength, interval: fragInterval } };
        }
        outbounds.push({
          mux: { concurrency: -1, enabled: false },
          protocol: 'vless',
          settings: { vnext: [{ address: ip, port: parseInt(port), users: [{ encryption: 'none', id: token, level: 8 }] }] },
          streamSettings: streamSettings,
          tag: 'proxy-' + idx
        });
        idx++;
      });
    });
  });

  outbounds.push({ protocol: 'freedom', settings: { domainStrategy: 'UseIP' }, tag: 'direct' });
  outbounds.push({ protocol: 'blackhole', settings: { response: { type: 'http' } }, tag: 'block' });
  outbounds.push({ protocol: 'dns', tag: 'dns-out' });

  const config = {
    dns: {
      hosts: {
        'domain:googleapis.cn': 'googleapis.com',
        'dns.alidns.com': ['223.5.5.5','223.6.6.6','2400:3200::1','2400:3200:baba::1'],
        'one.one.one.one': ['1.1.1.1','1.0.0.1','2606:4700:4700::1111','2606:4700:4700::1001'],
        'dns.cloudflare.com': ['104.16.132.229','104.16.133.229','2606:4700::6810:84e5','2606:4700::6810:85e5'],
        'cloudflare-dns.com': ['104.16.248.249','104.16.249.249','2606:4700::6810:f8f9','2606:4700::6810:f9f9'],
        'dot.pub': ['1.12.12.12','120.53.53.53'],
        'dns.google': ['8.8.8.8','8.8.4.4','2001:4860:4860::8888','2001:4860:4860::8844'],
        'dns.quad9.net': ['9.9.9.9','149.112.112.112','2620:fe::fe','2620:fe::9'],
        'common.dot.dns.yandex.net': ['77.88.8.8','77.88.8.1','2a02:6b8::feed:0ff','2a02:6b8:0:1::feed:0ff']
      },
      servers: [
        { address: 'fakedns', domains: ['geosite:cn','domain:ir','geosite:category-ir'] },
        'https://' + dom + '/dns-query',
        { address: '8.8.8.8', domains: ['domain:ir','geosite:category-ir'], skipFallback: true, tag: 'domestic-dns' }
      ],
      tag: 'dns-module'
    },
    fakedns: [{ ipPool: '198.18.0.0/15', poolSize: 10000 }],
    inbounds: [{
      listen: '127.0.0.1', port: 10808, protocol: 'socks',
      settings: { auth: 'noauth', udp: true, userLevel: 8 },
      sniffing: { destOverride: ['http','tls','fakedns'], enabled: true, routeOnly: false },
      tag: 'socks'
    }],
    log: { loglevel: 'none' },
    observatory: { enableConcurrency: true, probeInterval: '3m', probeUrl: 'https://www.gstatic.com/generate_204', subjectSelector: ['proxy-'] },
    outbounds: outbounds,
    policy: {
      levels: { '8': { connIdle: 300, downlinkOnly: 1, handshake: 4, uplinkOnly: 1 } },
      system: { statsOutboundUplink: true, statsOutboundDownlink: true }
    },
    remarks: 'My configs 🚀',
    routing: {
      balancers: [{ selector: ['proxy-'], strategy: { type: 'leastPing' }, tag: 'proxy-round' }],
      domainStrategy: 'AsIs',
      rules: [
        { inboundTag: ['socks'], outboundTag: 'dns-out', port: '53', type: 'field' },
        { network: 'udp', outboundTag: 'block', port: '443', type: 'field' },
        { ip: ['geoip:private'], outboundTag: 'direct', type: 'field' },
        { domain: ['geosite:private'], outboundTag: 'direct', type: 'field' },
        { domain: ['domain:ir','geosite:category-ir'], outboundTag: 'direct', type: 'field' },
        { ip: ['geoip:ir'], outboundTag: 'direct', type: 'field' },
        { inboundTag: ['domestic-dns'], outboundTag: 'direct', type: 'field' },
        { balancerTag: 'proxy-round', inboundTag: ['dns-module'], type: 'field' },
        { balancerTag: 'proxy-round', network: 'tcp,udp', type: 'field' }
      ]
    },
    stats: {}
  };

  return JSON.stringify(config, null, 2);
}

function cpJson() {
  const txt = document.getElementById('jsonDisplay').textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => toast('کانفیگ JSON کپی شد'));
}

let allC = [];

function getChecked(cls) {
  return [...document.querySelectorAll('.' + cls + ':checked')].map(el => el.value);
}

function buildConfig(token, dom, ip, port, security, fp, path, label) {
  const h = ip.includes(':') ? `[${ip}]` : ip;
  const params = new URLSearchParams({
    encryption: 'none', security: security, type: 'ws',
    host: dom, path: path, allowInsecure: '0'
  });
  if (security === 'tls') { params.set('sni', dom); params.set('fp', fp); }
  const name = encodeURIComponent(`CF-${label}`);
  return `vless://${token}@${h}:${port}?${params}#${name}`;
}

function gen() {
  const token = document.getElementById('uid').value.trim();
  const dom   = document.getElementById('wdom').value.trim();
  const raw   = document.getElementById('ips').value.trim();

  if (!token) { toast('Token موجود نیست'); return; }
  if (!dom)   { toast('آدرس Worker را وارد کن'); return; }
  if (!raw)   { toast('حداقل یک IP وارد کن'); return; }

  const ips      = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const tlsPorts = getChecked('ptls');
  const wsPorts  = getChecked('pws');
  const fps      = getChecked('pfp');
  const paths    = getChecked('ppath');

  if (!tlsPorts.length && !wsPorts.length) { toast('حداقل یک پورت انتخاب کن'); return; }
  if (!fps.length)   { toast('حداقل یک Fingerprint انتخاب کن'); return; }
  if (!paths.length) { toast('حداقل یک Path انتخاب کن'); return; }

  const btn = document.getElementById('gb');
  btn.innerHTML = '<span class="sp"></span> در حال ساخت...';
  btn.disabled = true;

  setTimeout(() => {
    allC = [];
    let tlsCount = 0, wsCount = 0;

    ips.forEach((ip, ipIdx) => {
      const ipLabel = `IP${ipIdx + 1}`;
      tlsPorts.forEach(port => {
        fps.forEach(fp => {
          paths.forEach(path => {
            const pathSlug = path === '/' ? 'root' : path.slice(1);
            const label = `${ipLabel}-TLS${port}-${fp}-${pathSlug}`;
            allC.push({ cfg: buildConfig(token, dom, ip, port, 'tls', fp, path, label), tag: `TLS-${port}`, tagColor: 'var(--blue)' });
            tlsCount++;
          });
        });
      });
      wsPorts.forEach(port => {
        paths.forEach(path => {
          const pathSlug = path === '/' ? 'root' : path.slice(1);
          const label = `${ipLabel}-WS${port}-${pathSlug}`;
          allC.push({ cfg: buildConfig(token, dom, ip, port, 'none', 'chrome', path, label), tag: `WS-${port}`, tagColor: 'var(--orange)' });
          wsCount++;
        });
      });
    });

    document.getElementById('lAll').innerHTML = allC.map((c, i) => row(c, i + 1)).join('');
    document.getElementById('sv').textContent  = tlsCount;
    document.getElementById('si').textContent  = wsCount;
    document.getElementById('sa').textContent  = allC.length;
    document.getElementById('cb2').textContent = allC.length;

    const jsonStr = buildJsonConfig(token, dom, ips, tlsPorts, wsPorts, fps, paths);
    document.getElementById('jsonDisplay').textContent = jsonStr;

    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

    ['sn1','sn2','sn3'].forEach(id => { document.getElementById(id).className = 'step done'; });
    document.getElementById('sn4').className = 'step active';
    btn.innerHTML = '✓ ساخته شد — دوباره بساز';
    btn.disabled = false;
    toast(`${allC.length} کانفیگ VLESS ساخته شد (${tlsCount} TLS + ${wsCount} WS)`);
  }, 400);
}

function row(c, n) {
  const s = encodeURIComponent(c.cfg);
  const color = c.tagColor || 'var(--blue)';
  return `<div class="cfi" style="border-right-color:${color}">
    <span class="cn">${String(n).padStart(2,'0')}</span>
    <span class="ctg" style="color:${color};background:${color}1a">${c.tag}</span>
    <span class="ctx" title="${c.cfg}">${c.cfg}</span>
    <button class="bcp" onclick="cpOne(this,'${s}')">کپی</button>
  </div>`;
}

function cpOne(btn, enc) {
  navigator.clipboard.writeText(decodeURIComponent(enc)).then(() => {
    btn.textContent = '✓'; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = 'کپی'; btn.classList.remove('ok'); }, 1800);
  });
}

function cpAll() {
  navigator.clipboard.writeText(allC.map(c => c.cfg).join('\n'))
    .then(() => toast(`${allC.length} کانفیگ کپی شد`));
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}