# Notes

## Mainnet ToDo, Post MVP Testing
- will need to actually integrate USDC
- make it fully gasless, incl rent costs
- integrate automatic payments of referral fees?

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
anchor deploy
anchor test --skip-local-validator
