import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as token from "@solana/spl-token";
import { LocalsolanaContracts } from "../target/types/localsolana_contracts";

dotenv.config();

function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(process.env.HOME || process.env.USERPROFILE || ".", filePath.slice(1))
    : filePath;
  const secretKeyString = fs.readFileSync(absolutePath, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

const seller = loadKeypair(process.env.SELLER_KEYPAIR || "");
const buyer = loadKeypair(process.env.BUYER_KEYPAIR || "");
const arbitrator = loadKeypair(process.env.ARBITRATOR_KEYPAIR || "");

console.log("=== Keypair Checking ===");
console.log("Seller pubkey:", seller.publicKey.toBase58());
console.log("Buyer pubkey:", buyer.publicKey.toBase58());
console.log("Arbitrator pubkey:", arbitrator.publicKey.toBase58());

let escrowIdCounter = 1;
let tokenMint: PublicKey;
let sellerTokenAccount: PublicKey;
let buyerTokenAccount: PublicKey;
let arbitratorTokenAccount: PublicKey;

describe("Localsolana Contracts Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LocalsolanaContracts as Program<LocalsolanaContracts>;
  const expectedProgramId = new PublicKey("4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x");

  const deriveEscrowPDA = (escrowId: BN, tradeId: BN): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        escrowId.toArrayLike(Buffer, "le", 8),
        tradeId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

  const deriveEscrowTokenPDA = (escrowKey: PublicKey): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_token"), escrowKey.toBuffer()],
      program.programId
    );

  const deriveBuyerBondPDA = (escrowKey: PublicKey): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("buyer_bond"), escrowKey.toBuffer()],
      program.programId
    );

  const deriveSellerBondPDA = (escrowKey: PublicKey): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("seller_bond"), escrowKey.toBuffer()],
      program.programId
    );

  async function ensureFunds(publicKey: PublicKey, minLamports: number = 5 * LAMPORTS_PER_SOL): Promise<void> {
    console.log(`Balance for ${publicKey.toBase58()}: ${await provider.connection.getBalance(publicKey)} lamports`);
    const balance = await provider.connection.getBalance(publicKey);
    if (balance < minLamports) {
      console.log(`Requesting airdrop for ${publicKey.toBase58()} (${minLamports} lamports)...`);
      const sig = await provider.connection.requestAirdrop(publicKey, minLamports);
      await provider.connection.confirmTransaction(sig);
      const newBalance = await provider.connection.getBalance(publicKey);
      console.log(`Airdrop complete. New balance: ${newBalance} lamports`);
      assert(newBalance >= minLamports, `Airdrop failed: Balance ${newBalance} < ${minLamports}`);
    }
  }

  before(async () => {
    assert(
      program.programId.equals(expectedProgramId),
      `Program ID mismatch: ${program.programId.toBase58()} != ${expectedProgramId.toBase58()}`
    );

    console.log("=== Balance Checking ===");
    await Promise.all([
      ensureFunds(seller.publicKey),
      ensureFunds(buyer.publicKey),
      ensureFunds(arbitrator.publicKey),
    ]);

    console.log("=== Token Generation ===");
    console.log("Creating token mint...");
    tokenMint = await token.createMint(
      provider.connection,
      seller,
      seller.publicKey,
      null,
      6
    );
    console.log("Token mint created:", tokenMint.toBase58());

    console.log("Creating seller token account...");
    sellerTokenAccount = await token.createAccount(
      provider.connection,
      seller,
      tokenMint,
      seller.publicKey
    );
    console.log("Seller token account:", sellerTokenAccount.toBase58());

    console.log("Creating buyer token account...");
    buyerTokenAccount = await token.createAccount(
      provider.connection,
      buyer,
      tokenMint,
      buyer.publicKey
    );
    console.log("Buyer token account:", buyerTokenAccount.toBase58());

    console.log("Creating arbitrator token account...");
    arbitratorTokenAccount = await token.createAccount(
      provider.connection,
      arbitrator,
      tokenMint,
      arbitrator.publicKey
    );
    console.log("Arbitrator token account:", arbitratorTokenAccount.toBase58());

    console.log("Minting tokens to seller...");
    await token.mintTo(
      provider.connection,
      seller,
      tokenMint,
      sellerTokenAccount,
      seller.publicKey,
      1000000000
    );

    console.log("Minting tokens to buyer...");
    await token.mintTo(
      provider.connection,
      seller,
      tokenMint,
      buyerTokenAccount,
      seller.publicKey,
      1000000000
    );

    const sellerBalance = await provider.connection.getTokenAccountBalance(sellerTokenAccount);
    console.log("Seller token balance:", sellerBalance.value.uiAmount);
    const buyerBalance = await provider.connection.getTokenAccountBalance(buyerTokenAccount);
    console.log("Buyer token balance:", buyerBalance.value.uiAmount);
  });

  // Step 3 Tests
  it("Creates a basic escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);

    console.log("=== Escrow Creation ===");
    console.log("Creating escrow with PDA:", escrowPDA.toBase58());
    const sellerBalanceBefore = await provider.connection.getBalance(seller.publicKey);
    console.log(`Seller balance before: ${sellerBalanceBefore} lamports`);

    const tx = await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    console.log("Transaction signature:", tx);
    const sellerBalanceAfter = await provider.connection.getBalance(seller.publicKey);
    console.log(`Seller balance after: ${sellerBalanceAfter} lamports`);

    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.equal(escrowAccount.escrowId.toString(), escrowId.toString(), "Escrow ID mismatch");
    assert.equal(escrowAccount.tradeId.toString(), tradeId.toString(), "Trade ID mismatch");
    assert.equal(escrowAccount.seller.toBase58(), seller.publicKey.toBase58(), "Seller mismatch");
    assert.equal(escrowAccount.buyer.toBase58(), buyer.publicKey.toBase58(), "Buyer mismatch");
    assert.equal(escrowAccount.arbitrator.toBase58(), "GGrXhNVxUZXaA2uMopsa5q23aPmoNvQF14uxqo8qENUr", "Arbitrator mismatch");
    assert.equal(escrowAccount.amount.toString(), amount.toString(), "Amount mismatch");
    assert.equal(escrowAccount.fee.toString(), amount.div(new BN(100)).toString(), "Fee mismatch");
    assert(escrowAccount.depositDeadline.gtn(0), "Deposit deadline not set");
    assert.equal(escrowAccount.fiatDeadline.toString(), "0", "Fiat deadline should be 0");
    assert.deepEqual(escrowAccount.state, { created: {} }, "State should be Created");
    assert.equal(escrowAccount.sequential, false, "Sequential should be false");
    assert.isNull(escrowAccount.sequentialEscrowAddress, "Sequential address should be null");
    assert.isFalse(escrowAccount.fiatPaid, "Fiat paid should be false");
    assert.equal(escrowAccount.counter.toString(), "0", "Counter should be 0");
    assert.isNull(escrowAccount.disputeInitiator, "Dispute initiator should be null");
    assert.isNull(escrowAccount.disputeInitiatedTime, "Dispute initiated time should be null");
    assert.isNull(escrowAccount.disputeEvidenceHashBuyer, "Buyer evidence hash should be null");
    assert.isNull(escrowAccount.disputeEvidenceHashSeller, "Seller evidence hash should be null");
    assert.isNull(escrowAccount.disputeResolutionHash, "Resolution hash should be null");
  });

  it("Funds the escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Escrow Funding ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const sellerBalanceBefore = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    console.log(`Seller token balance before: ${sellerBalanceBefore}`);

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    const sellerBalanceAfter = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    const escrowBalance = (await provider.connection.getTokenAccountBalance(escrowTokenPDA)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Seller token balance after: ${sellerBalanceAfter}`);
    console.log(`Escrow token balance: ${escrowBalance}`);

    assert.equal(
      new BN(sellerBalanceBefore).sub(new BN(sellerBalanceAfter)).toString(),
      "1010000",
      "Incorrect amount transferred from seller"
    );
    assert.equal(escrowBalance, "1010000", "Escrow balance incorrect");
    assert.deepEqual(escrowAccount.state, { funded: {} }, "State should be Funded");
    assert(escrowAccount.fiatDeadline > 0, "Fiat deadline should be set");
  });

  it("Marks fiat paid", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Escrow Funding and Marking Paid ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.isTrue(escrowAccount.fiatPaid, "Fiat paid should be true");
  });

  it("Releases the escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Escrow Full Flow ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    const buyerBalanceBefore = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
    const arbitratorBalanceBefore = (await provider.connection.getTokenAccountBalance(arbitratorTokenAccount)).value.amount;

    await program.methods
      .releaseEscrow()
      .accounts({
        authority: seller.publicKey,
        escrow: escrowPDA,
        escrowTokenAccount: escrowTokenPDA,
        buyerTokenAccount: buyerTokenAccount,
        arbitratorTokenAccount: arbitratorTokenAccount,
        sequentialEscrowTokenAccount: null,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const buyerBalanceAfter = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
    const arbitratorBalanceAfter = (await provider.connection.getTokenAccountBalance(arbitratorTokenAccount)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Buyer balance before: ${buyerBalanceBefore}, after: ${buyerBalanceAfter}`);
    console.log(`Arbitrator balance before: ${arbitratorBalanceBefore}, after: ${arbitratorBalanceAfter}`);

    assert.equal(
      new BN(buyerBalanceAfter).sub(new BN(buyerBalanceBefore)).toString(),
      "1000000",
      "Buyer should receive principal"
    );
    assert.equal(
      new BN(arbitratorBalanceAfter).sub(new BN(arbitratorBalanceBefore)).toString(),
      "10000",
      "Arbitrator should receive fee"
    );
    assert.deepEqual(escrowAccount.state, { released: {} }, "State should be Released");
  });

  // Step 4 Tests
  it("Creates a sequential escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const sequentialAddress = Keypair.generate().publicKey;
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);

    console.log("=== Escrow Creation ===");
    const tx = await program.methods
      .createEscrow(escrowId, tradeId, amount, true, sequentialAddress)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    console.log("Sequential escrow transaction signature:", tx);

    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.equal(escrowAccount.sequential, true, "Sequential should be true");
    assert.equal(
      escrowAccount.sequentialEscrowAddress?.toBase58(),
      sequentialAddress.toBase58(),
      "Sequential address mismatch"
    );
  });

  it("Fails to create escrow with invalid amount", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);

    console.log("=== Escrow Creation ===");
    try {
      await program.methods
        .createEscrow(escrowId, tradeId, new BN(0), false, null)
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPDA,
          system_program: anchor.web3.SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
      assert.fail("Should have thrown an error for zero amount");
    } catch (error: any) {
      assert.include(
        error.message,
        "Invalid amount: Zero or negative",
        "Expected InvalidAmount error"
      );
    }
  });

  it("Updates sequential address", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const initialSequentialAddress = Keypair.generate().publicKey;
    const newSequentialAddress = Keypair.generate().publicKey;
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);

    console.log("=== Sequential Escrow Update ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, true, initialSequentialAddress)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .updateSequentialAddress(newSequentialAddress)
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.equal(
      escrowAccount.sequentialEscrowAddress?.toBase58(),
      newSequentialAddress.toBase58(),
      "Sequential address should be updated"
    );
  });

  it("Releases to sequential address", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const sequentialAddress = Keypair.generate().publicKey;
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Sequential Escrow Release ===");
    const sequentialTokenAccount = await token.createAccount(
      provider.connection,
      seller,
      tokenMint,
      sequentialAddress
    );
    console.log("Sequential token account:", sequentialTokenAccount.toBase58());

    await program.methods
      .createEscrow(escrowId, tradeId, amount, true, sequentialAddress)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    const sequentialBalanceBefore = (await provider.connection.getTokenAccountBalance(sequentialTokenAccount)).value.amount;
    const arbitratorBalanceBefore = (await provider.connection.getTokenAccountBalance(arbitratorTokenAccount)).value.amount;

    await program.methods
      .releaseEscrow()
      .accounts({
        authority: seller.publicKey,
        escrow: escrowPDA,
        escrowTokenAccount: escrowTokenPDA,
        buyerTokenAccount: buyerTokenAccount,
        arbitratorTokenAccount: arbitratorTokenAccount,
        sequentialEscrowTokenAccount: sequentialTokenAccount,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const sequentialBalanceAfter = (await provider.connection.getTokenAccountBalance(sequentialTokenAccount)).value.amount;
    const arbitratorBalanceAfter = (await provider.connection.getTokenAccountBalance(arbitratorTokenAccount)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Sequential balance before: ${sequentialBalanceBefore}, after: ${sequentialBalanceAfter}`);
    console.log(`Arbitrator balance before: ${arbitratorBalanceBefore}, after: ${arbitratorBalanceAfter}`);

    assert.equal(
      new BN(sequentialBalanceAfter).sub(new BN(sequentialBalanceBefore)).toString(),
      "1000000",
      "Sequential account should receive principal"
    );
    assert.equal(
      new BN(arbitratorBalanceAfter).sub(new BN(arbitratorBalanceBefore)).toString(),
      "10000",
      "Arbitrator should receive fee"
    );
    assert.deepEqual(escrowAccount.state, { released: {} }, "State should be Released");
  });

  // Step 5 Tests
  it("Cancels escrow before funding", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Escrow Cancellation Before Funding ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .cancelEscrow()
      .accounts({
        authority: seller.publicKey,
        escrow: escrowPDA,
        escrowTokenAccount: null,
        sellerTokenAccount: null,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.deepEqual(escrowAccount.state, { cancelled: {} }, "State should be Cancelled");
    assert.equal(escrowAccount.counter.toString(), "1", "Counter should increment");
  });

  it("Cancels escrow after funding", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Escrow Cancellation After Funding ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    const sellerBalanceBefore = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    console.log(`Seller token balance before: ${sellerBalanceBefore}`);

    await program.methods
      .cancelEscrow()
      .accounts({
        authority: seller.publicKey,
        escrow: escrowPDA,
        escrowTokenAccount: escrowTokenPDA,
        sellerTokenAccount: sellerTokenAccount,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const sellerBalanceAfter = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Seller token balance after: ${sellerBalanceAfter}`);

    assert.equal(
      new BN(sellerBalanceAfter).sub(new BN(sellerBalanceBefore)).toString(),
      "1010000",
      "Seller should receive principal + fee back"
    );
    assert.deepEqual(escrowAccount.state, { cancelled: {} }, "State should be Cancelled");
    assert.equal(escrowAccount.counter.toString(), "2", "Counter should increment");
  });

  it("Fails to cancel escrow after fiat paid", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Escrow Cancellation After Fiat Paid ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    try {
      await program.methods
        .cancelEscrow()
        .accounts({
          authority: seller.publicKey,
          escrow: escrowPDA,
          escrowTokenAccount: escrowTokenPDA,
          sellerTokenAccount: sellerTokenAccount,
          tokenProgram: token.TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      assert.fail("Should have thrown an error due to fiat_paid being true");
    } catch (error: any) {
      assert.include(
        error.message,
        "Invalid state transition",
        "Expected InvalidState error"
      );
    }

    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.deepEqual(escrowAccount.state, { funded: {} }, "State should remain Funded");
  });

  // Step 6 Tests
  it("Initializes bond accounts", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
    const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);

    console.log("=== Bond Account Initialization ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .initializeBuyerBondAccount(escrowId, tradeId)
      .accounts({
        payer: buyer.publicKey,
        escrow: escrowPDA,
        buyerBondAccount: buyerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeSellerBondAccount(escrowId, tradeId)
      .accounts({
        payer: seller.publicKey,
        escrow: escrowPDA,
        sellerBondAccount: sellerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    const buyerBondAccount = await provider.connection.getTokenAccountBalance(buyerBondPDA);
    const sellerBondAccount = await provider.connection.getTokenAccountBalance(sellerBondPDA);

    assert.equal(buyerBondAccount.value.amount, "0", "Buyer bond account should be initialized with 0 tokens");
    assert.equal(sellerBondAccount.value.amount, "0", "Seller bond account should be initialized with 0 tokens");
  });

  it("Opens dispute as buyer", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);
    const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
    const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);
    const evidenceHash = Buffer.alloc(32, "buyer_evidence").toJSON().data;

    console.log("=== Dispute Opening ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeBuyerBondAccount(escrowId, tradeId)
      .accounts({
        payer: buyer.publicKey,
        escrow: escrowPDA,
        buyerBondAccount: buyerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeSellerBondAccount(escrowId, tradeId)
      .accounts({
        payer: seller.publicKey,
        escrow: escrowPDA,
        sellerBondAccount: sellerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    const buyerBalanceBefore = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
    await program.methods
      .openDisputeWithBond(evidenceHash)
      .accounts({
        disputingParty: buyer.publicKey,
        escrow: escrowPDA,
        disputingPartyTokenAccount: buyerTokenAccount,
        buyerBondAccount: buyerBondPDA,
        sellerBondAccount: sellerBondPDA,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const buyerBalanceAfter = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
    const buyerBondBalance = (await provider.connection.getTokenAccountBalance(buyerBondPDA)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Buyer balance before: ${buyerBalanceBefore}, after: ${buyerBalanceAfter}`);
    console.log(`Buyer bond balance: ${buyerBondBalance}`);

    assert.equal(
      new BN(buyerBalanceBefore).sub(new BN(buyerBalanceAfter)).toString(),
      "50000",
      "Buyer should transfer bond (5% of 1,000,000)"
    );
    assert.equal(buyerBondBalance, "50000", "Bond account should receive 50,000 lamports");
    assert.deepEqual(escrowAccount.state, { disputed: {} }, "State should be Disputed");
    assert.equal(escrowAccount.disputeInitiator?.toBase58(), buyer.publicKey.toBase58(), "Dispute initiator should be buyer");
  });

  it("Responds to dispute as seller", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);
    const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
    const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);
    const buyerEvidenceHash = Buffer.alloc(32, "buyer_evidence").toJSON().data;
    const sellerEvidenceHash = Buffer.alloc(32, "seller_evidence").toJSON().data;

    console.log("=== Dispute Response ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeBuyerBondAccount(escrowId, tradeId)
      .accounts({
        payer: buyer.publicKey,
        escrow: escrowPDA,
        buyerBondAccount: buyerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeSellerBondAccount(escrowId, tradeId)
      .accounts({
        payer: seller.publicKey,
        escrow: escrowPDA,
        sellerBondAccount: sellerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .openDisputeWithBond(buyerEvidenceHash)
      .accounts({
        disputingParty: buyer.publicKey,
        escrow: escrowPDA,
        disputingPartyTokenAccount: buyerTokenAccount,
        buyerBondAccount: buyerBondPDA,
        sellerBondAccount: sellerBondPDA,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const sellerBalanceBefore = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    await program.methods
      .respondToDisputeWithBond(sellerEvidenceHash)
      .accounts({
        respondingParty: seller.publicKey,
        escrow: escrowPDA,
        respondingPartyTokenAccount: sellerTokenAccount,
        buyerBondAccount: buyerBondPDA,
        sellerBondAccount: sellerBondPDA,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const sellerBalanceAfter = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    const sellerBondBalance = (await provider.connection.getTokenAccountBalance(sellerBondPDA)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Seller balance before: ${sellerBalanceBefore}, after: ${sellerBalanceAfter}`);
    console.log(`Seller bond balance: ${sellerBondBalance}`);

    assert.equal(
      new BN(sellerBalanceBefore).sub(new BN(sellerBalanceAfter)).toString(),
      "50000",
      "Seller should transfer bond (5% of 1,000,000)"
    );
    assert.equal(sellerBondBalance, "50000", "Seller bond account should receive 50,000 lamports");
    assert.deepEqual(escrowAccount.state, { disputed: {} }, "State should remain Disputed");
    assert.notEqual(
      Buffer.from(escrowAccount.disputeEvidenceHashSeller!).toString("hex"),
      Buffer.from(buyerEvidenceHash).toString("hex"),
      "Seller evidence hash should be set"
    );
  });

  it("Resolves dispute with buyer winning", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);
    const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
    const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);
    const buyerEvidenceHash = Buffer.alloc(32, "buyer_evidence").toJSON().data;
    const sellerEvidenceHash = Buffer.alloc(32, "seller_evidence").toJSON().data;
    const resolutionHash = Buffer.alloc(32, "resolution").toJSON().data;

    console.log("=== Dispute Resolution (Buyer Wins) ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeBuyerBondAccount(escrowId, tradeId)
      .accounts({
        payer: buyer.publicKey,
        escrow: escrowPDA,
        buyerBondAccount: buyerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .initializeSellerBondAccount(escrowId, tradeId)
      .accounts({
        payer: seller.publicKey,
        escrow: escrowPDA,
        sellerBondAccount: sellerBondPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    await program.methods
      .openDisputeWithBond(buyerEvidenceHash)
      .accounts({
        disputingParty: buyer.publicKey,
        escrow: escrowPDA,
        disputingPartyTokenAccount: buyerTokenAccount,
        buyerBondAccount: buyerBondPDA,
        sellerBondAccount: sellerBondPDA,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .respondToDisputeWithBond(sellerEvidenceHash)
      .accounts({
        respondingParty: seller.publicKey,
        escrow: escrowPDA,
        respondingPartyTokenAccount: sellerTokenAccount,
        buyerBondAccount: buyerBondPDA,
        sellerBondAccount: sellerBondPDA,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const buyerBalanceBefore = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
    const arbitratorBalanceBefore = (await provider.connection.getTokenAccountBalance(arbitratorTokenAccount)).value.amount;
    const buyerBondBefore = (await provider.connection.getTokenAccountBalance(buyerBondPDA)).value.amount;
    const sellerBondBefore = (await provider.connection.getTokenAccountBalance(sellerBondPDA)).value.amount;

    await program.methods
      .resolveDisputeWithExplanation(true, resolutionHash)
      .accounts({
        arbitrator: arbitrator.publicKey,
        escrow: escrowPDA,
        escrowTokenAccount: escrowTokenPDA,
        buyerTokenAccount: buyerTokenAccount,
        sellerTokenAccount: sellerTokenAccount,
        arbitratorTokenAccount: arbitratorTokenAccount,
        buyerBondAccount: buyerBondPDA,
        sellerBondAccount: sellerBondPDA,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .signers([arbitrator])
      .rpc();

    const buyerBalanceAfter = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
    const arbitratorBalanceAfter = (await provider.connection.getTokenAccountBalance(arbitratorTokenAccount)).value.amount;
    const buyerBondAfter = (await provider.connection.getTokenAccountBalance(buyerBondPDA)).value.amount;
    const sellerBondAfter = (await provider.connection.getTokenAccountBalance(sellerBondPDA)).value.amount;
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);

    console.log(`Buyer balance before: ${buyerBalanceBefore}, after: ${buyerBalanceAfter}`);
    console.log(`Arbitrator balance before: ${arbitratorBalanceBefore}, after: ${arbitratorBalanceAfter}`);
    console.log(`Buyer bond before: ${buyerBondBefore}, after: ${buyerBondAfter}`);
    console.log(`Seller bond before: ${sellerBondBefore}, after: ${sellerBondAfter}`);

    assert.equal(
      new BN(buyerBalanceAfter).sub(new BN(buyerBalanceBefore)).toString(),
      "1050000",
      "Buyer should receive principal (1,000,000) + bond (50,000)"
    );
    assert.equal(
      new BN(arbitratorBalanceAfter).sub(new BN(arbitratorBalanceBefore)).toString(),
      "60000",
      "Arbitrator should receive fee (10,000) + seller bond (50,000)"
    );
    assert.equal(buyerBondAfter, "0", "Buyer bond should be emptied");
    assert.equal(sellerBondAfter, "0", "Seller bond should be emptied");
    assert.deepEqual(escrowAccount.state, { resolved: {} }, "State should be Resolved");
  });

  // it("Resolves dispute by default judgment (buyer wins)", async () => {
  //   const escrowId = new BN(escrowIdCounter++);
  //   const tradeId = new BN(2);
  //   const amount = new BN(1000000);
  //   const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  //   const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);
  //   const [buyerBondPDA] = deriveBuyerBondPDA(escrowPDA);
  //   const [sellerBondPDA] = deriveSellerBondPDA(escrowPDA);
  //   const buyerEvidenceHash = Buffer.alloc(32, "buyer_evidence").toJSON().data;

  //   console.log("=== Default Judgment (Buyer Wins) ===");
  //   await program.methods
  //     .createEscrow(escrowId, tradeId, amount, false, null)
  //     .accounts({
  //       seller: seller.publicKey,
  //       buyer: buyer.publicKey,
  //       escrow: escrowPDA,
  //       system_program: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([seller])
  //     .rpc();

  //   await program.methods
  //     .fundEscrow()
  //     .accounts({
  //       seller: seller.publicKey,
  //       escrow: escrowPDA,
  //       sellerTokenAccount: sellerTokenAccount,
  //       escrowTokenAccount: escrowTokenPDA,
  //       tokenMint: tokenMint,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //     })
  //     .signers([seller])
  //     .rpc();

  //   await program.methods
  //     .markFiatPaid()
  //     .accounts({
  //       buyer: buyer.publicKey,
  //       escrow: escrowPDA,
  //     })
  //     .signers([buyer])
  //     .rpc();

  //   await program.methods
  //     .initializeBuyerBondAccount(escrowId, tradeId)
  //     .accounts({
  //       payer: buyer.publicKey,
  //       escrow: escrowPDA,
  //       buyerBondAccount: buyerBondPDA,
  //       tokenMint: tokenMint,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //     })
  //     .signers([buyer])
  //     .rpc();

  //   await program.methods
  //     .initializeSellerBondAccount(escrowId, tradeId)
  //     .accounts({
  //       payer: seller.publicKey,
  //       escrow: escrowPDA,
  //       sellerBondAccount: sellerBondPDA,
  //       tokenMint: tokenMint,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //     })
  //     .signers([seller])
  //     .rpc();

  //   await program.methods
  //     .openDisputeWithBond(buyerEvidenceHash)
  //     .accounts({
  //       disputingParty: buyer.publicKey,
  //       escrow: escrowPDA,
  //       disputingPartyTokenAccount: buyerTokenAccount,
  //       buyerBondAccount: buyerBondPDA,
  //       sellerBondAccount: sellerBondPDA,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //     })
  //     .signers([buyer])
  //     .rpc();

  //   // Simulate 72-hour delay (not feasible in testnet, so we assume deadline passed)
  //   const buyerBalanceBefore = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
  //   const buyerBondBefore = (await provider.connection.getTokenAccountBalance(buyerBondPDA)).value.amount;

  //   // Note: In a real scenario, we'd wait 72 hours. Here, we assume the test environment allows immediate judgment.
  //   await program.methods
  //     .defaultJudgment()
  //     .accounts({
  //       arbitrator: arbitrator.publicKey,
  //       escrow: escrowPDA,
  //       escrowTokenAccount: escrowTokenPDA,
  //       buyerTokenAccount: buyerTokenAccount,
  //       sellerTokenAccount: sellerTokenAccount,
  //       buyerBondAccount: buyerBondPDA,
  //       sellerBondAccount: sellerBondPDA,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //     })
  //     .signers([arbitrator])
  //     .rpc();

  //   const buyerBalanceAfter = (await provider.connection.getTokenAccountBalance(buyerTokenAccount)).value.amount;
  //   const buyerBondAfter = (await provider.connection.getTokenAccountBalance(buyerBondPDA)).value.amount;
  //   const escrowAccount = await program.account.escrow.fetch(escrowPDA);

  //   console.log(`Buyer balance before: ${buyerBalanceBefore}, after: ${buyerBalanceAfter}`);
  //   console.log(`Buyer bond before: ${buyerBondBefore}, after: ${buyerBondAfter}`);

  //   assert.equal(
  //     new BN(buyerBalanceAfter).sub(new BN(buyerBalanceBefore)).toString(),
  //     "1060000",
  //     "Buyer should receive principal + fee (1,010,000) + bond (50,000)"
  //   );
  //   assert.equal(buyerBondAfter, "0", "Buyer bond should be emptied");
  //   assert.deepEqual(escrowAccount.state, { resolved: {} }, "State should be Resolved");
  // });

  // Step 7 Tests
  // it("Auto-cancels escrow after deposit deadline", async () => {
  //   const escrowId = new BN(escrowIdCounter++); // Increment counter
  //   const tradeId = new BN(2);
  //   const amount = new BN(1000000);
  //   const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  //   const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

  //   console.log("=== Auto-Cancel (Deposit Deadline) ===");
  //   await program.methods
  //     .createEscrow(escrowId, tradeId, amount, false, null)
  //     .accounts({
  //       seller: seller.publicKey,
  //       buyer: buyer.publicKey,
  //       escrow: escrowPDA,
  //       system_program: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([seller])
  //     .rpc();

  //   // Wait 61 seconds to exceed the 1-minute (60-second) deposit deadline
  //   await new Promise((resolve) => setTimeout(resolve, 61000));

  //   await program.methods
  //     .autoCancel()
  //     .accounts({
  //       escrow: escrowPDA,
  //       escrowTokenAccount: null, // Not funded yet
  //       sellerTokenAccount: null, // No funds to return
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //     })
  //     .rpc();

  //   const escrowAccount = await program.account.escrow.fetch(escrowPDA);
  //   assert.deepEqual(escrowAccount.state, { cancelled: {} }, "State should be Cancelled");
  //   assert.equal(escrowAccount.counter.toString(), "1", "Counter should increment");
  // });
  // it("Auto-cancels escrow after fiat deadline", async () => {
  //   const escrowId = new BN(escrowIdCounter++); // Increment counter
  //   const tradeId = new BN(2);
  //   const amount = new BN(1000000);
  //   const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  //   const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

  //   console.log("=== Auto-Cancel (Fiat Deadline) ===");
  //   await program.methods
  //     .createEscrow(escrowId, tradeId, amount, false, null)
  //     .accounts({
  //       seller: seller.publicKey,
  //       buyer: buyer.publicKey,
  //       escrow: escrowPDA,
  //       system_program: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([seller])
  //     .rpc();

  //   await program.methods
  //     .fundEscrow()
  //     .accounts({
  //       seller: seller.publicKey,
  //       escrow: escrowPDA,
  //       sellerTokenAccount: sellerTokenAccount,
  //       escrowTokenAccount: escrowTokenPDA,
  //       tokenMint: tokenMint,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //     })
  //     .signers([seller])
  //     .rpc();

  //   const sellerBalanceBefore = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
  //   console.log(`Seller token balance before: ${sellerBalanceBefore}`);

  //   // Wait 61 seconds to exceed the 1-minute (60-second) fiat deadline
  //   await new Promise((resolve) => setTimeout(resolve, 61000));

  //   await program.methods
  //     .autoCancel()
  //     .accounts({
  //       escrow: escrowPDA,
  //       escrowTokenAccount: escrowTokenPDA,
  //       sellerTokenAccount: sellerTokenAccount,
  //       tokenProgram: token.TOKEN_PROGRAM_ID,
  //     })
  //     .rpc();

  //   const sellerBalanceAfter = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
  //   const escrowAccount = await program.account.escrow.fetch(escrowPDA);

  //   console.log(`Seller token balance after: ${sellerBalanceAfter}`);

  //   assert.equal(
  //     new BN(sellerBalanceAfter).sub(new BN(sellerBalanceBefore)).toString(),
  //     "1010000",
  //     "Seller should receive principal + fee back"
  //   );
  //   assert.deepEqual(escrowAccount.state, { cancelled: {} }, "State should be Cancelled");
  //   assert.equal(escrowAccount.counter.toString(), "2", "Counter should increment");
  // });


  // Step 8: Edge Cases and Errors


    // Step 8: Edge Cases and Errors

  it("Fails to create escrow with amount exceeding maximum", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const excessiveAmount = new BN(100000001); // 100.000001 USDC > 100 USDC max

    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);

    console.log("=== Exceeds Maximum Amount ===");
    try {
      await program.methods
        .createEscrow(escrowId, tradeId, excessiveAmount, false, null)
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPDA,
          system_program: anchor.web3.SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
      assert.fail("Should have thrown an error for exceeding maximum amount");
    } catch (error: any) {
      assert.include(
        error.message,
        "Amount exceeds maximum (100 USDC)",
        "Expected ExceedsMaximum error"
      );
    }
  });

  it("Fails to fund escrow with unauthorized signer", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000); // 1 USDC
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Unauthorized Actions ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    try {
      await program.methods
        .fundEscrow()
        .accounts({
          seller: buyer.publicKey, // Wrong signer
          escrow: escrowPDA,
          sellerTokenAccount: sellerTokenAccount,
          escrowTokenAccount: escrowTokenPDA,
          tokenMint: tokenMint,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();
      assert.fail("Should have thrown an error for unauthorized signer");
    } catch (error: any) {
      console.log(`Error message: ${error.message}`);
      assert.include(
        error.message,
        "A raw constraint was violated",
        "Expected raw constraint violation"
      );
    }
  });

  it("Fails to fund escrow with insufficient funds", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000); // 1 USDC, total needed = 1,010,000
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Insufficient Funds ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    // Burn tokens to reduce seller balance below required amount
    const currentBalance = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    const burnAmount = new BN(currentBalance).sub(new BN(500000)); // Leave 0.5 USDC
    await token.burn(
      provider.connection,
      seller,
      sellerTokenAccount,
      tokenMint,
      seller,
      burnAmount.toNumber()
    );

    try {
      await program.methods
        .fundEscrow()
        .accounts({
          seller: seller.publicKey,
          escrow: escrowPDA,
          sellerTokenAccount: sellerTokenAccount,
          escrowTokenAccount: escrowTokenPDA,
          tokenMint: tokenMint,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([seller])
        .rpc();
      assert.fail("Should have thrown an error for insufficient funds");
    } catch (error: any) {
      assert.include(
        error.message,
        "Insufficient funds",
        "Expected InsufficientFunds error"
      );
    }
  });

  it("Fails to release sequential escrow without sequential address", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000); // 1 USDC
    const sequentialAddress = Keypair.generate().publicKey;
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
    const [escrowTokenPDA] = deriveEscrowTokenPDA(escrowPDA);

    console.log("=== Missing Sequential Address ===");
    await program.methods
      .createEscrow(escrowId, tradeId, amount, true, sequentialAddress)
      .accounts({
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        escrow: escrowPDA,
        system_program: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    // Restore seller balance to ensure fund_escrow succeeds
    const currentBalance = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    if (new BN(currentBalance).lt(new BN(1010000))) {
      await token.mintTo(
        provider.connection,
        seller, // Payer
        tokenMint,
        sellerTokenAccount,
        seller, // Mint authority (Keypair)
        1000000000 // Mint 1000 USDC to reset balance
      );
    }

    const sellerBalanceBefore = (await provider.connection.getTokenAccountBalance(sellerTokenAccount)).value.amount;
    console.log(`Seller token balance before funding: ${sellerBalanceBefore}`);
    await program.methods
      .fundEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPDA,
        sellerTokenAccount: sellerTokenAccount,
        escrowTokenAccount: escrowTokenPDA,
        tokenMint: tokenMint,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([seller])
      .rpc();

    const escrowBalance = (await provider.connection.getTokenAccountBalance(escrowTokenPDA)).value.amount;
    console.log(`Escrow token balance after funding: ${escrowBalance}`);

    await program.methods
      .markFiatPaid()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrowPDA,
      })
      .signers([buyer])
      .rpc();

    const escrowBalanceBeforeRelease = (await provider.connection.getTokenAccountBalance(escrowTokenPDA)).value.amount;
    console.log(`Escrow token balance before release: ${escrowBalanceBeforeRelease}`);

    try {
      await program.methods
        .releaseEscrow()
        .accounts({
          authority: seller.publicKey,
          escrow: escrowPDA,
          escrowTokenAccount: escrowTokenPDA,
          buyerTokenAccount: buyerTokenAccount,
          arbitratorTokenAccount: arbitratorTokenAccount,
          sequentialEscrowTokenAccount: null,
          tokenProgram: token.TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      assert.fail("Should have thrown an error for missing sequential address");
    } catch (error: any) {
      console.log(`Error message: ${error.message}`);
      assert.include(
        error.message,
        "Missing sequential escrow address",
        "Expected SequentialAddressMissing error"
      );
    }
  });

});
