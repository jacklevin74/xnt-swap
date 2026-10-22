// Admin page for the xnt_swap program on X1 TESTNET. Every tx is signed by the connected wallet and sent via the testnet RPC.
(function(){
const W=solanaWeb3,{PublicKey,Connection,Transaction,TransactionInstruction}=W,$=id=>document.getElementById(id);
async function walletSign(tx){// mobile wallets ship their own web3 and can choke on legacy Transaction objects; fall back to v0
 const ser=s=>s instanceof Uint8Array?s:(s&&s.serialize)?s.serialize():(s&&s.signedTransaction)?W.Buffer?W.Buffer.from(s.signedTransaction,'base64'):Uint8Array.from(atob(s.signedTransaction),c=>c.charCodeAt(0)):null;
 try{const r=ser(await prov.signTransaction(tx));if(r)return r;}catch(e){if(/reject|cancel|denied/i.test(e&&e.message||''))throw e;console.warn('legacy sign failed, trying v0',e);}
 const msg=new W.TransactionMessage({payerKey:tx.feePayer,recentBlockhash:tx.recentBlockhash,instructions:tx.instructions}).compileToV0Message();
 const r=ser(await prov.signTransaction(new W.VersionedTransaction(msg)));if(!r)throw new Error('wallet returned no signed transaction');return r;}
const RPC='https://rpc.testnet.x1.xyz',EXP='https://explorer.testnet.x1.xyz',CL='';
const PID=new PublicKey('CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB'),CONFIG=new PublicKey('8jRNefKTWJWZMUkyXyQJcp78Q2WeaRWi3sKdnVa54Zga');
const TP=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),ATP=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const D={set_rates:[53,124,188,253,56,211,29,2],set_paused:[91,60,125,192,176,225,166,218],deposit:[242,35,198,137,82,225,242,182],withdraw:[183,18,70,156,148,109,161,34],accept_admin:[112,42,45,90,116,181,13,170]};
const conn=new Connection(RPC,'confirmed');let cfg=null,prov=null,user=null;
const u64=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(v),true);return b;};
const ata=(m,o)=>PublicKey.findProgramAddressSync([o.toBytes(),TP.toBytes(),m.toBytes()],ATP)[0];
const m=(pubkey,w=false,s=false)=>({pubkey,isWritable:w,isSigner:s});
const short=v=>v.slice(0,4)+'…'+v.slice(-4),link=(k,v)=>`<a target=_blank href="${EXP}/${k}/${v}${CL}">${short(v)}</a>`;
const ix=(n,keys,...a)=>new TransactionInstruction({programId:PID,keys,data:new Uint8Array([...D[n],...a.flatMap(x=>[...x])])});
function parse(d){let o=8;const pk=()=>{const p=new PublicKey(d.slice(o,o+32));o+=32;return p;};const dv=new DataView(d.buffer,d.byteOffset);const r=()=>{const v=dv.getBigUint64(o,true);o+=8;return v;};
 const c={admin:pk(),pending:pk(),xm:pk(),um:pk(),xv:pk(),uv:pk()};c.xd=d[o++];c.ud=d[o++];c.buy=[r(),r()];c.sell=[r(),r()];c.paused=!!d[o++];return c;}
