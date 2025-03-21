# Notes

## devnet cleanup
- clean up final 3 tests and get 20/20 passing
- cleanup escrows from testing
- recover devnet USDC lost thru testing, get more.

#### 1. "Opens dispute as buyer" — InvalidEvidenceHash (Error 6012)
- **Error**: `AnchorError: InvalidEvidenceHash` at `lib.rs:914`
- **Line**: 1080 (`openDisputeWithBond`)
- **Problem**: The evidence hash `Buffer.from("buyer_evidence_hash_123456789012", "utf8")` is 32 bytes, but your Rust code rejects it. It’s expecting a *different* validation — likely a hash with varied bytes, not a repeating or static string. The old `Buffer.alloc(32, "buyer_evidence")` failed for the same reason: too uniform.
- **Impact**: Test fails before it can check the dispute logic. Annoying, but fixable.

#### 2. "Responds to dispute as seller" — Assertion Failure
- **Error**: `Seller evidence hash should be set` — `assert.notEqual` fails
- **Line**: 1232
- **Problem**: You set `buyerEvidenceHash` and `sellerEvidenceHash` to the *same value* (`"buyer_evidence_hash_123456789012"`), then assert they’re different. The test expects the seller’s hash in the escrow account (`disputeEvidenceHashSeller`) to differ from the buyer’s (`buyerEvidenceHash`), but they’re identical, so the assertion bombs.
- **Impact**: Logic’s fine, but the test’s dumbass setup breaks it.

#### 3. "Fails to fund escrow twice" — InsufficientFunds (Error 6009)
- **Error**: `AnchorError: InsufficientFunds` at `lib.rs:199`
- **Line**: 1735 (`fundEscrow` first call)
- **Problem**: Seller’s USDC balance is 0.5 (500,000 lamports), but `fundEscrow` needs 1.01 USDC (1,010,000 lamports) — principal (1,000,000) + fee (10,000). By the time this test runs, funds are drained from prior tests, and the 2 USDC transfer from buyer can’t save it because it’s too late or not enough.
- **Impact**: Test can’t even start the double-funding check. Funds management’s the culprit.

---



### Fixes: Fast and Dirty

#### Fix 1: "Opens dispute as buyer"
- **Change**: Use a random 32-byte hash to satisfy the program’s validation.
- **Code** (line ~1078):
  ```javascript
  const evidenceHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  ```

#### Fix 2: "Responds to dispute as seller"
- **Change**: Make `sellerEvidenceHash` distinct from `buyerEvidenceHash`.
- **Code** (line ~1193):
  ```javascript
  const buyerEvidenceHash = Buffer.from("buyer_evidence_hash_123456789012", "utf8"); // 32 bytes
  const sellerEvidenceHash = Buffer.from("seller_evidence_hash_987654321098", "utf8"); // 32 bytes, different
  ```
- **Why**: The assertion checks `disputeEvidenceHashSeller != buyerEvidenceHash`, so they can’t be the same.

#### Fix 3: "Fails to fund escrow twice"
- **Change**: Boost seller’s funds before the test by transferring more USDC from buyer, and do it early.
- **Code** (line ~1728, before `tx1`):
  ```javascript
  // Transfer 5 USDC from buyer to seller to cover multiple fundings
  const prepTx = await token.transfer(
    provider.connection,
    buyer,
    buyerTokenAccount,
    sellerTokenAccount,
    buyer,
    5000000 // 5 USDC
  );
  await provider.connection.confirmTransaction(prepTx, "confirmed");
  await sleep(10000);
  ```
- **Remove**: The later 2 USDC transfer (line ~1757) — it’s redundant now.
- **Why**: Seller starts with 0.5 USDC, burns through it in prior tests, and 2 USDC wasn’t enough or timed wrong. 5 USDC ensures it can handle 1.01 USDC twice if needed.

---

### Other Dispute Tests (Consistency)
Apply the random hash fix to these too:
- **"Resolves dispute with buyer winning"** (line ~1290):
  ```javascript
  const buyerEvidenceHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  const sellerEvidenceHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  const resolutionHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  ```
- **"Resolves dispute with seller winning"** (line ~1418):
  ```javascript
  const buyerEvidenceHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  const sellerEvidenceHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  const resolutionHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
  ```

---

### Updated Test File Snippet
Here’s the corrected sections:

```javascript
// "Opens dispute as buyer" (line ~1070)
it("Opens dispute as buyer", async () => {
  const escrowId = generateRandomId();
  const tradeId = generateRandomId();
  const amount = new BN(1000000);
  const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);
  const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
  const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);
  const evidenceHash = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));

  // ... rest unchanged ...
});

// "Responds to dispute as seller" (line ~1185)
it("Responds to dispute as seller", async () => {
  const escrowId = generateRandomId();
  const tradeId = generateRandomId();
  const amount = new BN(1000000);
  const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);
  const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
  const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);
  const buyerEvidenceHash = Buffer.from("buyer_evidence_hash_123456789012", "utf8");
  const sellerEvidenceHash = Buffer.from("seller_evidence_hash_987654321098", "utf8");

  // ... rest unchanged ...
});

// "Fails to fund escrow twice" (line ~1715)
it("Fails to fund escrow twice (reinitialization prevented)", async () => {
  const escrowId = generateRandomId();
  const tradeId = generateRandomId();
  const amount = new BN(1000000);
  const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

  console.log("=== Reinitialization Prevention ===");
  // Transfer 5 USDC from buyer to seller to cover multiple fundings
  const prepTx = await token.transfer(
    provider.connection,
    buyer,
    buyerTokenAccount,
    sellerTokenAccount,
    buyer,
    5000000 // 5 USDC
  );
  await provider.connection.confirmTransaction(prepTx, "confirmed");
  await sleep(10000);

  const tx1 = await program.methods
    .createEscrow(escrowId, tradeId, amount, false, null)
    // ... rest unchanged until second fundEscrow ...
  // Remove the 2 USDC transfer (line ~1757)
});
```

---





## Roadmap
- integrate real USDC
- make it fully gasless, incl rent costs

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
