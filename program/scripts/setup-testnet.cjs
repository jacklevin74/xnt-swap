// One-time X1 testnet setup: test mints, initialize config (buy 1/1, sell 9/10), seed vaults 10M each. Dev-only.
const L=require('./lib.cjs'),{web3,spl}=L,fs=require('fs');
(async()=>{
 const c=new web3.Connection(L.RPC,'confirmed');
 const admin=L.kp('../keys/dev-only-deployer.json');
 const fpath='../keys/dev-only-usdcx-mint-authority.json';
 if(!fs.existsSync(fpath)){fs.writeFileSync(fpath,JSON.stringify(Array.from(web3.Keypair.generate().secretKey)),{mode:0o600});}
 const fa=L.kp(fpath);
 const out='testnet-deployment.json';let d=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):{};
 if(!d.xntMint){d.xntMint=(await spl.createMint(c,admin,admin.publicKey,null,9)).toBase58();fs.writeFileSync(out,JSON.stringify(d,null,1));}
 if(!d.usdcMint){d.usdcMint=(await spl.createMint(c,admin,fa.publicKey,null,6)).toBase58();fs.writeFileSync(out,JSON.stringify(d,null,1));}
 const xm=new web3.PublicKey(d.xntMint),um=new web3.PublicKey(d.usdcMint);
 if(!(await c.getAccountInfo(L.CONFIG))){
  d.initSig=await web3.sendAndConfirmTransaction(c,new web3.Transaction().add(L.initIx(admin.publicKey,xm,um,[1,1],[9,10])),[admin]);}
 const ax=await spl.getOrCreateAssociatedTokenAccount(c,admin,xm,admin.publicKey);
 const au=await spl.getOrCreateAssociatedTokenAccount(c,admin,um,admin.publicKey);
 if(!d.seedSig){
  await spl.mintTo(c,admin,xm,ax.address,admin,10_000_000n*10n**9n);
  await spl.mintTo(c,admin,um,au.address,fa,10_000_000n*10n**6n);
  d.seedSig=await web3.sendAndConfirmTransaction(c,new web3.Transaction().add(L.depositIx(admin.publicKey,xm,10_000_000n*10n**9n),L.depositIx(admin.publicKey,um,10_000_000n*10n**6n)),[admin]);}
 // fund faucet authority with gas so it can pay ATA rent + give users a little XNT for fees
 if((await c.getBalance(fa.publicKey))<5e9) d.faucetGasSig=await web3.sendAndConfirmTransaction(c,new web3.Transaction().add(web3.SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:fa.publicKey,lamports:30e9})),[admin]);
 d.programId=L.PROGRAM_ID.toBase58();d.config=L.CONFIG.toBase58();d.faucetAuthority=fa.publicKey.toBase58();
 d.xntVault=L.ata(xm,L.CONFIG).toBase58();d.usdcVault=L.ata(um,L.CONFIG).toBase58();
 fs.writeFileSync(out,JSON.stringify(d,null,1));
 const cfg=L.decodeConfig((await c.getAccountInfo(L.CONFIG)).data);
 console.log(JSON.stringify(d,null,1));console.log('buy',cfg.buy.map(String),'sell',cfg.sell.map(String),'paused',cfg.paused);
 console.log('vaults',(await spl.getAccount(c,L.ata(xm,L.CONFIG))).amount.toString(),(await spl.getAccount(c,L.ata(um,L.CONFIG))).amount.toString());
})().catch(e=>{console.error(e.message,e.logs||'');process.exit(1);});
