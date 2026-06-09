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
  const PF = "['[2602:fc59:b0:64::]','[2602:fc59:11:64::]','[2a02:898:146:64::]']";
  return `import{connect as _a}from'cloudflare:sockets';
const _b=${XK};
const _d=[${enc.join(',')}];
const _e=(()=>_d.map(v=>String.fromCharCode(v^_b)).join('').replace(/-/g,'').toLowerCase())();
const _PF=${PF};
export default{async fetch(r){if((r.headers.get('upgrade')||'').toLowerCase()!=='websocket')return new Response('',{status:200});return _hw(r)}};
function _dd(h){if(!h)return null;try{return Uint8Array.from(atob(h.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)).buffer}catch(_){return null}}
function _ms(ws,ed){return new ReadableStream({start(ctrl){if(ed)ctrl.enqueue(ed);ws.addEventListener('message',({data:m})=>ctrl.enqueue(m));ws.addEventListener('close',()=>ctrl.close());ws.addEventListener('error',e=>ctrl.error(e))}})}
async function _dns(h){try{const r=await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(h)+'&type=A',{headers:{accept:'application/dns-json'}});const d=await r.json();return d.Answer?.find(a=>a.type===1)?.data||null}catch(_){return null}}
function _p6(v4,pfx){const h=v4.split('.').map(n=>parseInt(n).toString(16).padStart(2,'0'));const m=pfx.match(/^\[([0-9A-Fa-f:]+)\]$/);return m?('['+m[1]+h[0]+h[1]+':'+h[2]+h[3]+']'):null}
async function _oc(ref,host,port,init){const s=_a({hostname:host,port});ref.v=s;if(init.byteLength>0){const w=s.writable.getWriter();await w.write(init);w.releaseLock()}return s}
function _pw(sock,ws,vh,onND){let got=false;let hdr=vh;sock.readable.pipeTo(new WritableStream({async write(chunk){got=true;if(hdr){const out=new Uint8Array(hdr.byteLength+chunk.byteLength);out.set(hdr,0);out.set(chunk instanceof Uint8Array?chunk:new Uint8Array(chunk),hdr.byteLength);ws.send(out.buffer);hdr=null}else ws.send(chunk)},close(){},abort(){}})).catch(()=>{}).finally(()=>{if(!got&&onND)onND();else try{ws.close()}catch(_){}})}
async function _hw(r){const[cl,sv]=Object.values(new WebSocketPair());sv.accept();sv.binaryType='arraybuffer';const ed=_dd(r.headers.get('sec-websocket-protocol')||'');let ref={v:null};_ms(sv,ed).pipeTo(new WritableStream({async write(chunk){if(ref.v){const w=ref.v.writable.getWriter();await w.write(chunk);w.releaseLock();return}const d=chunk instanceof ArrayBuffer?new Uint8Array(chunk):new Uint8Array(await chunk.arrayBuffer());if(d.length<19)throw new Error('s');const uid=[...d.slice(1,17)].map(v=>v.toString(16).padStart(2,'0')).join('');if(uid!==_e)throw new Error('a');const al=d[17];let i=18+al+1;const port=(d[i]<<8)|d[i+1];i+=2;const at=d[i++];let host='';if(at===1){host=[...d.slice(i,i+4)].join('.');i+=4}else if(at===2){const n=d[i++];host=new TextDecoder().decode(d.slice(i,i+n));i+=n}else if(at===3){const b=d.slice(i,i+16);host=[...Array(8)].map((_,j)=>((b[j*2]<<8)|b[j*2+1]).toString(16)).join(':');i+=16}else throw new Error('t');const init=d.slice(i);const vh=new Uint8Array([0,0]);const retry=async()=>{try{if(at===3){sv.close();return}const isv4=at===1;const v4=isv4?host:await _dns(host);if(!v4){sv.close();return}const p=_PF[Math.floor(Math.random()*_PF.length)];const v6=_p6(v4,p);if(!v6){sv.close();return}await _oc(ref,v6,port,init);_pw(ref.v,sv,vh,null)}catch(_){try{sv.close()}catch(__){}}};try{await _oc(ref,host,port,init);_pw(ref.v,sv,vh,retry)}catch(_){await retry()}},close(){try{ref.v?.readable.cancel()}catch(_){}},abort(){try{ref.v?.readable.cancel()}catch(_){}}})).catch(()=>{});return new Response(null,{status:101,webSocket:cl})}`;
}

