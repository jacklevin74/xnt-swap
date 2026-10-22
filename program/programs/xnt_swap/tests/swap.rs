//! LiteSVM integration tests against the compiled SBF program (target/deploy/xnt_swap.so).
use anchor_lang::{InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_sdk::{
    instruction::Instruction, program_pack::Pack, pubkey::Pubkey, signature::Keypair,
    signer::Signer, system_instruction, transaction::Transaction,
};
use spl_associated_token_account::get_associated_token_address as ata;
use xnt_swap::{accounts as acc, instruction as ix, Config, Rate, CONFIG_SEED};

const XD: u8 = 9; // XNT decimals (wrapped XNT style)
const UD: u8 = 6; // USDC.X decimals
const X: u64 = 1_000_000_000;
const U: u64 = 1_000_000;

struct Env { svm: LiteSVM, admin: Keypair, user: Keypair, xm: Pubkey, um: Pubkey, cfg: Pubkey }

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: &[Instruction], extra: &[&Keypair]) -> Result<(), String> {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), &signers, svm.latest_blockhash());
    let r = svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.meta.logs));
    svm.expire_blockhash();
    r
}

fn mint(svm: &mut LiteSVM, admin: &Keypair, dec: u8) -> Pubkey {
    let m = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let ixs = [
        system_instruction::create_account(&admin.pubkey(), &m.pubkey(), rent, spl_token::state::Mint::LEN as u64, &spl_token::id()),
        spl_token::instruction::initialize_mint2(&spl_token::id(), &m.pubkey(), &admin.pubkey(), None, dec).unwrap(),
    ];
    send(svm, admin, &ixs, &[&m]).unwrap();
    m.pubkey()
}

fn fund(svm: &mut LiteSVM, admin: &Keypair, mint: &Pubkey, owner: &Pubkey, amt: u64) {
    let ixs = [
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(&admin.pubkey(), owner, mint, &spl_token::id()),
        spl_token::instruction::mint_to(&spl_token::id(), mint, &ata(owner, mint), &admin.pubkey(), &[], amt).unwrap(),
    ];
    send(svm, admin, &ixs, &[]).unwrap();
}

fn bal(svm: &LiteSVM, a: &Pubkey) -> u64 {
    spl_token::state::Account::unpack(&svm.get_account(a).unwrap().data).unwrap().amount
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(xnt_swap::ID, concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/xnt_swap.so")).unwrap();
    let admin = Keypair::new();
    let user = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100 * X).unwrap();
    svm.airdrop(&user.pubkey(), 10 * X).unwrap();
    let xm = mint(&mut svm, &admin, XD);
    let um = mint(&mut svm, &admin, UD);
    let (cfg, _) = Pubkey::find_program_address(&[CONFIG_SEED], &xnt_swap::ID);
    let init = Instruction {
        program_id: xnt_swap::ID,
        accounts: acc::Initialize {
            admin: admin.pubkey(), config: cfg, xnt_mint: xm, usdc_mint: um,
            xnt_vault: ata(&cfg, &xm), usdc_vault: ata(&cfg, &um),
            token_program_xnt: spl_token::id(), token_program_usdc: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
            system_program: solana_sdk::system_program::id(),
        }.to_account_metas(None),
        data: ix::Initialize { buy: Rate { num: 1, den: 1 }, sell: Rate { num: 9, den: 10 } }.data(),
    };
    send(&mut svm, &admin, &[init], &[]).unwrap();
    // user gets 100,000 USDC airdrop + empty XNT ATA; admin holds inventory
    fund(&mut svm, &admin, &um, &user.pubkey(), 100_000 * U);
    fund(&mut svm, &admin, &xm, &user.pubkey(), 0);
    fund(&mut svm, &admin, &xm, &admin.pubkey(), 1_000_000 * X);
    fund(&mut svm, &admin, &um, &admin.pubkey(), 1_000_000 * U);
    let mut e = Env { svm, admin, user, xm, um, cfg };
    let a = e.admin.insecure_clone();
    { let mm = e.xm; deposit(&mut e, &a, mm, 500_000 * X).unwrap() };
    { let mm = e.um; deposit(&mut e, &a, mm, 500_000 * U).unwrap() };
    e
}

