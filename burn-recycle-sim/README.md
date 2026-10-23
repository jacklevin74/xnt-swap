# Burn & Recycle simulator (simulation only)

Live: https://wxnt-sale-sim.vercel.app/burn-recycle

Client-side simulator for routing Foundation USDC (desk sell fees) into:
- **Burn half**: a venue-neutral ascending reverse auction that buys XNT and burns it. The bid starts below min(spot, TWAP), steps up, and is capped above max(spot, TWAP). Arbitrageurs fill it from the cheapest constant-product pool, and off-pool holders sell into it. It's compared with a naive "market-buy on xDEX" baseline (with optional front-running) and with a no-buy world.
- **Recycled half**: pro-rata, time-weighted USDC-side LP rewards for qualifying X1 pools (min lockup, min TVL, min pool age, APR cap, optional per-LP cap). Unspent rewards go to the desk USDC reserve (0.9P floor depth). There's also an optional loss-protection variant, which is **not recommended**.

No wallet, no RPC calls, no transactions.

## Run locally
Open `burn-recycle.html` in a browser, or serve the folder: `python3 -m http.server` then visit `/burn-recycle.html`.

## Model assumptions
- Constant-product pools, 0.3% fee. xDEX defaults are the real mainnet XNT/USDC.X pool reserves fetched Oct 22, 2026: 19,372.95 XNT / 4,560.90 USDC.X, price $0.2354 (vault balances minus protocol and fund fees).
- Price is endogenous. Each epoch has a random exogenous dollar flow (GBM-sized, the same in every world). Holders sell back a set share of any rally above the no-buy world. Burned XNT leaves permanently.
- Off-pool sellers offer a set dollar amount of XNT per 1% of auction premium over spot.
- Inflow = fee % × weekly sells to the desk.
- Simplified illustrative model, not a forecast.
