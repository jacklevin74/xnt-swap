// Minimal hand-rolled client for xnt_swap (no IDL needed). Dev/testnet tooling.
const web3=require('@solana/web3.js'),spl=require('@solana/spl-token'),crypto=require('crypto'),fs=require('fs');
const {PublicKey,TransactionInstruction,Keypair}=web3;
const PROGRAM_ID=new PublicKey('CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB');
const RPC=process.env.X1_RPC||'https://rpc.testnet.x1.xyz';
const disc=n=>crypto.createHash('sha256').update('global:'+n).digest().subarray(0,8);
const u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;};
const [CONFIG]=PublicKey.findProgramAddressSync([Buffer.from('config')],PROGRAM_ID);
const kp=p=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p))));
const ata=(m,o)=>spl.getAssociatedTokenAddressSync(m,o,true);
const m=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const TP=spl.TOKEN_PROGRAM_ID;
function ix(name,keys,...args){return new TransactionInstruction({programId:PROGRAM_ID,keys,data:Buffer.concat([disc(name),...args])});}
const initIx=(admin,xm,um,b,s)=>ix('initialize',[m(admin,true,true),m(CONFIG,true),m(xm),m(um),m(ata(xm,CONFIG),true),m(ata(um,CONFIG),true),m(TP),m(TP),m(spl.ASSOCIATED_TOKEN_PROGRAM_ID),m(web3.SystemProgram.programId)],u64(b[0]),u64(b[1]),u64(s[0]),u64(s[1]));
const swapKeys=(u,xm,um)=>[m(u,false,true),m(CONFIG),m(xm),m(um),m(ata(xm,CONFIG),true),m(ata(um,CONFIG),true),m(ata(xm,u),true),m(ata(um,u),true),m(TP),m(TP)];
const buyIx=(u,xm,um,amt,min)=>ix('buy',swapKeys(u,xm,um),u64(amt),u64(min));
const sellIx=(u,xm,um,amt,min)=>ix('sell',swapKeys(u,xm,um),u64(amt),u64(min));
const depositIx=(d,mint,amt)=>ix('deposit',[m(d,false,true),m(CONFIG),m(mint),m(ata(mint,CONFIG),true),m(ata(mint,d),true),m(TP)],u64(amt));
function decodeConfig(d){let o=8;const pk=()=>{const p=new PublicKey(d.subarray(o,o+32));o+=32;return p;};const r=()=>{const v=d.readBigUInt64LE(o);o+=8;return v;};
 const c={admin:pk(),pending:pk(),xntMint:pk(),usdcMint:pk(),xntVault:pk(),usdcVault:pk()};c.xntDec=d[o++];c.usdcDec=d[o++];
 c.buy=[r(),r()];c.sell=[r(),r()];c.paused=!!d[o++];return c;}
module.exports={web3,spl,PROGRAM_ID,RPC,CONFIG,kp,ata,initIx,buyIx,sellIx,depositIx,decodeConfig};
