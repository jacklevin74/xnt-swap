//! XNT <-> USDC.X fixed-rate swap for X1 (SVM).
//!
//! XNT is handled as an SPL / Token-2022 mint (e.g. wrapped XNT or a test mint);
//! native XNT lamports are NOT swapped directly.
//!
//! Rate math (all u128, rounds down in favour of the vault):
//!   buy : xnt_out  = usdc_in * buy_num  * 10^xnt_dec  / (buy_den  * 10^usdc_dec)
//!   sell: usdc_out = xnt_in  * sell_num * 10^usdc_dec / (sell_den * 10^xnt_dec)
//! Defaults matching the simulator: buy 1/1 (1 USDC -> 1 XNT), sell 9/10 (1 XNT -> 0.90 USDC).
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("CbfMi1yGXAigkU8zpfYsLYGC1wQ1N66js1pKTRSZMmzB");

pub const CONFIG_SEED: &[u8] = b"config";

#[program]
pub mod xnt_swap {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, buy: Rate, sell: Rate) -> Result<()> {
        buy.validate()?;
        sell.validate()?;
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.pending_admin = Pubkey::default();
        c.xnt_mint = ctx.accounts.xnt_mint.key();
        c.usdc_mint = ctx.accounts.usdc_mint.key();
        c.xnt_vault = ctx.accounts.xnt_vault.key();
        c.usdc_vault = ctx.accounts.usdc_vault.key();
        c.xnt_decimals = ctx.accounts.xnt_mint.decimals;
        c.usdc_decimals = ctx.accounts.usdc_mint.decimals;
        c.buy = buy;
        c.sell = sell;
        c.paused = false;
        c.bump = ctx.bumps.config;
        emit!(RatesChanged { buy, sell });
        Ok(())
    }

    pub fn buy(ctx: Context<Swap>, usdc_in: u64, min_xnt_out: u64) -> Result<()> {
        let c = &ctx.accounts.config;
        require!(!c.paused, SwapError::Paused);
        require!(usdc_in > 0, SwapError::ZeroAmount);
        let xnt_out = quote(usdc_in, c.buy, c.xnt_decimals, c.usdc_decimals)?;
        require!(xnt_out > 0, SwapError::ZeroAmount);
        require!(xnt_out >= min_xnt_out, SwapError::SlippageExceeded);
        require!(ctx.accounts.xnt_vault.amount >= xnt_out, SwapError::InsufficientLiquidity);

        let a = &ctx.accounts;
        user_to_vault(&a.token_program_usdc, &a.user_usdc, &a.usdc_vault, &a.usdc_mint, &a.user, usdc_in)?;
        vault_to_user(&a.token_program_xnt, &a.xnt_vault, &a.user_xnt, &a.xnt_mint, &a.config, xnt_out)?;
        emit!(Swapped { user: a.user.key(), is_buy: true, amount_in: usdc_in, amount_out: xnt_out });
        Ok(())
    }

    pub fn sell(ctx: Context<Swap>, xnt_in: u64, min_usdc_out: u64) -> Result<()> {
        let c = &ctx.accounts.config;
        require!(!c.paused, SwapError::Paused);
        require!(xnt_in > 0, SwapError::ZeroAmount);
        let usdc_out = quote(xnt_in, c.sell, c.usdc_decimals, c.xnt_decimals)?;
        require!(usdc_out > 0, SwapError::ZeroAmount);
        require!(usdc_out >= min_usdc_out, SwapError::SlippageExceeded);
        require!(ctx.accounts.usdc_vault.amount >= usdc_out, SwapError::InsufficientLiquidity);

        let a = &ctx.accounts;
        user_to_vault(&a.token_program_xnt, &a.user_xnt, &a.xnt_vault, &a.xnt_mint, &a.user, xnt_in)?;
        vault_to_user(&a.token_program_usdc, &a.usdc_vault, &a.user_usdc, &a.usdc_mint, &a.config, usdc_out)?;
        emit!(Swapped { user: a.user.key(), is_buy: false, amount_in: xnt_in, amount_out: usdc_out });
        Ok(())
    }

    /// Anyone may deposit liquidity (donation); admin uses this to fund vaults.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, SwapError::ZeroAmount);
        let a = &ctx.accounts;
        user_to_vault(&a.token_program, &a.from, &a.vault, &a.mint, &a.depositor, amount)?;
        emit!(Liquidity { mint: a.mint.key(), amount, deposit: true });
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, SwapError::ZeroAmount);
        require!(ctx.accounts.vault.amount >= amount, SwapError::InsufficientLiquidity);
        let a = &ctx.accounts;
        vault_to_user(&a.token_program, &a.vault, &a.to, &a.mint, &a.config, amount)?;
        emit!(Liquidity { mint: a.mint.key(), amount, deposit: false });
        Ok(())
    }

    pub fn set_rates(ctx: Context<AdminOnly>, buy: Rate, sell: Rate) -> Result<()> {
        buy.validate()?;
        sell.validate()?;
        let c = &mut ctx.accounts.config;
        c.buy = buy;
        c.sell = sell;
        emit!(RatesChanged { buy, sell });
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(PausedChanged { paused });
        Ok(())
    }

    pub fn propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.config.pending_admin = new_admin;
        Ok(())
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        require!(c.pending_admin != Pubkey::default(), SwapError::Unauthorized);
        require_keys_eq!(c.pending_admin, ctx.accounts.new_admin.key(), SwapError::Unauthorized);
        let old = c.admin;
        c.admin = c.pending_admin;
        c.pending_admin = Pubkey::default();
        emit!(AdminChanged { old, new: c.admin });
        Ok(())
    }
}

