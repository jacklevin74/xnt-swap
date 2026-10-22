// On-chain mode for /xnt-swap: talks to the xnt_swap Anchor program on X1 TESTNET (test tokens only).
(function(){
const W=solanaWeb3,{PublicKey,Connection,Transaction,TransactionInstruction}=W,$=id=>document.getElementById(id);
const RPC='https://rpc.testnet.x1.xyz',EXP='https://explorer.x1.xyz',CL='?cluster=testnet';
const PID=new PublicKey('CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB');
const TP=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),ATP=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWZRZnzLuaX5PNWEW');
const CONFIG=PublicKey.findProgramAddressSync([new TextEncoder().encode('config')],PID)[0];
const conn=new Connection(RPC,'confirmed');
let cfg=null,prov=null,user=null,side='buy';
const D={buy:[102,6,61,18,1,218,235,234],sell:[51,230,133,164,1,127,131,173]};
const u64=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(v),true);return b;};
const ata=(m,o)=>PublicKey.findProgramAddressSync([o.toBytes(),TP.toBytes(),m.toBytes()],ATP)[0];
const m=(pubkey,w=false,s=false)=>({pubkey,isWritable:w,isSigner:s});
const link=(k,v)=>`<a target=_blank style="color:#c7f284" href="${EXP}/${k}/${v}${CL}">${v.slice(0,4)}…${v.slice(-4)}</a>`;
function parse(d){let o=8;const pk=()=>{const p=new PublicKey(d.slice(o,o+32));o+=32;return p;};const dv=new DataView(d.buffer,d.byteOffset);
 const r=()=>{const v=dv.getBigUint64(o,true);o+=8;return v;};
 const c={admin:pk(),pending:pk(),xm:pk(),um:pk(),xv:pk(),uv:pk()};c.xd=d[o++];c.ud=d[o++];c.buy=[r(),r()];c.sell=[r(),r()];c.paused=!!d[o++];return c;}
// out = in * num * 10^outDec / (den * 10^inDec)
const quote=(a,r,od,id)=>a*r[0]*10n**BigInt(od)/(r[1]*10n**BigInt(id));
const toU=(s,d)=>{s=String(s||'').trim();if(!/^\d*\.?\d*$/.test(s)||!s||s==='.')return 0n;const [i,f='']=s.split('.');return BigInt(i||0)*10n**BigInt(d)+BigInt((f+'0'.repeat(d)).slice(0,d)||0);};
const fmt=(v,d)=>(Number(v)/10**d).toLocaleString(undefined,{maximumFractionDigits:6});
async function bal(a){try{return BigInt((await conn.getTokenAccountBalance(a)).value.amount);}catch{return 0n;}}
function toast(msg,err){const t=$('toast');t.innerHTML=msg;t.className=err?'err':'';t.style.display='block';clearTimeout(t._);t._=setTimeout(()=>t.style.display='none',7000);}
async function refresh(){
 const ai=await conn.getAccountInfo(CONFIG);if(!ai){$('cRates').textContent='config not found';return;}cfg=parse(ai.data);
 const [xv,uv]=await Promise.all([bal(cfg.xv),bal(cfg.uv)]);
 $('cRates').innerHTML=`Buy: 1 USDC.X → ${Number(cfg.buy[0])/Number(cfg.buy[1])} XNT · Sell: 1 XNT → ${Number(cfg.sell[0])/Number(cfg.sell[1])} USDC.X${cfg.paused?' · <b class=warn>PAUSED</b>':''}`;
 $('cVault').innerHTML=`Vault liquidity: ${fmt(xv,cfg.xd)} wXNT · ${fmt(uv,cfg.ud)} USDC.X`;
 $('cLinks').innerHTML=`Program ${link('address',PID.toBase58())} · Config ${link('address',CONFIG.toBase58())} · wXNT ${link('address',cfg.xm.toBase58())} · USDC.X ${link('address',cfg.um.toBase58())}`;
 if(user){const [x,u,g]=await Promise.all([bal(ata(cfg.xm,user)),bal(ata(cfg.um,user)),conn.getBalance(user)]);
  user._x=x;user._u=u;$('cX').textContent=fmt(x,cfg.xd);$('cU').textContent=fmt(u,cfg.ud);$('cG').textContent=(g/1e9).toFixed(4);
  $('cAddr').innerHTML=link('address',user.toBase58());}
 calc();}
