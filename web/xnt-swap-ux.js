// UX extras for /xnt-swap: quick-amount presets, min received + after-swap preview (sim), copy address, empty states.
(function(){const $=id=>document.getElementById(id),num=s=>Number(String(s||'').replace(/[^0-9.]/g,''))||0;
function trim(v){return (Math.floor(v*1e6)/1e6).toString();}
document.querySelectorAll('.presets').forEach(p=>p.onclick=e=>{const b=e.target.closest('button');if(!b)return;const inp=$(p.dataset.for),pct=+b.dataset.p;
 if(p.dataset.for==='cAmt'){if(pct===100)return $('cMax').click();$('cMax').click();inp.value=trim(num(inp.value)*pct/100);}
 else{const bal=num($('balIn').textContent);inp.value=trim(bal*pct/100);}
 inp.dispatchEvent(new Event('input',{bubbles:true}));});
function simPreview(){const a=num($('amt').value),o=num($('out').value),bi=num($('balIn').textContent),bo=num($('balOut').textContent),ti=$('tokIn').textContent,to=$('tokOut').textContent,f=n=>n.toLocaleString(undefined,{maximumFractionDigits:6});
 $('sMin').textContent=o?f(o)+' '+to+' (fixed price)':'—';$('sAfter').textContent=a&&bi>=a?`After swap: ${f(bi-a)} ${ti} · ${f(bo+o)} ${to}`:'';
 const buy=ti==='USDC';$('dIn').className='dot'+(buy?' u':'');$('dOut').className='dot'+(buy?'':' u');$('go').classList.toggle('sell',!buy);}
['amt','out','balIn','tokIn'].forEach(i=>new MutationObserver(simPreview).observe($(i),{childList:true,characterData:true,subtree:true,attributes:true}));$('amt').addEventListener('input',()=>setTimeout(simPreview));
function empty(tb,cols,msg){const f=()=>{const rows=[...tb.children].filter(r=>!r.classList.contains('empty'));const em=tb.querySelector('.empty');
 if(!rows.length&&!em){const tr=document.createElement('tr');tr.className='empty';tr.innerHTML=`<td colspan=${cols}>${msg}</td>`;tb.appendChild(tr);}else if(rows.length&&em)em.remove();};new MutationObserver(f).observe(tb,{childList:true});f();}
empty($('hist'),4,'No swaps yet. Make your first swap above.');empty($('cHist'),4,'No transactions yet. Connect a wallet and use the faucet to start.');
const pill=$('navAddr');if(pill){pill.title='Click to copy address';pill.style.cursor='pointer';pill.onclick=()=>{const a=document.querySelector('#cAddr a');const full=a?a.href.split('/address/')[1].split('?')[0]:'';if(full&&navigator.clipboard)navigator.clipboard.writeText(full).then(()=>window.vToast('info','Copied',full));};}
setTimeout(simPreview,300);})();
