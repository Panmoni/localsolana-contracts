use anchor_lang::prelude::*;

declare_id!("5LxYw7DHAhVNSLpECNvnrkkmrSBW3PZiLS6fwzXBSyBX"); // Replace with your actual program ID

#[program]
pub mod bump_seed_example {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Access the bump seed directly
        let bump = ctx.bumps.my_pda_account;

        // PDA seeds
        let seeds = &[
            b"my-seed",
            ctx.accounts.user.key.as_ref(),
            &[bump],
        ];

        // Store the bump in the account for demonstration purposes
        ctx.accounts.my_pda_account.bump = bump;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The user initializing the account
    #[account(mut)]
    pub user: Signer<'info>,

    /// The PDA account to be initialized
    #[account(
        init,
        payer = user,
        seeds = [b"my-seed", user.key.as_ref()],
        bump,
        space = 8 + 1, // Account discriminator + 1 byte for the bump
    )]
    pub my_pda_account: Account<'info, MyPdaAccount>,

    /// System program required for account creation
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MyPdaAccount {
    pub bump: u8,
}
