// On-chain mode for /xnt-swap: talks to the xnt_swap Anchor program on X1 TESTNET (test tokens only).
(function(){
const W=solanaWeb3,{PublicKey,Connection,Transaction,TransactionInstruction}=W,$=id=>document.getElementById(id);
async function walletSign(tx){// mobile wallets ship their own web3 and can choke on legacy Transaction objects; fall back to v0
 const ser=s=>s instanceof Uint8Array?s:(s&&s.serialize)?s.serialize():(s&&s.signedTransaction)?W.Buffer?W.Buffer.from(s.signedTransaction,'base64'):Uint8Array.from(atob(s.signedTransaction),c=>c.charCodeAt(0)):null;
 try{const r=ser(await prov.signTransaction(tx));if(r)return r;}catch(e){if(/reject|cancel|denied/i.test(e&&e.message||''))throw e;console.warn('legacy sign failed, trying v0',e);}
 const msg=new W.TransactionMessage({payerKey:tx.feePayer,recentBlockhash:tx.recentBlockhash,instructions:tx.instructions}).compileToV0Message();
 const r=ser(await prov.signTransaction(new W.VersionedTransaction(msg)));if(!r)throw new Error('wallet returned no signed transaction');return r;}
const RPC='https://rpc.testnet.x1.xyz',EXP='https://explorer.testnet.x1.xyz',CL='';
const PID=new PublicKey('CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB');
const TP=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),ATP=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const CONFIG=PublicKey.findProgramAddressSync([new TextEncoder().encode('config')],PID)[0];
const conn=new Connection(RPC,'confirmed');
let cfg=null,prov=null,user=null,side='buy';
const D={buy:[102,6,61,18,1,218,235,234],sell:[51,230,133,164,1,127,131,173]};
const u64=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(v),true);return b;};
const ata=(m,o)=>PublicKey.findProgramAddressSync([o.toBytes(),TP.toBytes(),m.toBytes()],ATP)[0];
const m=(pubkey,w=false,s=false)=>({pubkey,isWritable:w,isSigner:s});
const link=(k,v)=>`<a target=_blank href="${EXP}/${k}/${v}${CL}">${v.slice(0,4)}…${v.slice(-4)}</a>`;
function parse(d){let o=8;const pk=()=>{const p=new PublicKey(d.slice(o,o+32));o+=32;return p;};const dv=new DataView(d.buffer,d.byteOffset);
 const r=()=>{const v=dv.getBigUint64(o,true);o+=8;return v;};
 const c={admin:pk(),pending:pk(),xm:pk(),um:pk(),xv:pk(),uv:pk()};c.xd=d[o++];c.ud=d[o++];c.buy=[r(),r()];c.sell=[r(),r()];c.paused=!!d[o++];return c;}
// out = in * num * 10^outDec / (den * 10^inDec)
const quote=(a,r,od,id)=>a*r[0]*10n**BigInt(od)/(r[1]*10n**BigInt(id));
const toU=(s,d)=>{s=String(s||'').trim();if(!/^\d*\.?\d*$/.test(s)||!s||s==='.')return 0n;const [i,f='']=s.split('.');return BigInt(i||0)*10n**BigInt(d)+BigInt((f+'0'.repeat(d)).slice(0,d)||0);};
const fmt=(v,d)=>(Number(v)/10**d).toLocaleString(undefined,{maximumFractionDigits:6});
async function bal(a){try{return BigInt((await conn.getTokenAccountBalance(a)).value.amount);}catch{return 0n;}}
function toast(msg,err,title){window.vToast(err?'error':(title?'info':'success'),title||(err?'Error':'Success'),msg);}
async function refresh(){
 const ai=await conn.getAccountInfo(CONFIG);if(!ai){$('cRates').textContent='config not found';return;}cfg=parse(ai.data);
 const [xv,uv]=await Promise.all([bal(cfg.xv),bal(cfg.uv)]);
 $('cPx').textContent='$'+(Number(cfg.buy[1])/Number(cfg.buy[0])).toFixed(2);$('cRates').innerHTML=`Buy: 1 USDC.X → ${Number(cfg.buy[0])/Number(cfg.buy[1])} XNT · Sell: 1 XNT → ${Number(cfg.sell[0])/Number(cfg.sell[1])} USDC.X${cfg.paused?' · <b class=warn>PAUSED</b>':''}`;
 ['tX','tU','cRates'].forEach(i=>$(i).classList.remove('skel'));$('tX').textContent=fmt(xv,cfg.xd);$('tU').textContent=fmt(uv,cfg.ud);$('tLinks').innerHTML=link('address',cfg.xv.toBase58())+' · '+link('address',cfg.uv.toBase58());$('cVault').innerHTML=`Vault liquidity: ${fmt(xv,cfg.xd)} wXNT · ${fmt(uv,cfg.ud)} USDC.X`;
 $('cLinks').innerHTML=`Program ${link('address',PID.toBase58())} · Config ${link('address',CONFIG.toBase58())} · wXNT ${link('address',cfg.xm.toBase58())} · USDC.X ${link('address',cfg.um.toBase58())}`;
 if(user){const [x,u,g]=await Promise.all([bal(ata(cfg.xm,user)),bal(ata(cfg.um,user)),conn.getBalance(user)]);
  user._x=x;user._u=u;$('cX').textContent=fmt(x,cfg.xd);$('cU').textContent=fmt(u,cfg.ud);$('cG').textContent=(g/1e9).toFixed(4);$('navBal').textContent=(g/1e9).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  $('cAddr').innerHTML=link('address',user.toBase58());}
 calc();}
