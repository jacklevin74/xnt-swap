# xdex-router (X1 testnet, dev-only)

Anchor program that buys/sells native XNT by CPI into xDEX (`7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf`, Raydium CP-Swap fork) `swap_base_input`, user as signer.

- Program ID (testnet): `CmivyhYDe5X4yXTNwjaT6kzeb2tADNoZvtngXaT1tWpD`
- Default pool: `ENWQ8z4eF9LesH1Xye81mpMfh9pMptPaVojPJ52rgAb5` (XNT / testnet "USDC" `4dr9zMDzp4TY3ikZmsqF2ikSkmtWiCwWYJ9xJx1h2KsU`, Token-2022)
- Instructions: `buy_xnt(amount_in, min_out)` (quote -> wXNT), `sell_xnt(amount_in, min_out)` (wXNT -> quote)
- xDEX swap account order (verified from a real testnet swap): payer, authority PDA (`vault_and_lp_mint_auth_seed`), amm_config, pool_state, input ATA, output ATA, input vault, output vault, input token program, output token program, input mint, output mint, observation_state.
- Pool reserves = vault balance − protocol fees − fund fees (PoolState offsets 341/349/357/365).

## Build / deploy
```
cargo-build-sbf
solana program deploy -u https://rpc.testnet.x1.xyz -k <deployer.json> --program-id keys/dev-only-xdex-router-program.json target/deploy/xdex_router.so
```
Keys live in gitignored `keys/` (dev-only).

## CLI
```
node cli/xdex-router.cjs quote 0.1 [--side sell|buy]
node cli/xdex-router.cjs sell 0.1 --slippage 1     # 0.1 XNT -> quote
node cli/xdex-router.cjs buy 0.2 --slippage 1      # 0.2 quote -> XNT
# options: --pool <pool> --keypair <path>; env RPC, ROUTER, NODE_MODULES
```
The CLI wraps native XNT (transfer + sync_native) before a sell and closes the wXNT ATA after, so XNT returns native.

## Slippage-capped partial buys (`--max-slippage`)

```
node cli/xdex-router.cjs plan 1000 --max-slippage 1            # print only (default side buy; --side sell)
node cli/xdex-router.cjs buy 1 --max-slippage 1 [--dust 0.01]  # trades min(requested, cap)
```

Impact is measured vs spot **including the pool fee**: `(amountIn/out)/(rIn/rOut) - 1`, using real
reserves (vault balance minus protocol + fund fees). Closed form for constant product:
`net_max = rIn*((1+s)(1-f) - 1)`, `cap = net_max/(1-f)`; verified with a binary search on the exact
integer quote (the binary-search value is used). The CLI prints requested, allowed, remainder not
traded (to auction / hold), expected out, impact and minOut. If allowed < `--dust` (default 0.01) the
trade is skipped. After a trade it reports actual out (from pool-vault balance changes) vs estimate.
If the limit is below the fee (~0.3%) nothing can be bought.

Testnet run (Oct 23 2026, pool ~28 XNT / ~54.5 USDC): requested 1 USDC at 1% -> allowed 0.381072,
remainder 0.618928; est 0.193910257 XNT, actual 0.193910257 XNT, impact 1.0000% est and actual.
Tx `drZv9381xK6yn3eUDG5ySoeExi4iJbCaYWRwH1VM4GMjMyb8DWkR6cV9duWJ6d9rRBbpR3JmkiD6MvoTVCA4iiL`.