fn deposit(e: &mut Env, who: &Keypair, m: Pubkey, amt: u64) -> Result<(), String> {
    let i = Instruction { program_id: xnt_swap::ID,
        accounts: acc::Deposit { depositor: who.pubkey(), config: e.cfg, mint: m, vault: ata(&e.cfg, &m),
            from: ata(&who.pubkey(), &m), token_program: spl_token::id() }.to_account_metas(None),
        data: ix::Deposit { amount: amt }.data() };
    send(&mut e.svm, who, &[i], &[])
}

fn withdraw(e: &mut Env, who: &Keypair, m: Pubkey, amt: u64) -> Result<(), String> {
    let i = Instruction { program_id: xnt_swap::ID,
        accounts: acc::Withdraw { admin: who.pubkey(), config: e.cfg, mint: m, vault: ata(&e.cfg, &m),
            to: ata(&e.admin.pubkey(), &m), token_program: spl_token::id() }.to_account_metas(None),
        data: ix::Withdraw { amount: amt }.data() };
    send(&mut e.svm, who, &[i], &[])
}

fn swap_accts(e: &Env, who: &Keypair) -> Vec<solana_sdk::instruction::AccountMeta> {
    acc::Swap { user: who.pubkey(), config: e.cfg, xnt_mint: e.xm, usdc_mint: e.um,
        xnt_vault: ata(&e.cfg, &e.xm), usdc_vault: ata(&e.cfg, &e.um),
        user_xnt: ata(&who.pubkey(), &e.xm), user_usdc: ata(&who.pubkey(), &e.um),
        token_program_xnt: spl_token::id(), token_program_usdc: spl_token::id() }.to_account_metas(None)
}

fn buy(e: &mut Env, usdc: u64, min: u64) -> Result<(), String> {
    let u = e.user.insecure_clone();
    let i = Instruction { program_id: xnt_swap::ID, accounts: swap_accts(e, &u), data: ix::Buy { usdc_in: usdc, min_xnt_out: min }.data() };
    send(&mut e.svm, &u, &[i], &[])
}
fn sell(e: &mut Env, xnt: u64, min: u64) -> Result<(), String> {
    let u = e.user.insecure_clone();
    let i = Instruction { program_id: xnt_swap::ID, accounts: swap_accts(e, &u), data: ix::Sell { xnt_in: xnt, min_usdc_out: min }.data() };
    send(&mut e.svm, &u, &[i], &[])
}
fn admin_ix(e: &mut Env, who: &Keypair, data: Vec<u8>) -> Result<(), String> {
    let i = Instruction { program_id: xnt_swap::ID,
        accounts: acc::AdminOnly { admin: who.pubkey(), config: e.cfg }.to_account_metas(None), data };
    send(&mut e.svm, who, &[i], &[])
}

#[test]
fn buy_1to1_and_sell_at_090() {
    let mut e = setup();
    let (ux, uu) = (ata(&e.user.pubkey(), &e.xm), ata(&e.user.pubkey(), &e.um));
    buy(&mut e, 1_000 * U, 1_000 * X).unwrap();
    assert_eq!(bal(&e.svm, &ux), 1_000 * X);
    assert_eq!(bal(&e.svm, &uu), 99_000 * U);
    // sell 100.5 XNT -> 90.45 USDC (matches simulator: 99,090.45 USDC / 899.5 XNT)
    sell(&mut e, 100_500_000_000, 90_450_000).unwrap();
    assert_eq!(bal(&e.svm, &ux), 899_500_000_000);
    assert_eq!(bal(&e.svm, &uu), 99_090_450_000);
}

#[test]
fn slippage_fails() {
    let mut e = setup();
    assert!(buy(&mut e, 1_000 * U, 1_000 * X + 1).unwrap_err().contains("SlippageExceeded"));
    buy(&mut e, 10 * U, 0).unwrap();
    assert!(sell(&mut e, X, 900_001).unwrap_err().contains("SlippageExceeded"));
}

