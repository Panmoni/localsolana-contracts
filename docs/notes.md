# Notes

## Disputes
- evidence hashes not being stored properly in escrow account state
- tests for disputes, incl events

## Docs
- rename repo to yapbay-contracts-rust
- update github, anchor.toml, etc
- update README, docs to account for tracked_balance, EscrowBalanceChanged event, SequentialAddressUpdated, enriched events.

## Future
- add security.txt, security policy, etc
- mismatches between IDL and tests, linter errors in tests
- Learn from adstream program
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
- more tests
- devnet tests result in loss of 1 USDC

## Ref

### devnet
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/repos/ls-contracts-fixed/keys/devnet/program-keypair.json
solana program show 4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x --url devnet

#### check token balances
spl-token accounts -v --owner DyKS1ywHcLwJCNFgY8yxN2pRRgnkpu3YwKAttuy9kdLP --url devnet
spl-token accounts -v --owner BdRe6PgopWpmdsh6ZNbjwZTeN7i7vx8jLkcqJ6oLVERK --url devnet
spl-token balance 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --owner /home/george5492/repos/ls-contracts-fixed/keys/buyer-devnet/buyer-keypair.json

#### transfer tokens
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 1 FN7L7W7eiGMveGSiaxHoZ6ySBFV6akY3JtnTPsTNgWrt --url devnet --fund-recipient

##### send from buyer to seller
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 20.5 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 --url devnet --owner /home/george5492/repos/ls-contracts-fixed/keys/buyer-devnet/buyer-keypair.json

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

### devnet
configure Anchor.toml and .env properly for devnet
solana config get to double check
ensure deploying keypair has sufficient sol
https://explorer.solana.com/?cluster=devnet
// to override
anchor deploy --program-name localsolana_contracts --program-keypair /home/george5492/repos/ls-contracts-fixed/keys/program-devnet/program-keypair.json
anchor test --skip-deploy
