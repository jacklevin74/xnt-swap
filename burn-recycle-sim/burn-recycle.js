(function(){
const $=id=>document.getElementById(id),FEE=0.003;
function rng(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function gauss(r){let u=0;while(!u)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r())}
const px=p=>p.y/p.x;
function setP(p,P){const k=p.x*p.y;p.x=Math.sqrt(k/P);p.y=Math.sqrt(k*P)}
function buyTo(p,T){const tp=T*(1-FEE);if(tp<=px(p))return{q:0};const k=p.x*p.y,x2=Math.sqrt(k/tp);return{q:p.x-x2}}
function buyQ(p,q){const k=p.x*p.y,x2=p.x-q,y2=k/x2,c=(y2-p.y)/(1-FEE);p.x=x2;p.y=y2;return c}
function buyUSD(p,u){const k=p.x*p.y,y2=p.y+u*(1-FEE),x2=k/y2,q=p.x-x2;p.x=x2;p.y=y2;return q}
function sellQ(p,q){const k=p.x*p.y,x2=p.x+q*(1-FEE),y2=k/x2,u=p.y-y2;p.x=x2;p.y=y2;return u}
function align(ps){if(ps.length<2)return;const tv=ps.reduce((a,p)=>a+p.y,0),P=ps.reduce((a,p)=>a+px(p)*p.y,0)/tv;ps.forEach(p=>setP(p,P))}
function flow(ps,u,q){if(u>0)buyUSD(ps[0],u);else if(q>0)sellQ(ps[0],q);align(ps)}
const il=r=>2*Math.sqrt(r)/(1+r)-1;
const f$=(v,d=0)=>(v<0?'-':'')+'$'+Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const fn=(v,d=0)=>v.toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const ids=['sells','feePct','split','epochs','eDays','p0','supply','vol','drift','desk','seed','x1','age1','x2','age2','x3','disc','step','cap','am','frs','minLock','minTvl','minAge','maxApr','rCap','res0','lpCap','lpCapE','tw','offDepth','sellBack'];
const chks=['use2','rand','fr','rTvl','rAge','rCapOn','lp'];
function readP(){const P={};ids.forEach(i=>P[i]=parseFloat($(i).value)||0);chks.forEach(i=>P[i]=$(i).checked);P.capRef=$('capRef').value;P.startRef=$('startRef').value;return P}

function sim(P){
 const r=rng(P.seed),N=Math.max(1,Math.min(200,P.epochs|0)),p0=P.p0,eD=P.eDays,inflow=P.feePct/100*P.sells*eD/7,sp=P.split/100;
 const mk=(n,x,age)=>({n,x,y:x*p0,age});
 const mkPools=()=>{const a=[mk('xDEX',P.x1,P.age1)];if(P.use2)a.push(mk('DEX-2',P.x2,P.age2));a.push(mk('FarmPool',P.x3,1));return a};
 const A=mkPools(),B=mkPools(),Z=mkPools();
 // LP sizes = share of their pool's USDC side (wash farmer is transient extra liquidity)
 const LPs=[['LP-A','xDEX',.40,30,7],['LP-B','xDEX',.25,90,7],['LP-C (short lock)','xDEX',.10,7,7],['LP-D','DEX-2',.40,30,7],['LP-E','DEX-2',.20,60,7],['LP-F (thin pool)','FarmPool',.50,30,7],['Wash farmer','xDEX',.60,0,1]]
  .filter(a=>A.some(p=>p.n==a[1])).map(a=>{const p=A.find(p=>p.n==a[1]);return{n:a[0],pool:a[1],usd:a[2]*p.y,lock:a[3],days:Math.min(a[4],eD),rew:0,il:0,worst:0,worstE:0,q:false}});
 const mu=Math.log(1+P.drift/100)/N,s=P.vol/100;
 let hist=[p0],carry=0,res=P.res0;
 const T={off:0,burn:0,burnB:0,spent:0,spentB:0,arb:0,fee:0,slip:0,prem:0,rew:0,rewX:0,unspent:0,lpLiab:0,dTw:0,dSp:0,fr:0,unf:[]};
 const rows=[],ser={pA:[p0],pB:[p0],pZ:[p0],cb:[0],cbB:[0],apX:[],ap2:[]};
 for(let e=1;e<=N;e++){
  // exogenous flow sized on the no-buy world so it follows GBM; same $ / XNT applied to all worlds
  const g=mu-0.5*s*s+s*gauss(r),z0=Z[0];let u=0,q=0;
  if(g>=0)u=z0.y*(Math.exp(g/2)-1)/(1-FEE);else q=z0.x*(Math.exp(-g/2)-1)/(1-FEE);
  [A,B,Z].forEach(W=>{flow(W,u,q);if(P.desk>0)flow(W,P.desk,0);else if(P.desk<0)flow(W,0,-P.desk/px(W[0]))});
  if(P.sellBack>0)[A,B].forEach(W=>{const g2=Math.log(px(W[0])/px(Z[0]));if(g2>0){const tgt=px(Z[0])*Math.exp(g2*(1-P.sellBack/100)),k=W[0].x*W[0].y;const qx=Math.sqrt(k/tgt)-W[0].x;if(qx>0)flow(W,0,qx)}});
  const spot=px(A[0]);hist.push(spot);
  const w=P.tw|0,hw=w?hist.slice(-w-1):[spot];let twap=Math.exp(hw.reduce((a,v)=>a+Math.log(v),0)/hw.length);
  if(!P.rand)twap*=1+0.015/Math.max(1,w);
  const startRef=P.startRef=='min'?Math.min(spot,twap):twap,capRef=P.capRef=='max'?Math.max(spot,twap):twap;
  let offSold=0,budget=inflow*sp+carry,bid=startRef*(1-P.disc/100),capP=capRef*(1+P.cap/100),steps=0,burned=0,paid=0,arbP=0,feeP=0,slipP=0,capped=false;
  const pre=A.map(px);
  while(budget>0.01&&steps<1000){
   if(bid>capP){capped=true;break}
   const prem=Math.max(0,(bid/spot-1)*100),offWant=P.offDepth*prem/spot-offSold;
   if(offWant>0){const fq=Math.min(offWant,budget/bid),pay=fq*bid;offSold+=fq;budget-=pay;paid+=pay;burned+=fq;T.off+=fq}
   const Tg=bid/(1+P.am/100),qs=A.map(p=>buyTo(p,Tg)),qq=budget>0.01?qs.reduce((a,o)=>a+o.q,0):0;
   if(qq>0){const fq=Math.min(qq,budget/bid),sc=fq/qq;let cost=0;
    A.forEach((p,i)=>{if(qs[i].q>0){const qi=qs[i].q*sc,c=buyQ(p,qi);cost+=c;feeP+=c*FEE;slipP+=c*(1-FEE)-qi*pre[i]}});
    const pay=fq*bid;budget-=pay;paid+=pay;burned+=fq;arbP+=pay-cost}
   if(budget>0.01){bid*=1+P.step/100;steps++}
  }
  carry=budget;const fill=burned?paid/burned:0,impact=A.map((p,i)=>px(p)/pre[i]-1);align(A);
  if(capped&&budget>0.01)T.unf.push(e);
  T.burn+=burned;T.spent+=paid;T.arb+=arbP;T.fee+=feeP;T.slip+=slipP;T.prem+=paid-burned*spot;T.offPrem=(T.offPrem||0);
  if(burned){T.dTw+=(1-fill/twap)*paid;T.dSp+=(1-fill/spot)*paid}
  // baseline
  const bu=inflow*sp,bx=B[0];let frq=0;if(P.fr)frq=buyUSD(bx,bu*P.frs/100);
  const gotB=buyUSD(bx,bu);if(frq)T.fr+=sellQ(bx,frq)-bu*P.frs/100;align(B);T.burnB+=gotB;T.spentB+=bu;
  // rewards
  const R=inflow*(1-sp),day=e*eD;
  const ok=l=>{const p=A.find(x=>x.n==l.pool);return l.lock>=P.minLock&&(!P.rTvl||2*p.y>=P.minTvl)&&(!P.rAge||p.age+day>=P.minAge)};
  LPs.forEach(l=>{l.q=ok(l);l.w=l.q?l.usd*l.days/eD:0});
  const W=LPs.reduce((a,l)=>a+l.w,0);let paidR=0,byP={};
  LPs.forEach(l=>{let x=W?R*l.w/W:0;x=Math.min(x,l.usd*P.maxApr/100*eD/365);if(P.rCapOn)x=Math.min(x,P.rCap);l.rew+=x;paidR+=x;byP[l.pool]=(byP[l.pool]||0)+x;
   const pp=A.find(q=>q.n==l.pool),ilNow=il(px(pp)/p0);l.lossE=Math.max(0,2*l.usd*(l.il-ilNow));l.il=ilNow;if(ilNow<l.worst){l.worst=ilNow;l.worstE=e}});
  const unspent=R-paidR;res+=unspent;T.rew+=paidR;T.rewX+=byP.xDEX||0;T.unspent+=unspent;
  const usdP=p=>LPs.filter(l=>l.pool==p&&l.q).reduce((a,l)=>a+l.usd*l.days/eD,0),apr=p=>{const v=usdP(p);return v?(byP[p]||0)/v*365/eD*100:0};
  ser.apX.push(apr('xDEX'));ser.ap2.push(apr('DEX-2'));
  let lpE=0;if(P.lp){LPs.forEach(l=>{if(l.q)lpE+=Math.min(P.lpCap,l.lossE)});lpE=Math.min(lpE,P.lpCapE);res-=lpE;T.lpLiab+=lpE}
  const pA=px(A[0]);ser.pA.push(pA);ser.pB.push(px(B[0]));ser.pZ.push(px(Z[0]));ser.cb.push(T.burn);ser.cbB.push(T.burnB);
  rows.push({e,spot,twap,fill,dSp:burned?(1-fill/spot)*100:NaN,dTw:burned?(1-fill/twap)*100:NaN,steps,burned,arbP,unf:capped&&budget>0.01?budget:0,i1:impact[0]*100,i2:A[1]&&A[1].n=='DEX-2'?impact[1]*100:NaN,gotB,pB:px(B[0]),paidR,rx:byP.xDEX||0,unspent,lpE,res,floor:res/(0.9*pA)});
 }
 const fp=px(A[0]),fb=px(B[0]),fz=px(Z[0]);
 return{P,N,inflow,T,carry,res,fp,fb,fz,LPs,rows,ser,rewYr:T.rew*365/(N*eD),costYr:inflow*365/eD*(1-sp)};
}
const pct=v=>(v>=0?'+':'')+fn(v,2)+'%';
function render(S){
 const T=S.T,P=S.P,sup=P.supply;
 $('inflowOut').value=f$(S.inflow)+' ('+f$(S.inflow*365/P.eDays)+'/yr)';
 const C=[['or','XNT burned (auction)',fn(T.burn)+' ('+fn(T.burn/sup*100,4)+'% supply)'],['or','Avg fill vs spot',fn(Math.abs(T.spent?T.dSp/T.spent*100:0),2)+'% '+(T.dSp<0?'above':'below')],['or','Avg fill vs TWAP',fn(Math.abs(T.spent?T.dTw/T.spent*100:0),2)+'% '+(T.dTw<0?'above':'below')],['or','Unfilled epochs (cap hit)',T.unf.length?T.unf.length+' (ep '+T.unf.slice(0,8).join(', ')+(T.unf.length>8?'…':'')+')':'none'],
  ['or','Neutrality cost: premium over spot',f$(T.prem)+' ('+fn(T.spent?T.prem/T.spent*100:0,2)+'%)'],['or','… arb profit / LP fees / slippage',f$(T.arb)+' / '+f$(T.fee)+' / '+f$(T.slip)],['gr','Baseline market-buy burned',fn(T.burnB)+' (front-runner '+f$(T.fr)+')'],['gr','Final price: auction / baseline / none',f$(S.fp,4)+' / '+f$(S.fb,4)+' / '+f$(S.fz,4)],
  ['gr','Price vs baseline',pct((S.fp/S.fb-1)*100)+' (vs no-buy '+pct((S.fp/S.fz-1)*100)+')'],['gr','Unfilled USDC carried / off-pool XNT',f$(S.carry)+' / '+fn(T.off)],['te','LP rewards paid',f$(T.rew)+' ('+f$(S.rewYr)+'/yr)'],['te','xDEX share of rewards',fn(T.rew?T.rewX/T.rew*100:0,1)+'%'],
  ['te','Unspent → reserve',f$(T.unspent)],['gr','Desk reserve (final)',f$(S.res)],['gr','0.9P floor depth',fn(S.res/(0.9*S.fp))+' XNT @ '+f$(0.9*S.fp,4)],['gr','Loss-protection liability',P.lp?f$(T.lpLiab):'off']];
 $('cards').innerHTML=C.map(s=>`<div class="stat ${s[0]}"><span class="mu">${s[1]}</span><b>${s[2]}</b></div>`).join('');
 $('lps').innerHTML='<table><tr><th>LP</th><th>Pool</th><th>USDC side</th><th>Lock (d)</th><th>Days in/epoch</th><th>Qualifies</th><th>Rewards</th><th>Worst IL (epoch)</th><th>End IL</th></tr>'+S.LPs.map(l=>`<tr><td>${l.n}</td><td>${l.pool}</td><td>${f$(l.usd)}</td><td>${l.lock}</td><td>${l.days}</td><td>${l.q?'✅':'❌'}</td><td>${f$(l.rew)}</td><td>${fn(l.worst*100,2)}% (${l.worstE||'—'})</td><td>${fn(l.il*100,2)}%</td></tr>`).join('')+'</table>';
 const H=['Epoch','Spot','TWAP','Fill px','vs spot','vs TWAP','Steps','XNT burned','Arb profit','Unfilled $','xDEX impact','DEX-2 impact','Baseline burned','Baseline px','LP rewards','→xDEX','Unspent','Loss prot.','Reserve','Floor (XNT)'];
 const d=v=>isNaN(v)?'—':pct(-v);
 $('tbl').innerHTML='<table><tr>'+H.map(h=>`<th>${h}</th>`).join('')+'</tr>'+S.rows.map(r=>`<tr${r.unf?' style="background:#2a1608"':''}><td>${r.e}${r.unf?' ⚠️':''}</td><td>${f$(r.spot,4)}</td><td>${f$(r.twap,4)}</td><td>${r.fill?f$(r.fill,4):'—'}</td><td>${d(r.dSp)}</td><td>${d(r.dTw)}</td><td>${r.steps}</td><td>${fn(r.burned)}</td><td>${f$(r.arbP)}</td><td>${r.unf?f$(r.unf):''}</td><td>${fn(r.i1,2)}%</td><td>${d(r.i2)}</td><td>${fn(r.gotB)}</td><td>${f$(r.pB,4)}</td><td>${f$(r.paidR)}</td><td>${f$(r.rx)}</td><td>${f$(r.unspent)}</td><td>${f$(r.lpE)}</td><td>${f$(r.res)}</td><td>${fn(r.floor)}</td></tr>`).join('')+'</table>';
 chart('c1',[[S.ser.pA,'#e5e7eb'],[S.ser.pB,'#ef4444'],[S.ser.pZ,'#6b7280']],v=>'$'+v.toFixed(3));
 chart('c2',[[S.ser.cb,'#f97316'],[S.ser.cbB,'#ef4444']],v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':v.toFixed(0));
 chart('c3',[[S.ser.apX,'#14b8a6'],[S.ser.ap2,'#60a5fa']],v=>v.toFixed(0)+'%',true);
}
function chart(id,series,fmt,zero){const c=$(id),dpr=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;const g=c.getContext('2d');g.scale(dpr,dpr);g.clearRect(0,0,w,h);
 const all=series.flatMap(s=>s[0]);let lo=Math.min(...all),hi=Math.max(...all);
 if(zero){lo=0;hi=Math.max(10,hi*1.15)}else{const pad=(hi-lo)*0.08||Math.abs(hi)*0.05||1;lo-=pad;hi+=pad}
 const L=50,Tp=8,Bm=20,R=8;g.font='11px system-ui';g.strokeStyle='#1f2937';g.fillStyle='#8b95a7';
 for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,y=Tp+(h-Tp-Bm)*(1-i/4);g.beginPath();g.moveTo(L,y);g.lineTo(w-R,y);g.stroke();g.fillText(fmt(v),2,y+4)}
 series.forEach(([d,col],k)=>{g.strokeStyle=col;g.lineWidth=2;g.setLineDash(k==1&&zero?[5,4]:[]);g.beginPath();d.forEach((v,i)=>{const x=L+(w-L-R)*i/Math.max(1,d.length-1),y=Tp+(h-Tp-Bm)*(1-(v-lo)/(hi-lo));i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()});
 g.setLineDash([]);g.fillText('epoch',w-40,h-4)}
function run(){render(sim(readP()))}
const REAL={x1:19372.95,p0:0.2354},DEEP={x1:5000000};
function scenarios(){const b=readP(),N=b.epochs;
 const list=[['Current inputs',{}],['Auction from TWAP only (legacy)',{startRef:'twap',capRef:'twap',tw:3}],['Auction from min(spot,TWAP)',{startRef:'min',capRef:'max'}],['Realistic depth (real xDEX)',{x1:REAL.x1,use2:false}],['Deep pool (5M XNT, hypothetical)',{x1:DEEP.x1}],['Inflow $10k/wk',{sells:100000/(b.feePct/100)/10}],['Inflow $30k/wk',{sells:300000/(b.feePct/100)/10}],['−40% drift',{drift:-40}],['Rally (+100%)',{drift:100}]];
 const out=list.map(([n,o])=>{const S=sim(Object.assign({},b,o)),T=S.T;return`<tr><td>${n}</td><td>${f$(S.inflow)}</td><td>${fn(T.burn)}</td><td>${pct(T.spent?-T.dSp/T.spent*100:0)}</td><td>${f$(T.prem)} (${fn(T.spent?T.prem/T.spent*100:0,1)}%)</td><td>${T.unf.length}</td><td>${pct((S.fp/S.fb-1)*100)}</td><td>${pct((S.fp/S.fz-1)*100)}</td><td>${f$(S.rewYr)}</td><td>${f$(S.res)}</td></tr>`});
 $('scTbl').innerHTML='<table><tr><th>Scenario</th><th>Inflow/epoch</th><th>XNT burned</th><th>Avg fill vs spot (+ = above)</th><th>Neutrality cost</th><th>Unfilled ep.</th><th>Price vs baseline</th><th>Price vs no-buy</th><th>Rewards paid/yr</th><th>Reserve</th></tr>'+out.join('')+'</table>';
 $('scCard').style.display='';window.__scen=$('scTbl').innerText;}
$('run').onclick=run;$('rerun').onclick=()=>{$('seed').value=(Math.random()*1e6)|0;run()};$('scen').onclick=scenarios;
$('deep').onclick=e=>{e.preventDefault();$('x1').value=DEEP.x1;$('use2').checked=true;$('x2').value=1500000;run()};
document.querySelectorAll('.pv').forEach(b=>b.onclick=()=>{$('sells').value=b.dataset.v;run()});
document.querySelectorAll('.sc').forEach(b=>b.onclick=()=>{const s=b.dataset.s;$('drift').value=s=='bear'?-40:s=='rally'?100:0;run()});
document.querySelectorAll('input,select').forEach(i=>i.addEventListener('change',run));window.addEventListener('resize',run);run();
if(location.hash=='#scenarios')scenarios();
})();