function calc(){if(!cfg)return;const buy=side==='buy',a=toU($('cAmt').value,buy?cfg.ud:cfg.xd);
 const out=a?quote(a,buy?cfg.buy:cfg.sell,buy?cfg.xd:cfg.ud,buy?cfg.ud:cfg.xd):0n;
 $('cOut').value=out?fmt(out,buy?cfg.xd:cfg.ud):'';$('cIn').textContent=buy?'USDC.X':'wXNT';$('cOutT').textContent=buy?'wXNT':'USDC.X';
 $('cGo').textContent=!user?'Connect wallet':(buy?'Buy wXNT':'Sell wXNT');return {a,out};}
function getProvider(){return window.x1||window.x1_wallet||(window.phantom&&window.phantom.solana)||(window.solana&&!window.solana.isBackpack?window.solana:null);}
async function connect(){prov=getProvider();if(!prov){toast('Install Phantom or X1 wallet',1);return;}
 const r=await prov.connect();user=new PublicKey((r&&r.publicKey||prov.publicKey).toString());refresh();}
async function sendTx(ixs){const tx=new Transaction().add(...ixs);tx.feePayer=user;const bh=await conn.getLatestBlockhash();tx.recentBlockhash=bh.blockhash;
 const signed=await prov.signTransaction(tx);const sig=await conn.sendRawTransaction(signed.serialize());
 await conn.confirmTransaction({signature:sig,...bh},'confirmed');return sig;}
async function swap(){if(!user)return connect();const q=calc();if(!q.a)return toast('Enter an amount',1);
 try{const buy=side==='buy',min=q.out*995n/1000n; // 0.5% slippage guard
  const ux=ata(cfg.xm,user),uu=ata(cfg.um,user),ixs=[];
  for(const [a,mint] of [[ux,cfg.xm],[uu,cfg.um]]) if(!(await conn.getAccountInfo(a)))
   ixs.push(new TransactionInstruction({programId:ATP,keys:[m(user,1,1),m(a,1),m(user),m(mint),m(W.SystemProgram.programId),m(TP)],data:new Uint8Array([1])}));
  const keys=[m(user,0,1),m(CONFIG),m(cfg.xm),m(cfg.um),m(cfg.xv,1),m(cfg.uv,1),m(ux,1),m(uu,1),m(TP),m(TP)];
  const data=new Uint8Array([...D[side],...u64(q.a),...u64(min)]);
  ixs.push(new TransactionInstruction({programId:PID,keys,data}));
  const sig=await sendTx(ixs);toast(`${buy?'Bought':'Sold'} ✓ <a target=_blank style="color:#c7f284" href="${EXP}/tx/${sig}${CL}">view tx</a>`);
  hist(buy?'Buy':'Sell',sig);refresh();}catch(e){toast('Swap failed: '+(e.message||e),1);}}
function hist(s,sig){const tr=document.createElement('tr');tr.innerHTML=`<td>${new Date().toLocaleTimeString()}</td><td>${s}</td><td>${link('tx',sig)}</td>`;$('cHist').prepend(tr);}
async function faucet(){if(!user)return connect();$('cFaucet').disabled=true;
 try{const r=await fetch('/api/xnt-faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:user.toBase58()})});const j=await r.json();
  if(!r.ok)throw new Error(j.error);toast(`100,000 test USDC.X minted${j.gasXnt?' + 0.05 test XNT gas':''} ✓ <a target=_blank style="color:#c7f284" href="${EXP}/tx/${j.signature}${CL}">view tx</a>`);hist('Faucet',j.signature);refresh();}
 catch(e){toast('Faucet: '+e.message,1);}finally{$('cFaucet').disabled=false;}}
function setMode(chain){$('simView').style.display=chain?'none':'';$('chainView').style.display=chain?'':'none';
 $('mSim').className=chain?'':'on';$('mChain').className=chain?'on':'';
 document.querySelector('.banner').textContent=chain?'⚠ X1 TESTNET — real transactions with test tokens (no value).':'⚠ Simulation — no real funds. Balances live only in this browser.';
 if(chain)refresh();localStorage.setItem('xntSwapMode',chain?'chain':'sim');}
$('mSim').onclick=()=>setMode(false);$('mChain').onclick=()=>setMode(true);
$('cConn').onclick=connect;$('cGo').onclick=swap;$('cFaucet').onclick=faucet;$('cAmt').oninput=calc;
$('cFlip').onclick=()=>{side=side==='buy'?'sell':'buy';$('cAmt').value='';calc();};
$('cMax').onclick=()=>{if(user&&cfg){const v=side==='buy'?user._u:user._x,d=side==='buy'?cfg.ud:cfg.xd;$('cAmt').value=(Number(v)/10**d).toString();calc();}};
setMode(localStorage.getItem('xntSwapMode')==='chain'||location.hash==='#testnet');setInterval(()=>{if($('chainView').style.display!=='none')refresh();},15000);
})();