function hl(code) {
  let h = code
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  h = h.replace(/\b(import|from|const|let|async|await|return|if|else|for|of|new|try|catch|null|true|false)\b/g,'<span class="k">$1</span>');
  h = h.replace(/('[^']*')/g,'<span class="s">$1</span>');
  h = h.replace(/\b(\d+)\b/g,'<span class="n">$1</span>');
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

function buildJsonConfig(token, dom, ips, tlsPorts, wsPorts, fp) {
  const basePath     = document.getElementById('pathSelect').value;
  const path         = basePath + '?ed=2560';
  const fragEnable   = document.getElementById('fragEnable').checked;
  const fragPackets  = document.getElementById('fragPackets').value.trim() || 'tlshello';
  const fragLength   = document.getElementById('fragLength').value.trim() || '10-20';
  const fragInterval = document.getElementById('fragInterval').value.trim() || '10-20';
  const fakeDnsEnable = document.getElementById('fakeDns').value === '1';
  const ipv6Enable   = document.getElementById('ipv6').value === '1';
  const lanAccess    = document.getElementById('lanAccess').value === '1';
  const remoteDnsVal = document.getElementById('remoteDns').value.trim() || 'https://cloudflare-dns.com/dns-query';
  const localDnsVal  = document.getElementById('localDns').value.trim() || '8.8.8.8';
  const tcpFastOpen  = document.getElementById('tcpFastOpen').value === '1';
  const echEnable    = document.getElementById('echEnable').checked && !fragEnable;
  const echDns       = document.getElementById('echDns').value.trim() || 'https://cloudflare-dns.com/dns-query';

  const outboundSockopt = {
    domainStrategy: 'UseIP',
    tcpFastOpen: tcpFastOpen,
    happyEyeballs: { tryDelayMs: 250, prioritizeIPv6: false, interleave: 2, maxConcurrentTry: 4 }
  };

  const outbounds = [];
  let idx = 1;

  ips.forEach(ip => {
    tlsPorts.forEach(port => {
      const tlsSettings = {
        allowInsecure: false,
        fingerprint: fp,
        serverName: dom,
        show: false,
        alpn: ['http/1.1']
      };
      if (echEnable) {
        tlsSettings.echConfigList = echDns;
      }
      const streamSettings = {
        network: 'ws',
        security: 'tls',
        tlsSettings: tlsSettings,
        wsSettings: { headers: { Host: dom }, path: path },
        sockopt: outboundSockopt
      };
      if (fragEnable) {
        streamSettings.finalmask = {
          tcp: [{
            type: 'fragment',
            settings: { packets: fragPackets, length: fragLength, delay: fragInterval, maxSplit: '0-0' }
          }]
        };
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

    wsPorts.forEach(port => {
      const streamSettings = {
        network: 'ws',
        wsSettings: { headers: { Host: dom }, path: path },
        sockopt: outboundSockopt
      };
      if (fragEnable) {
        streamSettings.finalmask = {
          tcp: [{
            type: 'fragment',
            settings: { packets: fragPackets, length: fragLength, delay: fragInterval, maxSplit: '0-0' }
          }]
        };
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

  outbounds.push({ protocol: 'freedom', settings: { domainStrategy: 'UseIP' }, tag: 'direct' });
  outbounds.push({ protocol: 'blackhole', settings: { response: { type: 'http' } }, tag: 'block' });
  outbounds.push({ protocol: 'dns', settings: { nonIPQuery: 'reject' }, tag: 'dns-out' });

  const dnsServers = [];
  if (fakeDnsEnable) {
    dnsServers.push({ address: 'fakedns', domains: ['geosite:cn','domain:ir','geosite:category-ir'] });
  }
  dnsServers.push(remoteDnsVal);
  dnsServers.push({ address: localDnsVal, domains: ['domain:ir','geosite:category-ir'], skipFallback: true, tag: 'domestic-dns' });

  const sniffingDestOverride = fakeDnsEnable ? ['http','tls','fakedns'] : ['http','tls'];

  const configObj = {
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
      servers: dnsServers,
      queryStrategy: ipv6Enable ? 'UseIP' : 'UseIPv4',
      tag: 'dns-module'
    },
    inbounds: [
      {
        listen: lanAccess ? '0.0.0.0' : '127.0.0.1',
        port: 10808,
        protocol: 'mixed',
        settings: { auth: 'noauth', udp: true, userLevel: 8 },
        sniffing: { destOverride: sniffingDestOverride, enabled: true, routeOnly: true },
        tag: 'mixed-in'
      },
      {
        listen: lanAccess ? '0.0.0.0' : '127.0.0.1',
        port: 10853,
        protocol: 'dokodemo-door',
        settings: { address: '1.1.1.1', network: 'tcp,udp', port: 53 },
        tag: 'dns-in'
      }
    ],
    log: { loglevel: 'none' },
    observatory: { enableConcurrency: true, probeInterval: '3m', probeUrl: 'https://www.gstatic.com/generate_204', subjectSelector: ['proxy-'] },
    outbounds: outbounds,
    policy: {
      levels: { '8': { connIdle: 300, downlinkOnly: 1, handshake: 4, uplinkOnly: 1 } },
      system: { statsOutboundUplink: true, statsOutboundDownlink: true }
    },
    remarks: (document.getElementById('jsonName').value.trim()) || (fragEnable ? '👽 Anonymous TCB (Fragment) 🚀' : '👽 Anonymous TCB (Normal) 🚀'),
    routing: {
      balancers: [{ selector: ['proxy-'], strategy: { type: 'leastPing' }, tag: 'proxy-round' }],
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { inboundTag: ['mixed-in'], outboundTag: 'dns-out', port: '53', type: 'field' },
        { inboundTag: ['dns-in'], outboundTag: 'dns-out', type: 'field' },
        { ip: ['geoip:private'], outboundTag: 'direct', type: 'field' },
        { domain: ['geosite:private'], outboundTag: 'direct', type: 'field' },
        { network: 'udp', outboundTag: 'block', type: 'field' },
        { domain: ['geosite:category-ads-all','geosite:category-ads-ir','geosite:malware','geosite:phishing','geosite:cryptominers'], outboundTag: 'block', type: 'field' },
        { ip: ['geoip:malware','geoip:phishing'], outboundTag: 'block', type: 'field' },
        { domain: ['domain:ir','geosite:category-ir'], outboundTag: 'direct', type: 'field' },
        { ip: ['geoip:ir'], outboundTag: 'direct', type: 'field' },
        { inboundTag: ['domestic-dns'], outboundTag: 'direct', type: 'field' },
        { balancerTag: 'proxy-round', inboundTag: ['dns-module'], type: 'field' },
        { balancerTag: 'proxy-round', network: 'tcp,udp', type: 'field' }
      ]
    },
    stats: {}
  };

  if (fakeDnsEnable) {
    configObj.fakedns = [{ ipPool: '198.18.0.0/15', poolSize: 10000 }];
  }

  return JSON.stringify(configObj, null, 2);
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
  const blob = new Blob([txt], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('فایل ' + fileName + ' دانلود شد');
}

let allC = [];

function getChecked(cls) {
  return [...document.querySelectorAll('.' + cls + ':checked')].map(el => el.value);
}

function buildConfig(token, dom, ip, port, security, fp, path, label, echActive, echDns) {
  const h = ip.includes(':') ? `[${ip}]` : ip;
  const edPath = path + '?ed=2560';
  const params = new URLSearchParams({
    encryption: 'none', security: security, type: 'ws',
    host: dom, path: edPath, allowInsecure: '0'
  });
  if (security === 'tls') {
    params.set('sni', dom);
    params.set('fp', fp);
    params.set('alpn', 'http/1.1');
    if (echActive) {
      params.set('ech', echDns);
    }
  }
  const name = encodeURIComponent(`CF-${label}`);
  return `vless://${token}@${h}:${port}?${params}#${name}`;
}

function gen() {
  const token = document.getElementById('uid').value.trim();
  const raw_dom = document.getElementById('wdom').value.trim();
  const dom = raw_dom.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const raw   = document.getElementById('ips').value.trim();

  if (!token) { toast('Token موجود نیست'); return; }
  if (!dom)   { toast('آدرس Worker را وارد کن'); return; }
  if (!raw)   { toast('حداقل یک IP وارد کن'); return; }

  const ipv6Enable = document.getElementById('ipv6').value === '1';
  const allIps     = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const ips        = ipv6Enable ? allIps : allIps.filter(ip => !ip.includes(':'));

  if (!ips.length) { toast('پس از فیلتر IPv6 هیچ IP‌ای باقی نماند'); return; }

  const tlsPorts  = getChecked('ptls');
  const wsPorts   = getChecked('pws');
  const fp        = document.getElementById('fpSelect').value;
  const path      = document.getElementById('pathSelect').value;
  const fragEn    = document.getElementById('fragEnable').checked;
  const echEn     = document.getElementById('echEnable').checked;
  const echDns    = document.getElementById('echDns').value.trim() || 'https://cloudflare-dns.com/dns-query';
  const echActive = echEn && !fragEn;

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
        allC.push({ cfg: buildConfig(token, dom, ip, port, 'tls', fp, path, label, echActive, echDns), tag: `TLS-${port}`, tagColor: 'var(--blue)' });
        tlsCount++;
      });
      wsPorts.forEach(port => {
        const label = `${ipLabel}-WS${port}`;
        allC.push({ cfg: buildConfig(token, dom, ip, port, 'none', '', path, label, false, ''), tag: `WS-${port}`, tagColor: 'var(--orange)' });
        wsCount++;
      });
    });

    document.getElementById('lAll').innerHTML = allC.map((c, i) => row(c, i + 1)).join('');
    document.getElementById('sv').textContent  = tlsCount;
    document.getElementById('si').textContent  = wsCount;
    document.getElementById('sa').textContent  = allC.length;
    document.getElementById('cb2').textContent = allC.length;

    const jsonStr = buildJsonConfig(token, dom, ips, tlsPorts, wsPorts, fp);
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

function dlAll() {
  if (!allC.length) return;
  const txt = allC.map(c => c.cfg).join('\n');
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'TCB.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`فایل TCB.txt با ${allC.length} کانفیگ دانلود شد`);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}