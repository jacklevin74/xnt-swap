//! xdex_router (X1 testnet, dev-only): buys/sells native XNT (wrapped mint So111...)
//! by CPI-ing xDEX (Raydium CP-Swap fork) swap_base_input with the user as signer.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke};

declare_id!("CmivyhYDe5X4yXTNwjaT6kzeb2tADNoZvtngXaT1tWpD");

/// xDEX testnet program.
pub const XDEX_PROGRAM: Pubkey = pubkey!("7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf");
/// Native (wrapped) XNT mint.
pub const WXNT_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
const SWAP_BASE_INPUT: [u8; 8] = [0x8f, 0xbe, 0x5a, 0xda, 0xc4, 0x1e, 0x33, 0xde];

#[program]
pub mod xdex_router {
    use super::*;
    /// Spend `amount_in` of the quote token, receive at least `min_out` wrapped XNT.
    pub fn buy_xnt(ctx: Context<XdexSwap>, amount_in: u64, min_out: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.output_mint.key(), WXNT_MINT, RouterError::WrongMint);
        cpi_swap(&ctx, amount_in, min_out)
    }
    /// Spend `amount_in` wrapped XNT, receive at least `min_out` of the quote token.
    pub fn sell_xnt(ctx: Context<XdexSwap>, amount_in: u64, min_out: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.input_mint.key(), WXNT_MINT, RouterError::WrongMint);
        cpi_swap(&ctx, amount_in, min_out)
    }
}

fn cpi_swap(ctx: &Context<XdexSwap>, amount_in: u64, min_out: u64) -> Result<()> {
    require!(amount_in > 0, RouterError::ZeroAmount);
    let a = &ctx.accounts;
    let mut data = SWAP_BASE_INPUT.to_vec();
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&min_out.to_le_bytes());
    // Account order verified against a real xDEX testnet swap_base_input tx.
    let metas = vec![
        AccountMeta::new_readonly(a.user.key(), true),
        AccountMeta::new_readonly(a.authority.key(), false),
        AccountMeta::new_readonly(a.amm_config.key(), false),
        AccountMeta::new(a.pool_state.key(), false),
        AccountMeta::new(a.input_token_account.key(), false),
        AccountMeta::new(a.output_token_account.key(), false),
        AccountMeta::new(a.input_vault.key(), false),
        AccountMeta::new(a.output_vault.key(), false),
        AccountMeta::new_readonly(a.input_token_program.key(), false),
        AccountMeta::new_readonly(a.output_token_program.key(), false),
        AccountMeta::new_readonly(a.input_mint.key(), false),
        AccountMeta::new_readonly(a.output_mint.key(), false),
        AccountMeta::new(a.observation_state.key(), false),
    ];
    let ix = Instruction { program_id: XDEX_PROGRAM, accounts: metas, data };
    invoke(&ix, &[
        a.user.to_account_info(), a.authority.to_account_info(), a.amm_config.to_account_info(),
        a.pool_state.to_account_info(), a.input_token_account.to_account_info(),
        a.output_token_account.to_account_info(), a.input_vault.to_account_info(),
        a.output_vault.to_account_info(), a.input_token_program.to_account_info(),
        a.output_token_program.to_account_info(), a.input_mint.to_account_info(),
        a.output_mint.to_account_info(), a.observation_state.to_account_info(),
        a.xdex_program.to_account_info(),
    ])?;
    Ok(())
}

/// All pool accounts are validated by xDEX itself; we only pin the xDEX program id and mints.
#[derive(Accounts)]
pub struct XdexSwap<'info> {
    pub user: Signer<'info>,
    /// CHECK: xDEX authority PDA (validated by xDEX)
    pub authority: UncheckedAccount<'info>,
    /// CHECK: validated by xDEX
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK: validated by xDEX
    #[account(mut)] pub pool_state: UncheckedAccount<'info>,
    /// CHECK: user's input token account
    #[account(mut)] pub input_token_account: UncheckedAccount<'info>,
    /// CHECK: user's output token account
    #[account(mut)] pub output_token_account: UncheckedAccount<'info>,
    /// CHECK: validated by xDEX
    #[account(mut)] pub input_vault: UncheckedAccount<'info>,
    /// CHECK: validated by xDEX
    #[account(mut)] pub output_vault: UncheckedAccount<'info>,
    /// CHECK: token program for input mint
    pub input_token_program: UncheckedAccount<'info>,
    /// CHECK: token program for output mint
    pub output_token_program: UncheckedAccount<'info>,
    /// CHECK: input mint
    pub input_mint: UncheckedAccount<'info>,
    /// CHECK: output mint
    pub output_mint: UncheckedAccount<'info>,
    /// CHECK: validated by xDEX
    #[account(mut)] pub observation_state: UncheckedAccount<'info>,
    /// CHECK: pinned to xDEX program id
    #[account(address = XDEX_PROGRAM)] pub xdex_program: UncheckedAccount<'info>,
}

#[error_code]
pub enum RouterError {
    #[msg("Mint does not match direction (XNT side must be wrapped XNT)")] WrongMint,
    #[msg("amount_in must be > 0")] ZeroAmount,
}
