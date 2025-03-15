import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { LocalsolanaContracts } from "../target/types/localsolana_contracts";
import * as token from "@solana/spl-token";

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

// Ensure keypairs are loading correctly:
console.log("Seller pubkey:", seller.publicKey.toBase58());
console.log("Buyer pubkey:", buyer.publicKey.toBase58());
console.log("Arbitrator pubkey:", arbitrator.publicKey.toBase58());

// add token global variablesf for token testing (USDC mimicking)
let tokenMint: PublicKey;
let sellerTokenAccount: PublicKey;
let buyerTokenAccount: PublicKey;
let arbitratorTokenAccount: PublicKey;

let escrowIdCounter = 1;

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

  async function ensureFunds(publicKey: PublicKey, minLamports: number = 4 * LAMPORTS_PER_SOL): Promise<void> {
    const balance = await provider.connection.getBalance(publicKey);
    console.log(`Balance for ${publicKey.toBase58()}: ${balance} lamports`);
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

    await Promise.all([
      ensureFunds(seller.publicKey),
      ensureFunds(buyer.publicKey),
      ensureFunds(arbitrator.publicKey),
    ]);

    // Token Setup
    console.log("Creating token mint...");
    tokenMint = await token.createMint(
      provider.connection,
      seller,           // Payer for the transaction
      seller.publicKey, // Mint authority
      null,             // Freeze authority (null = none)
      6                 // Decimals (USDC-like)
    );
    console.log("Token mint created:", tokenMint.toBase58());

    console.log("Creating seller token account...");
    sellerTokenAccount = await token.createAccount(
      provider.connection,
      seller,           // Payer
      tokenMint,        // Mint
      seller.publicKey  // Owner
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
      seller,           // Payer
      tokenMint,        // Mint
      sellerTokenAccount, // Destination
      seller.publicKey, // Mint authority
      1000000000        // Amount (1000 tokens = 1,000,000,000 lamports with 6 decimals)
    );

    console.log("Minting tokens to buyer...");
    await token.mintTo(
      provider.connection,
      buyer,
      tokenMint,
      buyerTokenAccount,
      buyer.publicKey,  // Using buyer as signer (assuming they have mint authority or adjust accordingly)
      1000000000
    );
  });

  it("Creates a basic escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const [escrowPDA, _bump] = deriveEscrowPDA(escrowId, tradeId);

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

  it("Creates a sequential escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000);
    const sequentialAddress = Keypair.generate().publicKey;
    const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);

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
});
