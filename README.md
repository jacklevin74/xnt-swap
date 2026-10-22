# XNT Swap (X1 testnet)

Testnet swap between test **XNT/wXNT** and test **USDC.X** on the X1 testnet (`https://rpc.testnet.x1.xyz`).
**Test tokens only** — the wXNT and USDC.X mints here are custom SPL test mints, not real assets.

- Program ID: `CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB`
- Deployment addresses: `program/scripts/testnet-deployment.json`
- Swap page: https://wxnt-sale-sim.vercel.app/xnt-swap#testnet
- Admin page: https://wxnt-sale-sim.vercel.app/xnt-swap-admin
- Explorer: https://explorer.testnet.x1.xyz

## Layout
- `program/` — Anchor program (`programs/xnt_swap`), tests, `cli/`, `scripts/`
- `web/` — static swap + admin pages and the `api/xnt-faucet.js` Vercel function

## CLI
```
cd program && npm install
node cli/xnt-swap.cjs --help
node cli/xnt-swap.cjs new-wallet   # creates a DEV-ONLY keypair in gitignored keys/
```

## Secrets
Dev-only keys are **not included**. `keys/`, `.env*` and keypair files are gitignored.
The faucet reads its mint-authority key from the env var `XNT_SWAP_FAUCET_KEY` (set in Vercel).
