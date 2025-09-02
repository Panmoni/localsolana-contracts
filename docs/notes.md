# Notes

- rename repo to yapbay-contracts-rust

## Tests
- update tests
- Test invalid inputs (e.g., missing fields, bad public keys) and verify error responses (API)
- address other suggestions
- re-run

## Types
- add 0.1.2 IDL/types to frontend

## Docs
- update README, docs to account for tracked_balance, EscrowBalanceChanged event, SequentialAddressUpdated, enriched events.

## Future
- Learn from https://github.com/eucalyptustech/adstream-app
- https://github.com/codama-idl/codama
- https://github.com/DecalLabs/gill
- fully gasless
- admin controls?
- Upgradeability
- EscrowConfig PDA (program-level state)
- initialize_config(owner, arbitrator, version)
- set_paused(bool) (only owner)
- set_arbitrator(Pubkey) (only owner)
- Emit ConfigUpdated event


## Ref

### devnet
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/repos/ls-contracts-fixed/keys/devnet/program-keypair.json
solana program show 4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x --url devnet

#### check token balances
spl-token accounts -v --owner DyKS1ywHcLwJCNFgY8yxN2pRRgnkpu3YwKAttuy9kdLP --url devnet
spl-token accounts -v --owner BdRe6PgopWpmdsh6ZNbjwZTeN7i7vx8jLkcqJ6oLVERK --url devnet

#### transfer tokens
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 1 FN7L7W7eiGMveGSiaxHoZ6ySBFV6akY3JtnTPsTNgWrt --url devnet --fund-recipient

### Inspect

solana account 53Mz4ZLrNDBL1wqvJBhfSuXW8Pg1ND8vwxWoTwGwPAU5 --url http://localhost:8899

### Airdrop Localnet
solana airdrop 100

### Transfer
solana transfer --from ~/.config/solana/id.json 9KxEUVkoJVrE2nKadJomSNkgSsksgGvRavSJy3eJUdtQ 1 --allow-unfunded-recipient --url devnet

### Build, Deploy, Test Routine
anchor clean
cargo clean
mkdir -p target/deploy
cp keys/program-devnet/program-keypair.json target/deploy/simple_escrow-keypair.json
<!-- stop previous validator -->
rm -rf test-ledger/*
anchor build
solana-test-validator
solana address -k target/deploy/localsolana_contracts-keypair.json // gen declare_id, update Anchor.toml if necessary
anchor deploy
update `updateexpectedProgramId` in tests if needed
anchor test --skip-local-validator --skip-deploy