const toU=(s,d)=>{s=String(s||'').trim();if(!/^\d*\.?\d*$/.test(s)||!s||s==='.')return 0n;const [i,f='']=s.split('.');if(f.length>d)return -1n;return BigInt(i||0)*10n**BigInt(d)+BigInt((f+'0'.repeat(d)).slice(0,d)||0);};
const fmt=(v,d)=>(Number(v)/10**d).toLocaleString(undefined,{maximumFractionDigits:6});
const gcd=(a,b)=>b?gcd(b,a%b):a;
function dec2frac(s){s=String(s).trim();if(!/^\d*\.?\d+$/.test(s)&&!/^\d+\.?$/.test(s))return null;const [i,f='']=s.replace(/\.$/,'').split('.');if(f.length>9)return null;let n=BigInt(i||0)*10n**BigInt(f.length)+BigInt(f||0),d=10n**BigInt(f.length);if(n===0n)return null;const g=gcd(n,d);return [n/g,d/g];}
const ratio=r=>Number(r[0])/Number(r[1]);
function toast(msg,err,title){const c=$('toastContainer'),t=document.createElement('div');t.className='toast '+(err?'error':title?'info':'success');
 t.innerHTML=`<span class="toast-icon">${err?'✕':title?'ⓘ':'✓'}</span><div><div class="toast-title">${title||(err?'Error':'Success')}</div><div class="toast-message">${msg}</div></div>`;c.appendChild(t);setTimeout(()=>{t.classList.add('hiding');setTimeout(()=>t.remove(),300);},err?7000:4500);}
