#!/usr/bin/env node
// xdex_router CLI (X1 testnet, dev-only). Usage:
//   node cli/xdex-router.cjs quote|buy|sell <amount> [--slippage 1] [--pool <pool>] [--keypair <path>]
//   node cli/xdex-router.cjs plan <amount> --max-slippage 1 [--side buy|sell]   (no trade)
//   buy|sell <amount> --max-slippage 1  -> trades min(requested, largest amount whose impact incl. fee <= limit)
//   buy  = spend <amount> quote token, get XNT;  sell = spend <amount> XNT, get quote token.
const path=require('path');const NM=process.env.NODE_MODULES||'/workspace/xnt-swap-program/node_modules';
const w=require(path.join(NM,'@solana/web3.js'));const spl=require(path.join(NM,'@solana/spl-token'));const fs=require('fs');
const RPC=process.env.RPC||'https://rpc.testnet.x1.xyz';
const ROUTER=new w.PublicKey(process.env.ROUTER||'CmivyhYDe5X4yXTNwjaT6kzeb2tADNoZvtngXaT1tWpD');
const XDEX=new w.PublicKey('7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf');
const WXNT=spl.NATIVE_MINT;
const args=process.argv.slice(2);const opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d};
const [cmd,amtStr]=args;
const POOL=new w.PublicKey(opt('pool','ENWQ8z4eF9LesH1Xye81mpMfh9pMptPaVojPJ52rgAb5'));
const slip=parseFloat(opt('slippage','1'));
const c=new w.Connection(RPC,'confirmed');
const disc=n=>require('crypto').createHash('sha256').update('global:'+n).digest().slice(0,8);
(async()=>{
 if(!['quote','plan','buy','sell'].includes(cmd)||!amtStr){console.log('usage: quote|buy|sell <amount> [--slippage 1] [--pool P] [--keypair K]');process.exit(1)}
 const d=(await c.getAccountInfo(POOL)).data;const pk=i=>new w.PublicKey(d.slice(8+32*i,8+32*i+32));
 const p={cfg:pk(0),v0:pk(2),v1:pk(3),m0:pk(5),m1:pk(6),tp0:pk(7),tp1:pk(8),obs:pk(9)};
 const xIs0=p.m0.equals(WXNT);if(!xIs0&&!p.m1.equals(WXNT))throw 'pool has no XNT side';
 const X={m:xIs0?p.m0:p.m1,v:xIs0?p.v0:p.v1,tp:xIs0?p.tp0:p.tp1},Q={m:xIs0?p.m1:p.m0,v:xIs0?p.v1:p.v0,tp:xIs0?p.tp1:p.tp0};
 const qDec=(await spl.getMint(c,Q.m,'confirmed',Q.tp)).decimals;
 const [b0,b1]=await Promise.all([p.v0,p.v1].map(v=>c.getTokenAccountBalance(v).then(r=>BigInt(r.value.amount))));
 // xDEX reserves = vault balance minus accrued protocol + fund fees (PoolState @341/349/357/365)
 const r0=b0-d.readBigUInt64LE(341)-d.readBigUInt64LE(357),r1=b1-d.readBigUInt64LE(349)-d.readBigUInt64LE(365);
 const rx=xIs0?r0:r1,rq=xIs0?r1:r0;
 const cfg=(await c.getAccountInfo(p.cfg)).data;const fee=cfg.readBigUInt64LE(12); // trade_fee_rate / 1e6
 const sell=cmd==='sell'||(['quote','plan'].includes(cmd)&&opt('side',cmd==='plan'?'buy':'sell')==='sell');
 const IN=sell?X:Q,OUT=sell?Q:X,inDec=sell?9:qDec,outDec=sell?qDec:9,rin=sell?rx:rq,rout=sell?rq:rx;
 const q=a=>{const n=a-(a*fee+999999n)/1000000n;return n*rout/(rin+n)};
 // impact vs spot incl. fee: (a/out)/(rin/rout)-1
 const imp=a=>{const o=q(a);return o>0n?Number(a)*Number(rout)/(Number(o)*Number(rin))-1:Infinity};
 const requested=BigInt(Math.round(parseFloat(amtStr)*10**inDec));let amtIn=requested;
 const ms=opt('max-slippage');const sym=sell?'XNT':'quote';const fmt=a=>Number(a)/10**inDec;
 if(ms!==undefined||cmd==='plan'){
  const s=parseFloat(ms??'1')/100,f=Number(fee)/1e6;
  // closed form: (rin+net)/((1-f)rin) <= 1+s  =>  net <= rin((1+s)(1-f)-1),  a = net/(1-f)
  const netMax=Number(rin)*((1+s)*(1-f)-1);const closed=netMax>0?BigInt(Math.floor(netMax/(1-f))):0n;
  let lo=0n,hi=rin*4n;while(hi-lo>1n){const m=(lo+hi)/2n;imp(m)<=s?lo=m:hi=m} // exact integer quote
  const allowed=lo<requested?lo:requested;amtIn=allowed;
  const dust=BigInt(Math.round(parseFloat(opt('dust','0.01'))*10**inDec));
  console.log(`max-slippage ${ms??1}% (incl. ${Number(fee)/1e4}% fee) | cap closed-form ${fmt(closed)} vs binary-search ${fmt(lo)} ${sym}`);
  console.log(`requested ${fmt(requested)} | allowed ${fmt(allowed)} | remainder not traded ${fmt(requested-allowed)} ${sym} (-> auction / hold)`);
  if(allowed<dust){console.log(`SKIP: allowed ${fmt(allowed)} < dust min ${fmt(dust)} ${sym}`);if(cmd==='plan')return;process.exit(0)}
 }
 const out=q(amtIn);
 console.log(`impact vs spot ${(imp(amtIn)*100).toFixed(4)}% (incl. fee)`);
 const minOut=out*BigInt(Math.round((100-slip)*100))/10000n;
 console.log(`pool ${POOL} fee ${Number(fee)/1e4}% reserves XNT ${Number(rx)/1e9} / quote ${Number(rq)/10**qDec}`);
 console.log(`${sell?'sell':'buy'}: in ${Number(amtIn)/10**inDec} ${sell?'XNT':'quote'} -> est ${Number(out)/10**outDec} ${sell?'quote':'XNT'} (min ${Number(minOut)/10**outDec}, ${slip}% slippage)`);
 if(cmd==='quote'||cmd==='plan')return;
 const kp=w.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(opt('keypair','/workspace/xnt-swap-program/keys/dev-only-deployer.json')))));
 const user=kp.publicKey;
 const ataX=spl.getAssociatedTokenAddressSync(WXNT,user,false,X.tp),ataQ=spl.getAssociatedTokenAddressSync(Q.m,user,false,Q.tp);
 const tx=new w.Transaction().add(w.ComputeBudgetProgram.setComputeUnitLimit({units:300000}),
  spl.createAssociatedTokenAccountIdempotentInstruction(user,ataX,user,WXNT,X.tp),
  spl.createAssociatedTokenAccountIdempotentInstruction(user,ataQ,user,Q.m,Q.tp));
 if(sell)tx.add(w.SystemProgram.transfer({fromPubkey:user,toPubkey:ataX,lamports:amtIn}),spl.createSyncNativeInstruction(ataX,X.tp));
 const data=Buffer.concat([disc(sell?'sell_xnt':'buy_xnt'),Buffer.from(new BigUint64Array([amtIn,minOut]).buffer)]);
 const m=(k,wr)=>({pubkey:k,isSigner:false,isWritable:wr});
 const [auth]=w.PublicKey.findProgramAddressSync([Buffer.from('vault_and_lp_mint_auth_seed')],XDEX);
 tx.add(new w.TransactionInstruction({programId:ROUTER,data,keys:[{pubkey:user,isSigner:true,isWritable:true},m(auth,false),m(p.cfg,false),m(POOL,true),
  m(sell?ataX:ataQ,true),m(sell?ataQ:ataX,true),m(IN.v,true),m(OUT.v,true),m(IN.tp,false),m(OUT.tp,false),m(IN.m,false),m(OUT.m,false),m(p.obs,true),m(XDEX,false)]}));
 tx.add(spl.createCloseAccountInstruction(ataX,user,user,[],X.tp)); // unwrap wXNT back to native XNT
 const bq0=await c.getTokenAccountBalance(ataQ).then(r=>BigInt(r.value.amount)).catch(()=>0n),bx0=await c.getBalance(user);
 const sig=await w.sendAndConfirmTransaction(c,tx,[kp]);
 const bq1=await c.getTokenAccountBalance(ataQ).then(r=>BigInt(r.value.amount)),bx1=await c.getBalance(user);
 console.log('signature',sig);console.log(`explorer https://explorer.testnet.x1.xyz/tx/${sig}`);
 const meta=(await c.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0})).meta;
 const keys=tx.instructions.flatMap(i=>i.keys.map(k=>k.pubkey.toBase58()));const vb=(arr,v)=>BigInt((arr.find(b=>b.mint===(v===OUT.v?OUT.m:IN.m).toBase58()&&b.owner===auth.toBase58())||{uiTokenAmount:{amount:'0'}}).uiTokenAmount.amount);
 const actOut=vb(meta.preTokenBalances,OUT.v)-vb(meta.postTokenBalances,OUT.v);
 console.log(`actual out ${Number(actOut)/10**outDec} vs est ${Number(out)/10**outDec}; actual impact ${((Number(amtIn)*Number(rout)/(Number(actOut)*Number(rin))-1)*100).toFixed(4)}% vs est ${(imp(amtIn)*100).toFixed(4)}%`);
 console.log(`delta: XNT ${(bx1-bx0)/1e9} (incl. fees/rent), quote ${Number(bq1-bq0)/10**qDec}`);
})().catch(e=>{console.error(e.logs||e);process.exit(1)});