setInterval(()=>{if($('chainView').style.display!=='none')refresh().catch(()=>{});},15000);
function calc(){if(!cfg)return;const buy=side==='buy',a=toU($('cAmt').value,buy?cfg.ud:cfg.xd);
 const out=a?quote(a,buy?cfg.buy:cfg.sell,buy?cfg.xd:cfg.ud,buy?cfg.ud:cfg.xd):0n;
 $('cOut').value=out?fmt(out,buy?cfg.xd:cfg.ud):'';$('cIn').textContent=buy?'USDC.X':'wXNT';$('cOutT').textContent=buy?'wXNT':'USDC.X';
 const g=$('cGo'),ind=buy?cfg.ud:cfg.xd,outd=buy?cfg.xd:cfg.ud,bi=user?(buy?user._u:user._x):undefined,bo=user?(buy?user._x:user._u):undefined,inT=buy?'USDC.X':'wXNT',outT=buy?'wXNT':'USDC.X';
 $('cBalIn').textContent=bi!==undefined?fmt(bi,ind):'—';$('cBalOut').textContent=bo!==undefined?fmt(bo,outd):'—';$('cdIn').className='dot'+(buy?' u':'');$('cdOut').className='dot'+(buy?'':' u');
 $('cMin').textContent=out?fmt(out*995n/1000n,outd)+' '+outT:'—';
 $('cAfter').textContent=(user&&a>0n&&bi!==undefined)?`After swap: ${fmt(bi-a,ind)} ${inT} · ${fmt(bo+out,outd)} ${outT}`:'';
 if(!g._busy){let lbl,dis=false;if(!user)lbl='Connect wallet';else if(cfg.paused){lbl='Swaps paused';dis=true;}else if($('cAmt').value&&a<=0n){lbl='Invalid amount';dis=true;}else if(!a){lbl='Enter an amount';dis=true;}
  else if(bi!==undefined&&a>bi){lbl='Insufficient '+inT+' balance';dis=true;}else lbl=buy?'Swap — Buy wXNT':'Swap — Sell wXNT';g.textContent=lbl;g.disabled=dis;}g.classList.toggle('sell',!buy);$('cSideBuy').classList.toggle('on',buy);$('cSideSell').classList.toggle('on',!buy);return {a,out};}
// Wallet flow mirrors Vero: detect (X1 first, then Phantom), connect, cache address, silent auto-reconnect (onlyIfTrusted, not X1), accountChanged listener, disconnect clears cache.
const WKEY='xntSwapWallet';
function providers(){const x1=window.x1_wallet||window.x1Wallet||window.x1||null;const ph=(window.phantom&&window.phantom.solana)||(window.solana&&window.solana.isPhantom&&!window.solana.isBackpack?window.solana:null);return {x1,phantom:ph};}
function getProvider(t){const p=providers();return t?p[t]:(p.x1||p.phantom);}
function openModal(){const p=providers();$('wsX1').textContent=p.x1?'detected':'not detected';$('wsX1').className=p.x1?'ok':'';$('wsPh').textContent=p.phantom?'detected':'not detected';$('wsPh').className=p.phantom?'ok':'';$('walletModal').classList.remove('hidden');}
function closeModal(){$('walletModal').classList.add('hidden');}
function navState(){$('walletNavDisconnected').style.display=user?'none':'';$('walletNavConnected').style.display=user?'flex':'none';
 if(user){const a=user.toBase58();$('navAddr').textContent=a.slice(0,4)+'…'+a.slice(-4);}calc();}
