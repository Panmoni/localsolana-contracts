# Notes

- get some good and complete tests

## WalkThru
- review code line by line before putting on devnet

### clear devnet deployment

https://explorer.solana.com/address/4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x?cluster=devnet

will need to clear this

## Presentation
- make a mermaid chart for this or use solidity one?
- detailed readme

## Post MVP
- Consider adding InvalidTokenMint for token-related CPI calls to catch mint mismatches explicitly.
- TODO: Remove #[derive(Debug)] once you’re confident Borsh serialization is stable (it’s only needed for debugging). from escrow struct

### fund_escrow:
Good: Correct CPI token transfer, state transition to Funded, and fiat deadline calculation.

Concern: init_if_needed on escrow_token_account might allow re-initialization if the account exists with different parameters. Consider using init and pre-creating the account (e.g., via a separate instruction) for stricter control.

Suggestion: Add a mint check (escrow_token_account.mint == seller_token_account.mint) to ensure token consistency.

### release_escrow:
Good: Handles sequential trades correctly, splits principal and fee, and uses PDA signer seeds properly.

Note: sequential_escrow_token_account is optional, which is fine since it’s only required for sequential trades.

Suggestion: Add a check for escrow_to

### open_dispute_with_bond:
Good: Validates state, calculates bond, and transfers it to the correct PDA. Evidence hash assignment is conditional and secure.

Suggestion: Add a check for dispute_initiated_time.is_none() to prevent re-opening a dispute.

### respond_to_dispute_with_bond:
Good: Ensures no duplicate evidence, enforces response deadline, and handles bond transfer.

Note: _arbitration_deadline is calculated but unused—either use it (e.g., store in escrow) or remove it.

### default_judgment:
Good: Correctly awards funds and bond to the party that submitted evidence if the other defaults.

Concern: Assumes only one party submitted evidence; the InvalidState error for both responding is appropriate but could be more descriptive (e.g., BothPartiesResponded).

Feedback: Bond seed handling is complex but correct with separate arrays.

### resolve_dispute_with_explanation:
Good: Comprehensive logic for splitting funds, returning winner’s bond, and penalizing the loser. Sequential trade support is included in the event.

Note: explanation_reference is a placeholder string—consider passing it as an argument if off-chain storage is planned.

Suggestion: Add a deadline check (ARBITRATION_DEADLINE_HOURS) to prevent late resolutions.

Suggestion: For FundEscrow, add rent and system_program to the struct (already present but not used explicitly—Anchor needs them for init).

Suggestion: Add counter to all events for consistency (missing in some like FiatMarkedPaid).

### Potential Improvements
Token Mint Consistency:
Add checks in FundEscrow, ReleaseEscrow, etc., to ensure all token accounts use the same mint (e.g., escrow_token_account.mint == seller_token_account.mint).

Deadline Enforcement:
Store and enforce ARBITRATION_DEADLINE_HOURS in resolve_dispute_with_explanation to prevent late arbitrator decisions.

Bond Account Initialization:
Require initialize_buyer_bond_account and initialize_seller_bond_account to be called before open_dispute_with_bond (e.g., via a state check or balance validation).

Event Consistency:
Add counter to all events and consider including state for debugging.

Error Messages:
Enhance specificity (e.g., InvalidState could specify “Both parties responded” in default_judgment).

Sequential Trade Robustness:
In release_escrow, verify sequential_escrow_token_account mint matches escrow_token_account.mint when sequential.

Space Optimization:
If compute units become an issue, calculate exact serialized size (331 bytes max) instead of std::mem::size_of::<Escrow>() (~336 bytes with padding).

## Ref

### Inspect

solana account 53Mz4ZLrNDBL1wqvJBhfSuXW8Pg1ND8vwxWoTwGwPAU5 --url http://localhost:8899

### Transfer
solana transfer --from /home/george5492/.config/solana/id.json 9KxEUVkoJVrE2nKadJomSNkgSsksgGvRavSJy3eJUdtQ 1 --allow-unfunded-recipient --url devnet

### Build, Deploy, Test Routine
anchor clean
cargo clean
mkdir -p target/deploy
cp keys/program-devnet/program-keypair.json target/deploy/simple_escrow-keypair.json
rm -rf test-ledger/*
<!-- stop validator -->
anchor build
solana-test-validator
anchor deploy
anchor test --skip-local-validator
