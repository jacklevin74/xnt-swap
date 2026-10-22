(function(root){
  const BUY_RATE = 1, SELL_RATE = 0.9, DEC = 6, U = 1e6;
  const toU = s => { s = String(s).trim(); if(!/^\d*\.?\d*$/.test(s)||s===''||s==='.') return NaN;
    const [i,f=''] = s.split('.'); if (f.length>DEC) return NaN; return Number(i||'0')*U + Number((f+'000000').slice(0,DEC)); };
  const fromU = u => (u/U).toFixed(DEC).replace(/\.?0+$/,'') || '0';
  function quote(side, amtU){ // side 'buy' pays USDC, 'sell' pays XNT
    if (side==='buy') return { out: amtU*BUY_RATE, fee: 0 };
    const out = Math.floor(amtU*SELL_RATE); return { out, fee: amtU-out };
  }
  function swap(w, side, amtU){
    if (!Number.isFinite(amtU) || amtU<=0) throw new Error('Enter an amount');
    const pay = side==='buy'?'usdc':'xnt', get = side==='buy'?'xnt':'usdc';
    if (amtU > w[pay]) throw new Error('Insufficient '+pay.toUpperCase()+' balance');
    const q = quote(side, amtU); w[pay]-=amtU; w[get]+=q.out;
    const tx = { t: Date.now(), side, in: amtU, out: q.out, fee: q.fee };
    w.history.unshift(tx); return tx;
  }
  const api = { BUY_RATE, SELL_RATE, DEC, U, toU, fromU, quote, swap };
  if (typeof module!=='undefined') module.exports = api; else root.XntMath = api;
})(this);