async function bal(a){try{return BigInt((await conn.getTokenAccountBalance(a)).value.amount);}catch{return 0n;}}
let ratesTouched=false,canMint=false;
async function refresh(){const ai=await conn.getAccountInfo(CONFIG);if(!ai)return;cfg=parse(ai.data);
 const [xv,uv]=await Promise.all([bal(cfg.xv),bal(cfg.uv)]);
 $('aBuy').textContent=`${ratio(cfg.buy)} (${cfg.buy[0]}/${cfg.buy[1]})`;$('aSell').textContent=`${ratio(cfg.sell)} (${cfg.sell[0]}/${cfg.sell[1]})`;
 $('aPaused').textContent=cfg.paused?'PAUSED':'LIVE';$('aPaused').className='pill '+(cfg.paused?'on':'off');
 $('aAdmin').innerHTML=link('address',cfg.admin.toBase58());const pend=cfg.pending.equals(PublicKey.default)?null:cfg.pending;$('aPending').innerHTML=pend?link('address',pend.toBase58()):'none';
 $('tX').textContent=fmt(xv,cfg.xd);$('tU').textContent=fmt(uv,cfg.ud);$('tLinks').innerHTML=link('address',cfg.xv.toBase58())+' · '+link('address',cfg.uv.toBase58());
 $('aLinks').innerHTML=`program ${link('address',PID.toBase58())} · config ${link('address',CONFIG.toBase58())}`;
 $('cLinks').innerHTML=`wXNT mint ${link('address',cfg.xm.toBase58())} · USDC.X mint ${link('address',cfg.um.toBase58())}`;
 if(!ratesTouched){$('rBuyD').value=ratio(cfg.buy);$('rSellD').value=ratio(cfg.sell);$('rBn').value=cfg.buy[0];$('rBd').value=cfg.buy[1];$('rSn').value=cfg.sell[0];$('rSd').value=cfg.sell[1];}
 if(user){const [x,u,g]=await Promise.all([bal(ata(cfg.xm,user)),bal(ata(cfg.um,user)),conn.getBalance(user)]);$('aMine').textContent=`${fmt(x,cfg.xd)} / ${fmt(u,cfg.ud)}`;$('wMine').textContent=fmt(x,cfg.xd)+' wXNT';
  const mi=await conn.getAccountInfo(cfg.xm);const auth=mi&&new DataView(mi.data.buffer,mi.data.byteOffset).getUint32(0,true)===1?new PublicKey(mi.data.slice(4,36)):null;canMint=!!(auth&&auth.equals(user));$('aMintDep').style.display=canMint?'':'none';$('wNote').textContent=canMint?'Your wallet holds the test wXNT mint authority, so you can also mint new test wXNT straight into the treasury.':'Adds test wXNT from your wallet to the treasury vault.';
  $('navBal').textContent=(g/1e9).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
 const isAdmin=user&&cfg.admin.equals(user),isPend=user&&pend&&pend.equals(user);
 $('aMain').classList.toggle('locked',!isAdmin);$('acceptBox').style.display=isPend?'':'none';
 const s=$('aState');if(!user){s.className='state info';s.textContent='Connect the admin wallet to manage the program.';}
 else if(isAdmin){s.className='state ok';s.textContent='✓ Admin wallet connected. All controls enabled.';}
 else if(isPend){s.className='state info';s.textContent='This wallet is the pending admin. Click "Accept admin" to take control.';}
 else{s.className='state bad';s.textContent=`✕ Not admin. ${short(user.toBase58())} can't change this program; controls are read-only. Admin is ${short(cfg.admin.toBase58())}.`;}}
setInterval(()=>refresh().catch(()=>{}),15000);
// Rates: decimal ⇄ num/den
$('rBuyD').oninput=()=>{ratesTouched=true;const f=dec2frac($('rBuyD').value);if(f){$('rBn').value=f[0];$('rBd').value=f[1];}};
$('rSellD').oninput=()=>{ratesTouched=true;const f=dec2frac($('rSellD').value);if(f){$('rSn').value=f[0];$('rSd').value=f[1];}};
['rBn','rBd'].forEach(i=>$(i).oninput=()=>{ratesTouched=true;const n=+$('rBn').value,d=+$('rBd').value;if(n&&d)$('rBuyD').value=n/d;});
['rSn','rSd'].forEach(i=>$(i).oninput=()=>{ratesTouched=true;const n=+$('rSn').value,d=+$('rSd').value;if(n&&d)$('rSellD').value=n/d;});
// Wallet flow (same as /xnt-swap, mirrors Vero): X1 first then Phantom, modal, cached address, silent reconnect (not X1), accountChanged.
const WKEY='xntSwapWallet';
function providers(){const x1=window.x1_wallet||window.x1Wallet||window.x1||null;const ph=(window.phantom&&window.phantom.solana)||(window.solana&&window.solana.isPhantom&&!window.solana.isBackpack?window.solana:null);return {x1,phantom:ph};}
function openModal(){const p=providers();$('wsX1').textContent=p.x1?'detected':'not detected';$('wsX1').className=p.x1?'ok':'';$('wsPh').textContent=p.phantom?'detected':'not detected';$('wsPh').className=p.phantom?'ok':'';$('walletModal').classList.remove('hidden');}
function closeModal(){$('walletModal').classList.add('hidden');}
function navState(){$('walletNavDisconnected').style.display=user?'none':'';$('walletNavConnected').style.display=user?'flex':'none';if(user)$('navAddr').textContent=short(user.toBase58());}
function listen(p,t){if(!p||typeof p.on!=='function'||p._xntL)return;p._xntL=1;
 p.on('accountChanged',pk=>{if(!pk){disconnect();return;}if(!user)return;user=new PublicKey(pk.toString());localStorage.setItem(WKEY,JSON.stringify({t,a:user.toBase58()}));toast('Switched to '+short(user.toBase58()),0,'Account changed');navState();refresh();});
 p.on('disconnect',()=>{if(user)disconnect(true);});}
async function connect(t,silent){if(!t&&!silent){openModal();return;}const p=providers()[t];
 if(!p){toast((t==='phantom'?'Phantom':'X1 Wallet')+' not found. Install it or open this page in its in-app browser.',1,'Wallet not found');return;}
 closeModal();const b=$('cConn');b.disabled=true;b.innerHTML='<span class="spin"></span>Connecting…';
 try{const r=await p.connect(silent?{onlyIfTrusted:true}:undefined);prov=p;user=new PublicKey((r&&r.publicKey||p.publicKey).toString());localStorage.setItem(WKEY,JSON.stringify({t,a:user.toBase58()}));listen(p,t);navState();if(!silent)toast(short(user.toBase58())+' on X1 testnet',0,'Wallet connected');refresh();}
 catch(e){localStorage.removeItem(WKEY);if(!silent)toast(e.message||String(e),1,'Connect failed');}finally{b.disabled=false;b.textContent='Connect Wallet';}}
function disconnect(quiet){try{prov&&prov.disconnect&&prov.disconnect();}catch{}prov=null;user=null;localStorage.removeItem(WKEY);$('aMine').textContent='—';navState();refresh();if(quiet!==true)toast('Wallet disconnected',0,'Disconnected');}
function autoReconnect(){let c;try{c=JSON.parse(localStorage.getItem(WKEY)||'null');}catch{}if(c&&c.t&&c.t!=='x1')setTimeout(()=>connect(c.t,true),300);}
// Sending: wallet signs, page sends to testnet RPC.
async function run(btn,label,build){if(!user)return connect();if(!cfg)return;const old=btn.textContent;btn.disabled=true;btn.innerHTML='<span class="spin"></span>Confirm in wallet…';
 try{const ixs=await build();if(!ixs)return;const tx=new Transaction().add(...ixs);tx.feePayer=user;const bh=await conn.getLatestBlockhash();tx.recentBlockhash=bh.blockhash;
  const signed=await walletSign(tx);btn.innerHTML='<span class="spin"></span>Sending to testnet…';const sig=await conn.sendRawTransaction(signed);
  await conn.confirmTransaction({signature:sig,...bh},'confirmed');toast(`${label} ✓ <a target=_blank href="${EXP}/tx/${sig}${CL}">view tx</a>`,0);
  addRow(label,sig,user);ratesTouched=false;await refresh();}
 catch(e){const l=e.logs||(e.getLogs&&await e.getLogs(conn).catch(()=>null));toast((e.message||String(e))+(l?'<br>'+l.slice(-2).join('<br>'):''),1,label+' failed');}
 finally{btn.disabled=false;btn.textContent=old;}}
const tokSel=()=>$('lTok').value==='x'?[cfg.xm,cfg.xd,'wXNT']:[cfg.um,cfg.ud,'USDC.X'];
const amt=d=>{const a=toU($('lAmt').value,d);if(a<=0n){toast(a<0n?'Too many decimals':'Enter an amount',1);return null;}return a;};
$('aRates').onclick=()=>run($('aRates'),'Set rates',()=>{const v=['rBn','rBd','rSn','rSd'].map(i=>{try{return BigInt($(i).value.trim());}catch{return 0n;}});
 if(v.some(x=>x<=0n||x>18446744073709551615n)){toast('Rates need positive whole num/den',1);return null;}
 return [ix('set_rates',[m(user,0,1),m(CONFIG,1)],u64(v[0]),u64(v[1]),u64(v[2]),u64(v[3]))];});
$('aPause').onclick=()=>run($('aPause'),'Pause',()=>[ix('set_paused',[m(user,0,1),m(CONFIG,1)],[1])]);
$('aUnpause').onclick=()=>run($('aUnpause'),'Unpause',()=>[ix('set_paused',[m(user,0,1),m(CONFIG,1)],[0])]);
$('aDep').onclick=()=>run($('aDep'),'Deposit',async()=>{const [mint,d,n]=tokSel(),a=amt(d);if(!a)return null;const from=ata(mint,user);
 if(await bal(from)<a){toast('Not enough '+n+' in your wallet',1);return null;}
 return [ix('deposit',[m(user,0,1),m(CONFIG),m(mint),m(ata(mint,CONFIG),1),m(from,1),m(TP)],u64(a))];});
$('aWd').onclick=()=>run($('aWd'),'Withdraw',async()=>{const [mint,d]=tokSel(),a=amt(d);if(!a)return null;const to=ata(mint,user),ixs=[];
 if(!(await conn.getAccountInfo(to)))ixs.push(new TransactionInstruction({programId:ATP,keys:[m(user,1,1),m(to,1),m(user),m(mint),m(W.SystemProgram.programId),m(TP)],data:new Uint8Array([1])}));
 ixs.push(ix('withdraw',[m(user,0,1),m(CONFIG),m(mint),m(ata(mint,CONFIG),1),m(to,1),m(TP)],u64(a)));return ixs;});
const wAmt=()=>{const a=toU($('wAmt').value,cfg.xd);if(a<=0n){toast(a<0n?'Too many decimals':'Enter an amount',1);return null;}return a;};
const depIx=a=>ix('deposit',[m(user,0,1),m(CONFIG),m(cfg.xm),m(ata(cfg.xm,CONFIG),1),m(ata(cfg.xm,user),1),m(TP)],u64(a));
$('aWrap').onclick=()=>run($('aWrap'),'Add XNT',async()=>{const a=wAmt();if(!a)return null;if(await bal(ata(cfg.xm,user))<a){toast('Not enough wXNT in your wallet'+(canMint?'. Use Mint + deposit.':''),1);return null;}return [depIx(a)];});
$('aMintDep').onclick=()=>run($('aMintDep'),'Mint + deposit',async()=>{const a=wAmt();if(!a)return null;const to=ata(cfg.xm,user),ixs=[];
 if(!(await conn.getAccountInfo(to)))ixs.push(new TransactionInstruction({programId:ATP,keys:[m(user,1,1),m(to,1),m(user),m(cfg.xm),m(W.SystemProgram.programId),m(TP)],data:new Uint8Array([1])}));
 ixs.push(new TransactionInstruction({programId:TP,keys:[m(cfg.xm,1),m(to,1),m(user,0,1)],data:new Uint8Array([7,...u64(a)])}),depIx(a));return ixs;});
$('aAccept').onclick=()=>run($('aAccept'),'Accept admin',()=>[ix('accept_admin',[m(user,0,1),m(CONFIG,1)])]);
$('cConn').onclick=()=>connect();$('cDisc').onclick=()=>disconnect();$('wmClose').onclick=closeModal;$('walletModal').onclick=e=>{if(e.target.id==='walletModal')closeModal();};
document.querySelectorAll('.wopt').forEach(b=>b.onclick=()=>connect(b.dataset.w));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
navState();autoReconnect();refresh();
})();

