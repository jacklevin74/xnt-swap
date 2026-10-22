const web3=require('@solana/web3.js'),fs=require('fs'),crypto=require('crypto');
const c=new web3.Connection('https://rpc.testnet.x1.xyz','confirmed');
const PID=new web3.PublicKey('CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB'),CFG=new web3.PublicKey('8jRNefKTWJWZMUkyXyQJcp78Q2WeaRWi3sKdnVa54Zga');
const k=web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(__dirname+'/../keys/dev-only-deployer.json'))));
const nw=new web3.PublicKey(process.argv[2]);
const data=Buffer.concat([crypto.createHash('sha256').update('global:propose_admin').digest().subarray(0,8),nw.toBuffer()]);
(async()=>{const ix=new web3.TransactionInstruction({programId:PID,keys:[{pubkey:k.publicKey,isSigner:true,isWritable:false},{pubkey:CFG,isSigner:false,isWritable:true}],data});
const s=await web3.sendAndConfirmTransaction(c,new web3.Transaction().add(ix),[k]);console.log('sig',s);
const d=(await c.getAccountInfo(CFG)).data;console.log('admin',new web3.PublicKey(d.subarray(8,40)).toBase58(),'pending',new web3.PublicKey(d.subarray(40,72)).toBase58());})();
