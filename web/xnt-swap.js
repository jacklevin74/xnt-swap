(function(){
const M=XntMath,K='xntSwapSim.v1',$=id=>document.getElementById(id);
let st=JSON.parse(localStorage.getItem(K)||'{"wallets":[],"cur":null}'),side='buy';
const save=()=>localStorage.setItem(K,JSON.stringify(st));
const W=()=>st.wallets.find(w=>w.addr===st.cur);
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const rnd=()=>Array.from(crypto.getRandomValues(new Uint8Array(44)),b=>B58[b%58]).join('');
const fmt=u=>(u/M.U).toLocaleString(undefined,{maximumFractionDigits:6});
const short=a=>a.slice(0,4)+'…'+a.slice(-4);
function newWallet(label){const w={addr:rnd(),label:label||'Sim wallet '+(st.wallets.length+1),usdc:100000*M.U,xnt:0,history:[]};
 st.wallets.push(w);st.cur=w.addr;save();toast('Airdropped 100,000 USDC to '+short(w.addr));render();}
window.vToast=window.vToast||function(type,title,msg){const c=document.getElementById('toastContainer');if(!c)return;const t=document.createElement('div');t.className='toast '+type;
 t.innerHTML='<span class="toast-icon">'+(type==='success'?'✓':type==='error'?'✕':'ⓘ')+'</span><div><div class="toast-title">'+title+'</div><div class="toast-message">'+msg+'</div></div>';
 c.appendChild(t);setTimeout(()=>{t.classList.add('hiding');setTimeout(()=>t.remove(),300);},type==='error'?6000:4000);};
function toast(m,err){const d=document.createElement('div');d.textContent=m;window.vToast(err?'error':'success',err?'Error':'Success',d.innerHTML);}
function render(){const w=W();
 $('wsel').innerHTML=st.wallets.map(x=>`<option value="${x.addr}"${x.addr===st.cur?' selected':''}>${x.label} (${short(x.addr)})</option>`).join('')||'<option>No wallet</option>';
 const pay=side==='buy'?'usdc':'xnt',get=side==='buy'?'xnt':'usdc';
 $('tokIn').textContent=pay.toUpperCase();$('tokOut').textContent=get.toUpperCase();
 $('balIn').textContent=w?fmt(w[pay]):'0';$('balOut').textContent=w?fmt(w[get]):'0';
 $('rate').textContent=side==='buy'?'1 USDC = 1 XNT':'1 XNT = 0.90 USDC';
 const a=M.toU($('amt').value),q=Number.isFinite(a)&&a>0?M.quote(side,a):null;
 $('out').value=q?M.fromU(q.out):'';
 $('fee').innerHTML=side==='buy'?'0%':`<span class="warn">10% sell haircut${q?' (−'+fmt(q.fee)+' USDC)':''}</span>`;
 const g=$('go');g.disabled=false;
 if(!w)g.textContent='Connect wallet';
 else if($('amt').value&&!Number.isFinite(a)){g.textContent='Invalid amount (max 6 decimals)';g.disabled=true}
 else if(!q){g.textContent='Enter an amount';g.disabled=true}
 else if(a>w[pay]){g.textContent='Insufficient '+pay.toUpperCase()+' balance';g.disabled=true}
 else g.textContent=side==='buy'?'Swap — Buy XNT':'Swap — Sell XNT';g.classList.toggle('sell',side!=='buy');
 $('addr').textContent=w?w.label+' · '+short(w.addr):'Not connected';
 $('pUsdc').textContent=w?fmt(w.usdc):'0';$('pXnt').textContent=w?fmt(w.xnt):'0';
 $('total').textContent=w?'$'+((w.usdc+w.xnt*0.9)/M.U).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' / $'+((w.usdc+w.xnt)/M.U).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'$0.00';
 $('hist').innerHTML=w?w.history.map(h=>`<tr><td>${new Date(h.t).toLocaleTimeString()}</td><td>${h.side==='buy'?'Buy':'Sell'}</td><td>${fmt(h.in)} ${h.side==='buy'?'USDC':'XNT'}</td><td>${fmt(h.out)} ${h.side==='buy'?'XNT':'USDC'}</td></tr>`).join(''):'';}
$('amt').oninput=render;
$('flip').onclick=()=>{side=side==='buy'?'sell':'buy';$('amt').value='';render()};
const part=f=>{const w=W();if(!w)return;const p=side==='buy'?'usdc':'xnt';$('amt').value=M.fromU(Math.floor(w[p]*f));render()};
$('max').onclick=()=>part(1);$('half').onclick=()=>part(.5);
$('newW').onclick=()=>newWallet();
$('wsel').onchange=e=>{st.cur=e.target.value;save();render()};
$('conn').onclick=async()=>{
 const p=window.x1||window.phantom?.solana; // only X1 or Phantom
 if(p&&confirm('Use your '+(window.x1?'X1':'Phantom')+' wallet address to name a sim wallet? (no funds or signatures used)')){
  try{const r=await p.connect();newWallet((window.x1?'X1 ':'Phantom ')+short(r.publicKey.toString()));return}catch(e){toast('Wallet connect cancelled',1)}}
 newWallet();};
$('go').onclick=()=>{const w=W();if(!w)return $('conn').click();
 try{const tx=M.swap(w,side,M.toU($('amt').value));save();$('amt').value='';
  toast(`✅ Swapped ${fmt(tx.in)} ${side==='buy'?'USDC → '+fmt(tx.out)+' XNT':'XNT → '+fmt(tx.out)+' USDC'}`);}catch(e){toast(e.message,1)}render();};
$('reset').onclick=()=>{const w=W();if(w&&confirm('Reset this wallet?')){w.usdc=100000*M.U;w.xnt=0;w.history=[];save();toast('Wallet reset — 100,000 USDC airdropped');render()}};
render();})();
