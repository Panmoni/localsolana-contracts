use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};

declare_id!("5LxYw7DHAhVNSLpECNvnrkkmrSBW3PZiLS6fwzXBSyBX");

#[program]
pub mod multiple_pda_example {
    use super::*;

    // Initialize function creates the vault and authority PDAs
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Store bumps in the state account for later use
        let vault_bump = ctx.bumps.vault;
        let authority_bump = ctx.bumps.authority;

        ctx.accounts.state.vault_bump = vault_bump;
        ctx.accounts.state.authority_bump = authority_bump;

        msg!("Vault bump: {}", vault_bump);
        msg!("Authority bump: {}", authority_bump);

        Ok(())
    }

    // Deposit function transfers tokens to the vault
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Create transfer instruction
        let transfer_instruction = Transfer {
            from: ctx.accounts.user_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        // Execute transfer
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );

        token::transfer(cpi_ctx, amount)?;

        // Update state
        ctx.accounts.state.total_deposited += amount;

        Ok(())
    }

    // Withdraw function transfers tokens from the vault using PDA signing
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // Get the authority bump from the state
        let authority_bump = ctx.accounts.state.authority_bump;

        // Create seeds for signing
        let authority_seeds = &[
            b"authority".as_ref(),
            ctx.accounts.state.to_account_info().key.as_ref(),
            &[authority_bump],
        ];

        // Create signer seeds array
        let signer_seeds = &[&authority_seeds[..]];

        // Create transfer instruction
        let transfer_instruction = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_token.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        // Execute transfer with PDA signing
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            signer_seeds,
        );

        token::transfer(cpi_ctx, amount)?;

        // Update state
        ctx.accounts.state.total_withdrawn += amount;

        Ok(())
    }

    // Example of using multiple PDAs in a single transaction
    pub fn complex_operation(ctx: Context<ComplexOperation>) -> Result<()> {
        // Get bumps from ctx.bumps
        let vault_bump = ctx.bumps.vault;
        let authority_bump = ctx.bumps.authority;

        // Create seeds for vault signing
        let vault_seeds = &[
            b"vault".as_ref(),
            ctx.accounts.state.to_account_info().key.as_ref(),
            &[vault_bump],
        ];

        // Create seeds for authority signing
        let authority_seeds = &[
            b"authority".as_ref(),
            ctx.accounts.state.to_account_info().key.as_ref(),
            &[authority_bump],
        ];

        // Create signer seeds arrays
        let vault_signer_seeds = &[&vault_seeds[..]];
        let authority_signer_seeds = &[&authority_seeds[..]];

        // Use the PDAs for signing in different operations
        // (This is just an example, not actual code that would make sense)
        msg!("Vault signer seeds: {:?}", vault_signer_seeds);
        msg!("Authority signer seeds: {:?}", authority_signer_seeds);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + 8 + 8 + 1 + 1, // Discriminator + 2 u64s + 2 bumps
    )]
    pub state: Account<'info, StateAccount>,

    #[account(
        init,
        payer = user,
        seeds = [b"vault", state.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = authority,
    )]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(
        seeds = [b"authority", state.key().as_ref()],
        bump,
    )]
    /// CHECK: This is a PDA used as a signer
    pub authority: UncheckedAccount<'info>,

    pub mint: Account<'info, token::Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub user: Signer<'info>,

    #[account(mut)]
    pub state: Account<'info, StateAccount>,

    #[account(
        mut,
        seeds = [b"vault", state.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(
        mut,
        constraint = user_token.owner == user.key(),
    )]
    pub user_token: Account<'info, token::TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub user: Signer<'info>,

    #[account(mut)]
    pub state: Account<'info, StateAccount>,

    #[account(
        mut,
        seeds = [b"vault", state.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(
        seeds = [b"authority", state.key().as_ref()],
        bump,
    )]
    /// CHECK: This is a PDA used as a signer
    pub authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = user_token.owner == user.key(),
    )]
    pub user_token: Account<'info, token::TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ComplexOperation<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub state: Account<'info, StateAccount>,

    #[account(
        mut,
        seeds = [b"vault", state.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(
        seeds = [b"authority", state.key().as_ref()],
        bump,
    )]
    /// CHECK: This is a PDA used as a signer
    pub authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct StateAccount {
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub vault_bump: u8,
    pub authority_bump: u8,
}