/// out = amount_in * num * 10^out_dec / (den * 10^in_dec), rounded down.
pub fn quote(amount_in: u64, rate: Rate, out_dec: u8, in_dec: u8) -> Result<u64> {
    let p_out = 10u128.checked_pow(out_dec as u32).ok_or(SwapError::MathOverflow)?;
    let p_in = 10u128.checked_pow(in_dec as u32).ok_or(SwapError::MathOverflow)?;
    let n = (amount_in as u128)
        .checked_mul(rate.num as u128).ok_or(SwapError::MathOverflow)?
        .checked_mul(p_out).ok_or(SwapError::MathOverflow)?;
    let d = (rate.den as u128).checked_mul(p_in).ok_or(SwapError::MathOverflow)?;
    u64::try_from(n / d).map_err(|_| error!(SwapError::MathOverflow))
}

fn user_to_vault<'info>(
    tp: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    auth: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    transfer_checked(
        CpiContext::new(tp.to_account_info(), TransferChecked {
            from: from.to_account_info(), mint: mint.to_account_info(),
            to: to.to_account_info(), authority: auth.to_account_info(),
        }),
        amount, mint.decimals,
    )
}

fn vault_to_user<'info>(
    tp: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    config: &Account<'info, Config>,
    amount: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[config.bump]];
    transfer_checked(
        CpiContext::new_with_signer(tp.to_account_info(), TransferChecked {
            from: from.to_account_info(), mint: mint.to_account_info(),
            to: to.to_account_info(), authority: config.to_account_info(),
        }, &[seeds]),
        amount, mint.decimals,
    )
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct Rate {
    pub num: u64,
    pub den: u64,
}
impl Rate {
    pub fn validate(&self) -> Result<()> {
        require!(self.num > 0 && self.den > 0, SwapError::InvalidRate);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub xnt_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub xnt_vault: Pubkey,
    pub usdc_vault: Pubkey,
    pub xnt_decimals: u8,
    pub usdc_decimals: u8,
    pub buy: Rate,
    pub sell: Rate,
    pub paused: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mint::token_program = token_program_xnt)]
    pub xnt_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::token_program = token_program_usdc)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = admin, associated_token::mint = xnt_mint,
        associated_token::authority = config, associated_token::token_program = token_program_xnt)]
    pub xnt_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = admin, associated_token::mint = usdc_mint,
        associated_token::authority = config, associated_token::token_program = token_program_usdc)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program_xnt: Interface<'info, TokenInterface>,
    pub token_program_usdc: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump,
        has_one = xnt_mint, has_one = usdc_mint, has_one = xnt_vault, has_one = usdc_vault)]
    pub config: Account<'info, Config>,
    #[account(mint::token_program = token_program_xnt)]
    pub xnt_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::token_program = token_program_usdc)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub xnt_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = xnt_mint, token::authority = user, token::token_program = token_program_xnt)]
    pub user_xnt: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = usdc_mint, token::authority = user, token::token_program = token_program_usdc)]
    pub user_usdc: InterfaceAccount<'info, TokenAccount>,
    pub token_program_xnt: Interface<'info, TokenInterface>,
    pub token_program_usdc: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub depositor: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mint::token_program = token_program,
        constraint = mint.key() == config.xnt_mint || mint.key() == config.usdc_mint @ SwapError::WrongMint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = config,
        associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = depositor, token::token_program = token_program)]
    pub from: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ SwapError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mint::token_program = token_program,
        constraint = mint.key() == config.xnt_mint || mint.key() == config.usdc_mint @ SwapError::WrongMint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = config,
        associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub to: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ SwapError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[event]
pub struct Swapped { pub user: Pubkey, pub is_buy: bool, pub amount_in: u64, pub amount_out: u64 }
#[event]
pub struct RatesChanged { pub buy: Rate, pub sell: Rate }
#[event]
pub struct PausedChanged { pub paused: bool }
#[event]
pub struct Liquidity { pub mint: Pubkey, pub amount: u64, pub deposit: bool }
#[event]
pub struct AdminChanged { pub old: Pubkey, pub new: Pubkey }

#[error_code]
pub enum SwapError {
    #[msg("Swaps are paused")] Paused,
    #[msg("Amount must be > 0")] ZeroAmount,
    #[msg("Output below minimum (slippage)")] SlippageExceeded,
    #[msg("Vault has insufficient liquidity")] InsufficientLiquidity,
    #[msg("Math overflow")] MathOverflow,
    #[msg("Rate numerator and denominator must be > 0")] InvalidRate,
    #[msg("Unauthorized")] Unauthorized,
    #[msg("Mint is not XNT or USDC.X")] WrongMint,
}
