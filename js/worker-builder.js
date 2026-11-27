import { createZip } from './zip-writer.js';

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

export async function buildWorker(token, password, fallbackDomain) {
  const encToken = xenc(token);
  const encPass = xenc(password);
  const fbLiteral = JSON.stringify(String(fallbackDomain || '').trim());
  const tpl = await fetchWorkerTpl();
  if (tpl) {
    return tpl.replace('__WORKER_TOKEN_ARRAY__', `[${encToken.join(',')}]`).replace('__WORKER_TROJAN_ARRAY__', `[${encPass.join(',')}]`).replace('__WORKER_FALLBACK_STRING__', fbLiteral);
  }

  const hardcoded = `import{connect as _a}from'cloudflare:sockets';
const _b=75;
const _d=__WORKER_TOKEN_ARRAY__;
const _e=(()=>_d.map(v=>String.fromCharCode(v^_b)).join('').replace(/-/g,'').toLowerCase())();
const _tp=__WORKER_TROJAN_ARRAY__;
const _tw=(()=>_tp.map(v=>String.fromCharCode(v^_b)).join(''))();
function _rr(x,n){return (x>>>n)|(x<<(32-n))}
function _sh(msg){
const _k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
let _h=[0xc1059ed8,0x367cd507,0x3070dd17,0xf70e5939,0xffc00b31,0x68581511,0x64f98fa7,0xbefa4fa4];
const _by=new TextEncoder().encode(msg);
const _l=_by.length;
const _bl=_l*8;
const _t=Math.ceil((_l+9)/64)*64;
const _bf=new Uint8Array(_t);
_bf.set(_by,0);
_bf[_l]=0x80;
const _hi=Math.floor(_bl/0x100000000);
const _lo=_bl>>>0;
_bf[_t-8]=(_hi>>>24)&0xff;_bf[_t-7]=(_hi>>>16)&0xff;_bf[_t-6]=(_hi>>>8)&0xff;_bf[_t-5]=_hi&0xff;
_bf[_t-4]=(_lo>>>24)&0xff;_bf[_t-3]=(_lo>>>16)&0xff;_bf[_t-2]=(_lo>>>8)&0xff;_bf[_t-1]=_lo&0xff;
for(let off=0;off<_t;off+=64){
const w=new Uint32Array(64);
for(let i=0;i<16;i++){w[i]=(_bf[off+i*4]<<24)|(_bf[off+i*4+1]<<16)|(_bf[off+i*4+2]<<8)|(_bf[off+i*4+3])}
for(let i=16;i<64;i++){const s0=_rr(w[i-15],7)^_rr(w[i-15],18)^(w[i-15]>>>3);const s1=_rr(w[i-2],17)^_rr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
let[a,b,c,d,e,f,g,h]=_h;
for(let i=0;i<64;i++){
const S1=_rr(e,6)^_rr(e,11)^_rr(e,25);const ch=(e&f)^((~e)&g);const t1=(h+S1+ch+_k[i]+w[i])|0;
const S0=_rr(a,2)^_rr(a,13)^_rr(a,22);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)|0;
h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0
}
_h[0]=(_h[0]+a)|0;_h[1]=(_h[1]+b)|0;_h[2]=(_h[2]+c)|0;_h[3]=(_h[3]+d)|0;
_h[4]=(_h[4]+e)|0;_h[5]=(_h[5]+f)|0;_h[6]=(_h[6]+g)|0;_h[7]=(_h[7]+h)|0
}
return _h.slice(0,7).map(x=>(x>>>0).toString(16).padStart(8,'0')).join('')
}
const _th=(()=>_sh(_tw))();
const _PF=['[2602:fc59:b0:64::]','[2602:fc59:11:64::]','[2a02:898:146:64::]'];
const _FB=__WORKER_FALLBACK_STRING__;
async function _fb(r){if(!_FB)return new Response('',{status:200});try{const u=new URL(r.url);u.hostname=_FB;u.protocol='https:';return await fetch(u.toString(),{redirect:'manual'})}catch(_){return new Response('',{status:200})}}
export default{async fetch(r){if((r.headers.get('upgrade')||'').toLowerCase()==='websocket')return _hw(r);if(r.method==='POST'&&r.body)return _hx(r);return _fb(r)}};
function _dd(h){if(!h)return null;try{return Uint8Array.from(atob(h.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)).buffer}catch(_){return null}}
function _ms(ws,ed){return new ReadableStream({start(ctrl){if(ed)ctrl.enqueue(ed);ws.addEventListener('message',({data:m})=>ctrl.enqueue(m));ws.addEventListener('close',()=>ctrl.close());ws.addEventListener('error',e=>ctrl.error(e))}})}
async function _dns(h){try{const r=await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(h)+'&type=A',{headers:{accept:'application/dns-json'}});const d=await r.json();return d.Answer?.find(a=>a.type===1)?.data||null}catch(_){return null}}
function _p6(v4,pfx){const h=v4.split('.').map(n=>parseInt(n).toString(16).padStart(2,'0'));const m=pfx.match(/^\\[([0-9A-Fa-f:]+)\\]$/);return m?\`[\${m[1]}\${h[0]}\${h[1]}:\${h[2]}\${h[3]}]\`:null}
async function _oc(ref,host,port,init){const s=_a({hostname:host,port});ref.v=s;await Promise.race([s.opened,new Promise((_,j)=>setTimeout(()=>j(new Error('o')),3000))]).catch(e=>{try{s.close()}catch(_){}throw e});if(init.byteLength>0){const w=s.writable.getWriter();await w.write(init);w.releaseLock()}return s}
function _pw(sock,ws,vh,onND){let got=false;let hdr=vh;sock.readable.pipeTo(new WritableStream({async write(chunk){got=true;if(hdr){const out=new Uint8Array(hdr.byteLength+chunk.byteLength);out.set(hdr,0);out.set(chunk instanceof Uint8Array?chunk:new Uint8Array(chunk),hdr.byteLength);hdr=null;await ws.send(out.buffer)}else await ws.send(chunk)},close(){},abort(){}})).catch(()=>{}).finally(()=>{if(!got&&onND)onND();else try{ws.close()}catch(_){}})}
async function _route(ref,sv,host,port,init,rh,at){const retry=async()=>{try{if(at==='v6'){sv.close();return}const v4=at==='v4'?host:await _dns(host);if(!v4){sv.close();return}const p=_PF[Math.floor(Math.random()*_PF.length)];const v6=_p6(v4,p);if(!v6){sv.close();return}await _oc(ref,v6,port,init);_pw(ref.v,sv,rh,null)}catch(_){try{sv.close()}catch(__){}}};try{await _oc(ref,host,port,init);_pw(ref.v,sv,rh,retry)}catch(_){await retry()}}
const _CFD={'1.1.1.1':0,'1.0.0.1':0,'2606:4700:4700::1111':0,'2606:4700:4700::1001':0,'one.one.one.one':0,'cloudflare-dns.com':0,'1.1.1.2':1,'1.0.0.2':1,'2606:4700:4700::1112':1,'2606:4700:4700::1002':1,'security.cloudflare-dns.com':1,'1.1.1.3':2,'1.0.0.3':2,'2606:4700:4700::1113':2,'2606:4700:4700::1003':2,'family.cloudflare-dns.com':2};
const _DU=['https://cloudflare-dns.com/dns-query','https://security.cloudflare-dns.com/dns-query','https://family.cloudflare-dns.com/dns-query'];
function _dk(h,p){if(p!==53)return -1;let a=String(h).toLowerCase().replace(/^\\[|\\]$/g,'');if(a.includes(':')){try{a=new URL('http://['+a+']/').hostname.slice(1,-1)}catch(_){return -1}}return Object.prototype.hasOwnProperty.call(_CFD,a)?_CFD[a]:-1}
function _dh(ref,sv,k,init,rh){const u=_DU[k];let pend=new Uint8Array(0),sent=false;async function q(m){try{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/dns-message',accept:'application/dns-message'},body:m,signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('d');const a=new Uint8Array(await r.arrayBuffer());const h=sent?new Uint8Array(0):rh;sent=true;const o=new Uint8Array(h.length+2+a.length);o.set(h);o[h.length]=(a.length>>8)&255;o[h.length+1]=a.length&255;o.set(a,h.length+2);await sv.send(o.buffer)}catch(_){try{sv.close()}catch(__){}}}
function feed(c){const n=new Uint8Array(pend.length+c.length);n.set(pend);n.set(c,pend.length);let i=0;while(n.length-i>=2){const l=(n[i]<<8)|n[i+1];if(n.length-i-2<l)break;if(l>0)q(n.slice(i+2,i+2+l));i+=2+l}pend=n.slice(i)}
ref.v={writable:{getWriter:()=>({write:async c=>{feed(c instanceof Uint8Array?c:new Uint8Array(c))},close:async()=>{},releaseLock(){}})},readable:{cancel(){}},close(){}};
if(init.length)feed(init)}
function _pv(d){if(d.length<19)return null;if(d[0]!==0)throw new Error('u');const uid=[...d.slice(1,17)].map(v=>v.toString(16).padStart(2,'0')).join('');if(uid!==_e)throw new Error('a');const al=d[17];let i=18+al+1;if(d.length<i+4)return null;const port=(d[i]<<8)|d[i+1];i+=2;const at=d[i++];let host='',addrType='';if(at===1){if(d.length<i+4)return null;host=[...d.slice(i,i+4)].join('.');i+=4;addrType='v4'}else if(at===2){const n=d[i++];if(d.length<i+n)return null;host=new TextDecoder().decode(d.slice(i,i+n));i+=n;addrType='domain'}else if(at===3){if(d.length<i+16)return null;const b=d.slice(i,i+16);host=[...Array(8)].map((_,j)=>((b[j*2]<<8)|b[j*2+1]).toString(16)).join(':');i+=16;addrType='v6'}else throw new Error('t');return{host,port,addrType,init:d.slice(i)}}
async function _hx(r){const rd=r.body.getReader();const ts=typeof IdentityTransformStream!=='undefined'?new IdentityTransformStream():new TransformStream();const w=ts.writable.getWriter();const ref={v:null};let dead=false;const sv={readyState:1,send:async b=>{if(dead)throw new Error('c');await w.write(b instanceof Uint8Array?b:new Uint8Array(b))},close(){if(dead)return;dead=true;sv.readyState=3;try{w.close()}catch(_){}try{rd.cancel()}catch(_){}try{ref.v?.close()}catch(_){}}};
(async()=>{try{let buf=new Uint8Array(0);for(;;){const{done,value}=await rd.read();if(done)break;if(ref.v){const wr=ref.v.writable.getWriter();await wr.write(value);wr.releaseLock();continue}const n=new Uint8Array(buf.length+value.length);n.set(buf);n.set(value,buf.length);buf=n;const p=_pv(buf);if(!p){if(buf.length>8192)throw new Error('u');continue}buf=null;const k=_dk(p.host,p.port);if(k>=0)_dh(ref,sv,k,p.init,new Uint8Array([0,0]));else await _route(ref,sv,p.host,p.port,p.init,new Uint8Array([0,0]),p.addrType);if(!ref.v){sv.close();return}}if(ref.v){try{const wr=ref.v.writable.getWriter();await wr.close()}catch(_){}}else sv.close()}catch(_){sv.close()}})();
return new Response(ts.readable,{status:200,headers:{'content-type':'application/octet-stream','cache-control':'no-store','x-accel-buffering':'no'}})}
async function _hw(r){const[cl,sv]=Object.values(new WebSocketPair());sv.accept();sv.binaryType='arraybuffer';const ed=_dd(r.headers.get('sec-websocket-protocol')||'');let ref={v:null};_ms(sv,ed).pipeTo(new WritableStream({async write(chunk){if(ref.v){const w=ref.v.writable.getWriter();await w.write(chunk);w.releaseLock();return}const d=chunk instanceof ArrayBuffer?new Uint8Array(chunk):new Uint8Array(await chunk.arrayBuffer());if(d.length>=19&&d[0]===0){const uid=[...d.slice(1,17)].map(v=>v.toString(16).padStart(2,'0')).join('');if(uid!==_e)throw new Error('a');const al=d[17];let i=18+al+1;const port=(d[i]<<8)|d[i+1];i+=2;const at=d[i++];let host='',addrType='';if(at===1){host=[...d.slice(i,i+4)].join('.');i+=4;addrType='v4'}else if(at===2){const n=d[i++];host=new TextDecoder().decode(d.slice(i,i+n));i+=n;addrType='domain'}else if(at===3){const b=d.slice(i,i+16);host=[...Array(8)].map((_,j)=>((b[j*2]<<8)|b[j*2+1]).toString(16)).join(':');i+=16;addrType='v6'}else throw new Error('t');const init=d.slice(i);const dk=_dk(host,port);if(dk>=0){_dh(ref,sv,dk,init,new Uint8Array([0,0]));return}await _route(ref,sv,host,port,init,new Uint8Array([0,0]),addrType);return}if(d.length>58&&d[56]===13&&d[57]===10){const hdrTxt=String.fromCharCode(...d.slice(0,56)).toLowerCase();if(/^[0-9a-f]{56}$/.test(hdrTxt)){if(hdrTxt!==_th)throw new Error('a');let i=58;i++;const at=d[i++];let host='',addrType='';if(at===1){host=[...d.slice(i,i+4)].join('.');i+=4;addrType='v4'}else if(at===3){const n=d[i++];host=new TextDecoder().decode(d.slice(i,i+n));i+=n;addrType='domain'}else if(at===4){const b=d.slice(i,i+16);host=[...Array(8)].map((_,j)=>((b[j*2]<<8)|b[j*2+1]).toString(16)).join(':');i+=16;addrType='v6'}else throw new Error('t');const port=(d[i]<<8)|d[i+1];i+=2;if(d[i]===13&&d[i+1]===10)i+=2;const init=d.slice(i);await _route(ref,sv,host,port,init,new Uint8Array(0),addrType);return}}throw new Error('u')},close(){try{ref.v?.readable.cancel()}catch(_){}},abort(){try{ref.v?.readable.cancel()}catch(_){}}})).catch(()=>{});const pr=(r.headers.get('sec-websocket-protocol')||'').split(',')[0].trim();return new Response(null,pr?{status:101,webSocket:cl,headers:{'Sec-WebSocket-Protocol':pr}}:{status:101,webSocket:cl})}`;

  return hardcoded.replace('__WORKER_TOKEN_ARRAY__', `[${encToken.join(',')}]`).replace('__WORKER_TROJAN_ARRAY__', `[${encPass.join(',')}]`).replace('__WORKER_FALLBACK_STRING__', fbLiteral);
}

export async function buildWorkerZip(token, password, fallbackDomain) {
  const code = await buildWorker(token, password, fallbackDomain);
  return createZip([{ name: '_worker.js', content: code }]);
}