function listen(p,t){if(!p||typeof p.on!=='function'||p._xntL)return;p._xntL=1;
 p.on('accountChanged',pk=>{if(!pk){disconnect();return;}if(!user)return;user=new PublicKey(pk.toString());localStorage.setItem(WKEY,JSON.stringify({t,a:user.toBase58()}));toast('Switched to '+user.toBase58().slice(0,6)+'…',0,'Account changed');navState();refresh();});
 p.on('disconnect',()=>{if(user)disconnect(true);});}
async function connect(t,silent){if(!t&&!silent){openModal();return;}
 const p=getProvider(t);if(!p){toast((t==='phantom'?'Phantom':'X1 Wallet')+' not found. Install it or open this page in its in-app browser.',1,'Wallet not found');return;}
 closeModal();const b=$('cConn');b.disabled=true;b.innerHTML='<span class="spin"></span>Connecting…';
 try{const r=await p.connect(silent?{onlyIfTrusted:true}:undefined);prov=p;user=new PublicKey((r&&r.publicKey||p.publicKey).toString());
  localStorage.setItem(WKEY,JSON.stringify({t,a:user.toBase58()}));listen(p,t);navState();if(!silent)toast(user.toBase58().slice(0,6)+'… on X1 testnet',0,'Wallet connected');refresh();}
 catch(e){localStorage.removeItem(WKEY);if(!silent)toast(e.message||String(e),1,'Connect failed');}
 finally{b.disabled=false;b.textContent='Connect Wallet';}}
function disconnect(quiet){try{prov&&prov.disconnect&&prov.disconnect();}catch{}prov=null;user=null;localStorage.removeItem(WKEY);
 ['cU','cX','cG'].forEach(i=>$(i).textContent='0');$('navBal').textContent='0.00';$('cAddr').textContent='not connected';navState();if(quiet!==true)toast('Wallet disconnected',0,'Disconnected');}
async function autoReconnect(){let c;try{c=JSON.parse(localStorage.getItem(WKEY)||'null');}catch{}if(!c||!c.t)return;
 if(c.t==='x1'){return;} // like Vero: X1 Wallet has no onlyIfTrusted, so no silent reconnect
 setTimeout(()=>connect(c.t,true),300);}
async function sendTx(ixs){const tx=new Transaction().add(...ixs);tx.feePayer=user;const bh=await conn.getLatestBlockhash();tx.recentBlockhash=bh.blockhash;
 const signed=await walletSign(tx);const sig=await conn.sendRawTransaction(signed);
 await conn.confirmTransaction({signature:sig,...bh},'confirmed');return sig;}
async function swap(){if(!user)return connect();const q=calc();if(!q.a)return toast('Enter an amount',1);const g=$('cGo');g._busy=1;g.disabled=true;g.classList.add('loading');g.innerHTML='<span class="spin"></span>Confirm in wallet…';
 try{const buy=side==='buy',min=q.out*995n/1000n; // 0.5% slippage guard
  const ux=ata(cfg.xm,user),uu=ata(cfg.um,user),ixs=[];
  for(const [a,mint] of [[ux,cfg.xm],[uu,cfg.um]]) if(!(await conn.getAccountInfo(a)))
   ixs.push(new TransactionInstruction({programId:ATP,keys:[m(user,1,1),m(a,1),m(user),m(mint),m(W.SystemProgram.programId),m(TP)],data:new Uint8Array([1])}));
  const keys=[m(user,0,1),m(CONFIG),m(cfg.xm),m(cfg.um),m(cfg.xv,1),m(cfg.uv,1),m(ux,1),m(uu,1),m(TP),m(TP)];
  const data=new Uint8Array([...D[side],...u64(q.a),...u64(min)]);
  ixs.push(new TransactionInstruction({programId:PID,keys,data}));
  g.innerHTML='<span class="spin"></span>Sending to testnet…';const sig=await sendTx(ixs);toast(`${buy?'Bought':'Sold'} ✓ <a target=_blank href="${EXP}/tx/${sig}${CL}">view tx</a>`);
  hist(buy?'Buy':'Sell',sig);refresh();}catch(e){toast(e.message||String(e),1,'Swap failed');}finally{g._busy=0;g.disabled=false;g.classList.remove('loading');calc();}}
