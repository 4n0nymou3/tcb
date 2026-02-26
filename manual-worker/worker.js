import{connect as _a}from'cloudflare:sockets';
const _b=75;
const _c=a=>a.map(v=>String.fromCharCode(v^_b)).join('');
const _d=__WORKER_TOKEN_ARRAY__;
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
}