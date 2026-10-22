// E2E on X1 testnet: fresh dev-only wallet -> live /api/xnt-faucet -> buy 1,000 USDC.X -> sell 100.5 wXNT.
const L=require('./lib.cjs'),{web3,spl}=L,fs=require('fs');
(async()=>{
 const c=new web3.Connection(L.RPC,'confirmed'),d=JSON.parse(fs.readFileSync('testnet-deployment.json'));
 const xm=new web3.PublicKey(d.xntMint),um=new web3.PublicKey(d.usdcMint),u=web3.Keypair.generate();
 console.log('wallet',u.publicKey.toBase58());
 const r=await fetch((process.env.SITE||'https://wxnt-sale-sim.vercel.app')+'/api/xnt-faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:u.publicKey.toBase58()})});
 const j=await r.json();console.log('faucet',r.status,JSON.stringify(j));if(!r.ok)process.exit(1);
 const b=async()=>[(await c.getTokenAccountBalance(L.ata(um,u.publicKey))).value.uiAmountString,await c.getTokenAccountBalance(L.ata(xm,u.publicKey)).then(x=>x.value.uiAmountString).catch(()=>'0'),(await c.getBalance(u.publicKey))/1e9];
 console.log('after faucet [usdc,xnt,gas]',await b());
 const t1=new web3.Transaction().add(spl.createAssociatedTokenAccountIdempotentInstruction(u.publicKey,L.ata(xm,u.publicKey),u.publicKey,xm),L.buyIx(u.publicKey,xm,um,1000n*10n**6n,1000n*10n**9n));
 console.log('buy tx',await web3.sendAndConfirmTransaction(c,t1,[u]));console.log('after buy',await b());
 const t2=new web3.Transaction().add(L.sellIx(u.publicKey,xm,um,100_500_000_000n,90_450_000n));
 console.log('sell tx',await web3.sendAndConfirmTransaction(c,t2,[u]));console.log('after sell',await b());
 const r2=await fetch((process.env.SITE||'https://wxnt-sale-sim.vercel.app')+'/api/xnt-faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:u.publicKey.toBase58()})});
 console.log('2nd faucet (expect 429)',r2.status,(await r2.json()).error);
})().catch(e=>{console.error(e.message,e.logs||'');process.exit(1);});
