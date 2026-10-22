// POST /api/xnt-faucet {address}: mints 100,000 TEST USDC.X on X1 TESTNET to the address (+0.05 test XNT gas if low).
// Mint authority secret: env XNT_SWAP_FAUCET_KEY (JSON byte array). Rate limit: 1/address/hour, 5/IP/hour (Postgres).
const {route,readJson}=require('./_lib/http.js');const {ApiError}=require('./_lib/store.js');const db=require('./_lib/db.js');
const web3=require('@solana/web3.js'),spl=require('@solana/spl-token');
const RPC='https://rpc.testnet.x1.xyz',USDC=new web3.PublicKey('Hyair9L66XdPgsWxgBF5akDk7ssGhqLXFAYDpZxXbFCr');
const AMOUNT=100_000n*10n**6n,GAS=50_000_000;
let ready=false;
async function limit(addr,ip){
 if(!ready){await db.query('CREATE TABLE IF NOT EXISTS xnt_faucet_log(id bigserial primary key,address text,ip text,at timestamptz default now())');ready=true;}
 const r=await db.query("SELECT count(*) FILTER (WHERE address=$1) a,count(*) FILTER (WHERE ip=$2) i FROM xnt_faucet_log WHERE at>now()-interval '1 hour'",[addr,ip]);
 if(+r.rows[0].a>=1)throw new ApiError(429,'RATE','This address already used the faucet in the last hour');
 if(+r.rows[0].i>=5)throw new ApiError(429,'RATE','Too many faucet requests from this IP; try later');
 await db.query('INSERT INTO xnt_faucet_log(address,ip) VALUES($1,$2)',[addr,ip]);
}
module.exports=route(['POST'],async req=>{
 const {address}=await readJson(req);let owner;
 try{owner=new web3.PublicKey(address);}catch{throw new ApiError(400,'ADDR','Invalid address');}
 if(!process.env.XNT_SWAP_FAUCET_KEY)throw new ApiError(503,'NO_KEY','Faucet not configured');
 const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'?';
 await limit(owner.toBase58(),ip);
 const fa=web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.XNT_SWAP_FAUCET_KEY)));
 const c=new web3.Connection(RPC,'confirmed');const ata=spl.getAssociatedTokenAddressSync(USDC,owner,true);
 const tx=new web3.Transaction().add(
  spl.createAssociatedTokenAccountIdempotentInstruction(fa.publicKey,ata,owner,USDC),
  spl.createMintToInstruction(USDC,ata,fa.publicKey,AMOUNT));
 let gas=false;if((await c.getBalance(owner))<20_000_000){tx.add(web3.SystemProgram.transfer({fromPubkey:fa.publicKey,toPubkey:owner,lamports:GAS}));gas=true;}
 const sig=await web3.sendAndConfirmTransaction(c,tx,[fa]);
 return {ok:true,signature:sig,minted:'100000',gasXnt:gas?0.05:0,network:'x1-testnet'};
});
