# xnt-swap — fixed-rate XNT ⇄ USDC.X swap (Anchor, X1/SVM)

On-chain version of the /xnt-swap simulator: buy XNT with USDC.X at 1:1 and sell XNT back at 0.90 USDC.X. The admin can change either rate to any value.

Dev program id: `CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB`. This id is **dev-only**. Its keypair is in `keys/`, which is gitignored and not shipped. Before a real deploy, generate your own id, then run `anchor keys sync` or edit `declare_id!` and `Anchor.toml`.

## XNT as an SPL mint
The program swaps **SPL / Token-2022 tokens only**. XNT must be a wrapped-XNT mint (or a test mint), and native XNT lamports are not handled. Both mints go through `anchor_spl::token_interface` and `transfer_checked`, so either can be Token or Token-2022. Token-2022 transfer-fee or transfer-hook mints are **not** supported: the received amount would differ from `amount_in`.

## Accounts
- **Config PDA** (seeds `["config"]`):
  - admin, pending_admin
  - xnt_mint, usdc_mint, xnt_vault, usdc_vault
  - decimals for both mints
  - buy {num,den}, sell {num,den}
  - paused, bump
- **Vaults:** the config PDA's associated token accounts for each mint. They are PDA-owned, so only the program can move funds out.

## Instructions
| ix | who | notes |
|---|---|---|
| initialize(buy, sell) | payer becomes admin | creates the config and both vaults |
| buy(usdc_in, min_xnt_out) | anyone | slippage check, vault liquidity check |
| sell(xnt_in, min_usdc_out) | anyone | same checks |
| deposit(amount) | anyone (admin funds this way) | the mint must be XNT or USDC.X |
| withdraw(amount) | admin | the destination can be any token account of that mint |
| set_rates(buy, sell) | admin | any values with num>0 and den>0 |
| set_paused(bool) | admin | blocks buy and sell |
| propose_admin(pk) / accept_admin() | admin / proposed admin | two-step admin transfer |

Events: `Swapped`, `RatesChanged`, `PausedChanged`, `Liquidity`, `AdminChanged`.

Each deposit/withdraw call handles one mint, so the same instruction covers both "deposit_xnt" and "deposit_usdc".

## Rate math (u128, checked, rounds down in the vault's favour)
```
buy : xnt_out  = usdc_in * buy.num  * 10^xnt_dec  / (buy.den  * 10^usdc_dec)
sell: usdc_out = xnt_in  * sell.num * 10^usdc_dec / (sell.den * 10^xnt_dec)
```
Defaults: buy 1/1 and sell 9/10. Rates are in whole-token units, and the code handles the decimals difference between the mints (for example 9 vs 6).

Example: buying with 1,000 USDC gives 1,000 XNT. Selling 100.5 XNT returns 90.45 USDC.

## Build & test
These versions were verified on Linux:
- Rust 1.85.1 via rustup
- Agave/Solana CLI 2.1.21 (platform-tools v1.43)
- anchor-lang 0.31.1
- litesvm 0.6.1
- Linux also needs `pkg-config libssl-dev`.

```
sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.21/install)"
cargo build-sbf --manifest-path programs/xnt_swap/Cargo.toml   # -> target/deploy/xnt_swap.so
cargo test -p xnt_swap                                         # LiteSVM tests run against the .so
```
Use the shipped Cargo.lock as-is. It pins `blake3` to 1.5.5 to avoid a dependency that needs rustc 1.87. If you have the Anchor CLI 0.31.x, `anchor build` also works and generates the IDL.

## Deploy to X1
```
solana-keygen new -o keys/dev-only-deployer.json          # dev-only, gitignored
solana-keygen new -o target/deploy/xnt_swap-keypair.json  # new program id -> update declare_id!, Anchor.toml
solana config set --url https://rpc.testnet.x1.xyz        # testnet; mainnet: https://rpc.mainnet.x1.xyz
solana program deploy target/deploy/xnt_swap.so --program-id target/deploy/xnt_swap-keypair.json -k keys/dev-only-deployer.json
```
After deploying:
1. Call `initialize` with the wrapped-XNT and USDC.X mints.
2. Fund both vaults with `deposit`.

