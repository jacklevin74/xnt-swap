#!/usr/bin/env node
// xnt-swap CLI for the xnt_swap program on X1 TESTNET. Never prints private keys.
const path=require('path'),fs=require('fs');
const L=require('../scripts/lib.cjs'),{web3,spl}=L,{PublicKey}=web3;
const argv=process.argv.slice(2),flags={},pos=[];
for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--')){const k=argv[i].slice(2);flags[k]=(argv[i+1]&&!argv[i+1].startsWith('--'))?argv[++i]:true;}else pos.push(argv[i]);}
const RPC=flags.rpc||process.env.X1_RPC||'https://rpc.testnet.x1.xyz';
const SITE=flags.site||'https://wxnt-sale-sim.vercel.app';
const KEYS=path.join(__dirname,'..','keys');
const KP=flags.keypair||process.env.XNT_SWAP_KEYPAIR||path.join(KEYS,'dev-only-cli-wallet.json');
const EXP='https://explorer.x1.xyz',CL=RPC.includes('testnet')?'?cluster=testnet':'';
const tx=s=>`${EXP}/tx/${s}${CL}`;
const c=new web3.Connection(RPC,'confirmed');
const disc=n=>require('crypto').createHash('sha256').update('global:'+n).digest().subarray(0,8);
const u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;};
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const ix=(n,keys,...a)=>new web3.TransactionInstruction({programId:L.PROGRAM_ID,keys,data:Buffer.concat([disc(n),...a])});
const toU=(s,d)=>{s=String(s);if(!/^\d*\.?\d*$/.test(s))throw new Error('bad amount '+s);const [i,f='']=s.split('.');return BigInt(i||0)*10n**BigInt(d)+BigInt((f+'0'.repeat(d)).slice(0,d)||0);};
const fmt=(v,d)=>{const s=v.toString().padStart(d+1,'0');const r=(s.slice(0,-d)+'.'+s.slice(-d)).replace(/\.?0+$/,'');return Number(r).toLocaleString('en-US',{maximumFractionDigits:d});};
const quote=(a,r,od,id)=>a*r[0]*10n**BigInt(od)/(r[1]*10n**BigInt(id));
const rate=s=>{const m=/^(\d+)\/(\d+)$/.exec(s||'');if(!m)throw new Error('rate must look like 9/10');return [BigInt(m[1]),BigInt(m[2])];};
function loadKp(){if(!fs.existsSync(KP))throw new Error(`keypair not found: ${KP} (run new-wallet or pass --keypair)`);return L.kp(KP);}
async function cfg(){const a=await c.getAccountInfo(L.CONFIG);if(!a)throw new Error('config not found');return L.decodeConfig(a.data);}
async function tb(a){try{return BigInt((await c.getTokenAccountBalance(a)).value.amount);}catch{return 0n;}}
async function send(ixs,signer){const s=await web3.sendAndConfirmTransaction(c,new web3.Transaction().add(...ixs),[signer]);return s;}
function err(e){const logs=(e.logs||e.transactionLogs||[]).join('\n');const m=/Error Message: ([^.]+)/.exec(logs);return m?m[1]:(e.message||String(e)).split('\n')[0];}
async function balance(owner){const k=await cfg();const [x,u,g]=await Promise.all([tb(L.ata(k.xntMint,owner)),tb(L.ata(k.usdcMint,owner)),c.getBalance(owner)]);
 console.log(`wallet ${owner.toBase58()}\n  USDC.X ${fmt(u,k.usdcDec)}\n  wXNT   ${fmt(x,k.xntDec)}\n  XNT    ${(g/1e9).toFixed(6)} (gas)`);return {x,u,g};}