async function txAmt(sig,owner){try{let t=null;for(let i=0;i<5&&!t;i++){t=await conn.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(!t)await new Promise(r=>setTimeout(r,1200));}
 if(!t||!t.meta)return '—';const o=owner.toBase58(),d={},sym=mn=>cfg&&mn===cfg.xm.toBase58()?'wXNT':cfg&&mn===cfg.um.toBase58()?'USDC.X':mn.slice(0,4)+'…';
 for(const b of t.meta.preTokenBalances||[])if(b.owner===o)d[b.mint]=(d[b.mint]||0)-(+b.uiTokenAmount.uiAmountString);
 for(const b of t.meta.postTokenBalances||[])if(b.owner===o)d[b.mint]=(d[b.mint]||0)+(+b.uiTokenAmount.uiAmountString);
 const f=v=>Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:4});const out=[],inn=[];
 for(const[mn,v]of Object.entries(d)){if(Math.abs(v)<1e-9)continue;(v<0?out:inn).push(f(v)+' '+sym(mn));}
 return out.length&&inn.length?out.join(', ')+' → '+inn.join(', '):inn.length?'+'+inn.join(', '):out.length?'−'+out.join(', '):'—';}catch{return '—';}}
function addRow(label,sig,owner){const em=$('cHist').querySelector('.empty');if(em)em.remove();const tr=document.createElement('tr');tr.innerHTML=`<td>${new Date().toLocaleTimeString()}</td><td>${label}</td><td class="amt">…</td><td>${link('tx',sig)}</td>`;$('cHist').prepend(tr);txAmt(sig,owner).then(a=>{tr.querySelector('.amt').textContent=a;});}