#[test]
fn rate_change_admin_only() {
    let mut e = setup();
    let a = e.admin.insecure_clone();
    let u = e.user.insecure_clone();
    let data = ix::SetRates { buy: Rate { num: 1, den: 2 }, sell: Rate { num: 1, den: 4 } }.data();
    assert!(admin_ix(&mut e, &u, data.clone()).unwrap_err().contains("Unauthorized"));
    admin_ix(&mut e, &a, data).unwrap();
    let ux = ata(&e.user.pubkey(), &e.xm);
    buy(&mut e, 100 * U, 50 * X).unwrap(); // 0.5 XNT per USDC
    assert_eq!(bal(&e.svm, &ux), 50 * X);
    sell(&mut e, 40 * X, 10 * U).unwrap(); // 0.25 USDC per XNT
    assert_eq!(bal(&e.svm, &uu_of(&e)), 99_900 * U + 10 * U);
    let bad = ix::SetRates { buy: Rate { num: 0, den: 1 }, sell: Rate { num: 1, den: 1 } }.data();
    assert!(admin_ix(&mut e, &a, bad).unwrap_err().contains("InvalidRate"));
}
fn uu_of(e: &Env) -> Pubkey { ata(&e.user.pubkey(), &e.um) }

#[test]
fn deposit_withdraw() {
    let mut e = setup();
    let a = e.admin.insecure_clone();
    let u = e.user.insecure_clone();
    let vu = ata(&e.cfg, &e.um);
    { let mm = e.um; deposit(&mut e, &u, mm, 5 * U).unwrap() }; // anyone may donate
    assert_eq!(bal(&e.svm, &vu), 500_005 * U);
    assert!({ let mm = e.um; withdraw(&mut e, &u, mm, U).unwrap_err().contains("Unauthorized") });
    { let mm = e.um; withdraw(&mut e, &a, mm, 500_005 * U).unwrap() };
    assert_eq!(bal(&e.svm, &vu), 0);
    assert!({ let mm = e.xm; withdraw(&mut e, &a, mm, 500_001 * X).unwrap_err().contains("InsufficientLiquidity") });
    // vault drained: sells fail on liquidity
    buy(&mut e, 10 * U, 0).unwrap();
    { let mm = e.um; withdraw(&mut e, &a, mm, 10 * U).unwrap() };
    assert!(sell(&mut e, X, 0).unwrap_err().contains("InsufficientLiquidity"));
}

#[test]
fn paused_blocks_swaps() {
    let mut e = setup();
    let a = e.admin.insecure_clone();
    let u = e.user.insecure_clone();
    assert!(admin_ix(&mut e, &u, ix::SetPaused { paused: true }.data()).unwrap_err().contains("Unauthorized"));
    admin_ix(&mut e, &a, ix::SetPaused { paused: true }.data()).unwrap();
    assert!(buy(&mut e, U, 0).unwrap_err().contains("Paused"));
    admin_ix(&mut e, &a, ix::SetPaused { paused: false }.data()).unwrap();
    buy(&mut e, U, 0).unwrap();
}

#[test]
fn two_step_admin_transfer() {
    let mut e = setup();
    let a = e.admin.insecure_clone();
    let u = e.user.insecure_clone();
    admin_ix(&mut e, &a, ix::ProposeAdmin { new_admin: u.pubkey() }.data()).unwrap();
    let accept = |e: &mut Env, k: &Keypair| {
        let i = Instruction { program_id: xnt_swap::ID,
            accounts: acc::AcceptAdmin { new_admin: k.pubkey(), config: e.cfg }.to_account_metas(None),
            data: ix::AcceptAdmin {}.data() };
        send(&mut e.svm, k, &[i], &[])
    };
    let stranger = Keypair::new();
    e.svm.airdrop(&stranger.pubkey(), X).unwrap();
    assert!(accept(&mut e, &stranger).unwrap_err().contains("Unauthorized"));
    accept(&mut e, &u).unwrap();
    let c: Config = anchor_lang::AccountDeserialize::try_deserialize(&mut &e.svm.get_account(&e.cfg).unwrap().data[..]).unwrap();
    assert_eq!(c.admin, u.pubkey());
    assert!(admin_ix(&mut e, &a, ix::SetPaused { paused: true }.data()).unwrap_err().contains("Unauthorized"));
}

#[test]
fn quote_handles_decimals() {
    assert_eq!(xnt_swap::quote(U, Rate { num: 1, den: 1 }, XD, UD).unwrap(), X);
    assert_eq!(xnt_swap::quote(X, Rate { num: 9, den: 10 }, UD, XD).unwrap(), 900_000);
    assert!(xnt_swap::quote(u64::MAX, Rate { num: u64::MAX, den: 1 }, XD, UD).is_err());
}