function hist(s,sig){addRow(s,sig,user);}
async function txAmt(sig,owner){try{let t=null;for(let i=0;i<5&&!t;i++){t=await conn.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(!t)await new Promise(r=>setTimeout(r,1200));}
 if(!t||!t.meta)return '—';const o=owner.toBase58(),d={},sym=mn=>cfg&&mn===cfg.xm.toBase58()?'wXNT':cfg&&mn===cfg.um.toBase58()?'USDC.X':mn.slice(0,4)+'…';
 for(const b of t.meta.preTokenBalances||[])if(b.owner===o)d[b.mint]=(d[b.mint]||0)-(+b.uiTokenAmount.uiAmountString);
 for(const b of t.meta.postTokenBalances||[])if(b.owner===o)d[b.mint]=(d[b.mint]||0)+(+b.uiTokenAmount.uiAmountString);
 const f=v=>Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:4});const out=[],inn=[];
 for(const[mn,v]of Object.entries(d)){if(Math.abs(v)<1e-9)continue;(v<0?out:inn).push(f(v)+' '+sym(mn));}
 return out.length&&inn.length?out.join(', ')+' → '+inn.join(', '):inn.length?'+'+inn.join(', '):out.length?'−'+out.join(', '):'—';}catch{return '—';}}
function addRow(label,sig,owner){const em=$('cHist').querySelector('.empty');if(em)em.remove();const tr=document.createElement('tr');tr.innerHTML=`<td>${new Date().toLocaleTimeString()}</td><td>${label}</td><td class="amt">…</td><td>${link('tx',sig)}</td>`;$('cHist').prepend(tr);txAmt(sig,owner).then(a=>{tr.querySelector('.amt').textContent=a;});}

async function faucet(){if(!user)return connect();$('cFaucet').disabled=true;$('cFaucet').innerHTML='<span class="spin"></span>Minting…';
 try{const r=await fetch('/api/xnt-faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:user.toBase58()})});const j=await r.json();
  if(!r.ok)throw new Error(j.error);toast(`100,000 test USDC.X minted${j.gasXnt?' + 0.05 test XNT gas':''} ✓ <a target=_blank href="${EXP}/tx/${j.signature}${CL}">view tx</a>`);hist('Faucet',j.signature);refresh();}
 catch(e){toast(e.message,1,'Faucet');}finally{$('cFaucet').disabled=false;$('cFaucet').textContent='Faucet: 100k USDC.X';}}
function setMode(chain){$('simView').style.display=chain?'none':'';$('chainView').style.display=chain?'':'none';
 $('simNav').style.display=chain?'none':'';$('chainNav').style.display=chain?'':'none';$('mSim').className=chain?'':'on';$('mChain').className=chain?'on':'';
 document.querySelector('.banner').textContent=chain?'⚠ X1 TESTNET — real transactions with test tokens (no value).':'⚠ Simulation — no real funds. Balances live only in this browser.';
 if(chain)refresh();localStorage.setItem('xntSwapMode',chain?'chain':'sim');}
$('mSim').onclick=()=>setMode(false);$('mChain').onclick=()=>setMode(true);
$('cConn').onclick=()=>connect();$('cDisc').onclick=()=>disconnect();$('wmClose').onclick=closeModal;$('walletModal').onclick=e=>{if(e.target.id==='walletModal')closeModal();};
document.querySelectorAll('.wopt').forEach(b=>b.onclick=()=>connect(b.dataset.w));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
$('cSideBuy').onclick=()=>{side='buy';$('cAmt').value='';calc();};$('cSideSell').onclick=()=>{side='sell';$('cAmt').value='';calc();};$('cGo').onclick=swap;$('cFaucet').onclick=faucet;$('cAmt').oninput=calc;
$('cFlip').onclick=()=>{side=side==='buy'?'sell':'buy';$('cAmt').value='';calc();};
$('cHalf').onclick=()=>{if(user&&cfg){const v=side==='buy'?user._u:user._x,d=side==='buy'?cfg.ud:cfg.xd;$('cAmt').value=(Number(v/2n)/10**d).toString();calc();}};
$('cMax').onclick=()=>{if(user&&cfg){const v=side==='buy'?user._u:user._x,d=side==='buy'?cfg.ud:cfg.xd;$('cAmt').value=(Number(v)/10**d).toString();calc();}};
navState();autoReconnect();setMode(localStorage.getItem('xntSwapMode')==='chain'||location.hash==='#testnet');setInterval(()=>{if($('chainView').style.display!=='none')refresh();},15000);
})();