const cmds={
 async status(){const k=await cfg();const [xv,uv]=await Promise.all([tb(k.xntVault),tb(k.usdcVault)]);
  console.log(`program  ${L.PROGRAM_ID.toBase58()}\nconfig   ${L.CONFIG.toBase58()}\nadmin    ${k.admin.toBase58()}${k.pending.equals(PublicKey.default)?'':'\npending  '+k.pending.toBase58()}
buy      ${k.buy.join('/')}  (1 USDC.X -> ${Number(k.buy[0])/Number(k.buy[1])} wXNT)\nsell     ${k.sell.join('/')}  (1 wXNT -> ${Number(k.sell[0])/Number(k.sell[1])} USDC.X)
paused   ${k.paused}\nvaults   ${fmt(xv,k.xntDec)} wXNT | ${fmt(uv,k.usdcDec)} USDC.X\nexplorer ${EXP}/address/${L.CONFIG.toBase58()}${CL}`);},
 async balance(){const o=flags.wallet?new PublicKey(flags.wallet):loadKp().publicKey;await balance(o);},
 async 'new-wallet'(){fs.mkdirSync(KEYS,{recursive:true});const p=flags.out||path.join(KEYS,'dev-only-cli-wallet.json');
  if(fs.existsSync(p)&&!flags.force)throw new Error(`${p} exists (use --force)`);const k=web3.Keypair.generate();
  fs.writeFileSync(p,JSON.stringify(Array.from(k.secretKey)),{mode:0o600});console.log(`DEV-ONLY wallet ${k.publicKey.toBase58()}\nsaved to ${p} (gitignored; secret not shown)`);},
 async faucet(){const o=flags.wallet||loadKp().publicKey.toBase58();const r=await fetch(SITE+'/api/xnt-faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:o})});
  const j=await r.json();if(!r.ok)throw new Error(`faucet ${r.status}: ${j.error}`);console.log(`faucet: +100,000 USDC.X${j.gasXnt?' +0.05 XNT gas':''}\ntx ${tx(j.signature)}`);},
 async buy(){return swap('buy');},async sell(){return swap('sell');},
 async 'set-rates'(){const k=loadKp();const b=rate(pos[1]),s=rate(pos[2]);
  const sig=await send([ix('set_rates',[meta(k.publicKey,false,true),meta(L.CONFIG,true)],u64(b[0]),u64(b[1]),u64(s[0]),u64(s[1]))],k);console.log(`rates set buy ${pos[1]} sell ${pos[2]}\ntx ${tx(sig)}`);},
 async pause(){return paused(true);},async unpause(){return paused(false);},
 async deposit(){const k=loadKp(),f=await cfg(),[mint,d]=tok(f);const a=toU(pos[2],d);
  const sig=await send([L.depositIx(k.publicKey,mint,a)],k);console.log(`deposited ${pos[2]} ${pos[1]}\ntx ${tx(sig)}`);},
 async withdraw(){const k=loadKp(),f=await cfg(),[mint,d]=tok(f);const a=toU(pos[2],d),to=L.ata(mint,k.publicKey);
  const sig=await send([spl.createAssociatedTokenAccountIdempotentInstruction(k.publicKey,to,k.publicKey,mint),
   ix('withdraw',[meta(k.publicKey,false,true),meta(L.CONFIG),meta(mint),meta(L.ata(mint,L.CONFIG),true),meta(to,true),meta(spl.TOKEN_PROGRAM_ID)],u64(a))],k);
  console.log(`withdrew ${pos[2]} ${pos[1]}\ntx ${tx(sig)}`);},
};
function tok(f){const t=(pos[1]||'').toLowerCase();if(t==='xnt')return [f.xntMint,f.xntDec];if(t==='usdc')return [f.usdcMint,f.usdcDec];throw new Error('token must be xnt or usdc');}
async function paused(p){const k=loadKp();const sig=await send([ix('set_paused',[meta(k.publicKey,false,true),meta(L.CONFIG,true)],Buffer.from([p?1:0]))],k);console.log(`paused=${p}\ntx ${tx(sig)}`);}
async function swap(side){const k=loadKp(),f=await cfg(),buy=side==='buy';if(!pos[1])throw new Error(`usage: ${side} <amount>`);
 const id=buy?f.usdcDec:f.xntDec,od=buy?f.xntDec:f.usdcDec,a=toU(pos[1],id),out=quote(a,buy?f.buy:f.sell,od,id);
 const slip=BigInt(Math.round(parseFloat(flags.slippage??'0.5')*100));const min=flags['min-out']!==undefined?toU(flags['min-out'],od):out*(10000n-slip)/10000n;
 console.log(`${side} ${fmt(a,id)} ${buy?'USDC.X':'wXNT'} -> quote ${fmt(out,od)} ${buy?'wXNT':'USDC.X'} (min ${fmt(min,od)})`);
 const ixs=[spl.createAssociatedTokenAccountIdempotentInstruction(k.publicKey,L.ata(f.xntMint,k.publicKey),k.publicKey,f.xntMint),
  spl.createAssociatedTokenAccountIdempotentInstruction(k.publicKey,L.ata(f.usdcMint,k.publicKey),k.publicKey,f.usdcMint),
  (buy?L.buyIx:L.sellIx)(k.publicKey,f.xntMint,f.usdcMint,a,min)];
 const sig=await send(ixs,k);console.log(`tx ${tx(sig)}`);await balance(k.publicKey);}
const cmd=pos[0];
if(!cmds[cmd]){console.log(`xnt-swap <command> [--keypair path] [--rpc url]
  status | balance [--wallet pk] | new-wallet [--out path] [--force] | faucet [--wallet pk]
  buy <usdc> [--slippage pct] [--min-out amt] | sell <xnt> [--slippage pct] [--min-out amt]
  admin: set-rates <bn/bd> <sn/sd> | pause | unpause | deposit <xnt|usdc> <amt> | withdraw <xnt|usdc> <amt>`);process.exit(cmd?1:0);}
cmds[cmd]().catch(e=>{console.error('error:',err(e));process.exit(1);});