Use Phantom or the X1 wallet for signing on the client side.

## Security notes
- The admin can change rates instantly and withdraw the whole vault. This is fully custodial and trusted. Use a multisig admin and consider a timelock for production.
- Users should always pass a real `min_out`, because a rate change can land just before their transaction.
- Arbitrage: if buy.num/buy.den is greater than or equal to sell.den/sell.num, a buy followed by a sell yields a profit. Keep sell ≤ 1/buy.
- Amounts round down. Swaps that would pay out 0 are rejected.
- The code is **unaudited**. Never commit keypairs: `keys/` and `target/` are gitignored.

## X1 testnet deployment (dev-only)
| item | address |
|---|---|
| Program | CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB |
| Config PDA | 8jRNefKTWJWZMUkyXyQJcp78Q2WeaRWi3sKdnVa54Zga |
| test wXNT (9 dec) | ExMyvGGUAc1NMMVHHHrV9b1WHmQyXktMC3rZ1puR9txM |
| test USDC.X (6 dec) | Hyair9L66XdPgsWxgBF5akDk7ssGhqLXFAYDpZxXbFCr |
| wXNT vault | 2cXUhsbAzPUgmTE7EJCyUGzTs3VQp2Kyx697kVKTXqg3 |
| USDC.X vault | TvpZkiX23MR73XVqTBuUYbPVNra8jTBh4CfNctdqArh |
| Faucet / USDC.X mint authority | Gppa2ijKSQB3YcaS9WJX5aCHciFUwDi5ZWCQqU4m7bX6 |

The admin and upgrade authority is the dev-only deployer, 7wfmpBPrAmoVKZ6G9RFjRdfqU7A1mDbJpFdDRwWJbiS.

Explorer: https://explorer.x1.xyz/address/<addr>?cluster=testnet

Scripts (`cd scripts && npm i`):
- `setup-testnet.cjs`: idempotent setup.
- `e2e-testnet.cjs`: faucet, then buy, then sell, run against the live site.
- `xnt-faucet.js` and `xnt-swap-chain.js`: copies of the site's API route and browser client.

The faucet secret lives only in the Vercel env var `XNT_SWAP_FAUCET_KEY`, with the box copy in the gitignored `keys/` folder.

## CLI (`cli/xnt-swap.cjs`)
Setup: `cd scripts && npm i`, then from `cli/` run `node xnt-swap.cjs <cmd>`. You can also `npm link` it and call `xnt-swap`.

Global flags:
- `--keypair <path>`: default is `keys/dev-only-cli-wallet.json`, or the `XNT_SWAP_KEYPAIR` env var.
- `--rpc <url>`: default is the X1 testnet RPC.
- `--site <url>`: the faucet host.

```
status                                  rates, paused, admin, vault balances
balance [--wallet <pubkey>]
new-wallet [--out path] [--force]       DEV-ONLY keypair into gitignored keys/ (secret never printed)
faucet [--wallet <pubkey>]              live /api/xnt-faucet: 100k test USDC.X (+0.05 XNT gas)
buy <usdc> [--slippage 0.5] [--min-out amt]
sell <xnt> [--slippage 0.5] [--min-out amt]
# admin (use --keypair <admin key>)
set-rates <buyNum/buyDen> <sellNum/sellDen>   e.g. set-rates 1/1 9/10
pause | unpause
deposit <xnt|usdc> <amount>
withdraw <xnt|usdc> <amount>            to the admin's own token account
```
Every transaction prints an X1 explorer link. Program errors come back as readable messages such as "Output below minimum (slippage)" or "Unauthorized".
