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
