import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { LocalsolanaContracts } from "../target/types/localsolana_contracts";

dotenv.config();

// Helper: Load a keypair from a JSON file
function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(process.env.HOME || process.env.USERPROFILE || ".", filePath.slice(1))
    : filePath;
  const secretKeyString = fs.readFileSync(absolutePath, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

// Load keypairs from .env file paths
const seller = loadKeypair(process.env.SELLER_KEYPAIR || "");
const buyer = loadKeypair(process.env.BUYER_KEYPAIR || "");
const arbitrator = loadKeypair(process.env.ARBITRATOR_KEYPAIR || "");

// Base values for escrow IDs
let escrowIdCounter = 1;

describe("Localsolana Contracts Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LocalsolanaContracts as Program<LocalsolanaContracts>;
  const expectedProgramId = new PublicKey("4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x");

  // Helper to derive escrow PDA
  const deriveEscrowPDA = (escrowId: BN, tradeId: BN): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        escrowId.toArrayLike(Buffer, "le", 8),
        tradeId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

  // Helper to ensure sufficient funds
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

    // Fund all keypairs, including the upgrade authority (arbitrator)
    await Promise.all([
      ensureFunds(seller.publicKey),
      ensureFunds(buyer.publicKey),
      ensureFunds(arbitrator.publicKey),
    ]);
  });

  it("Creates a basic escrow", async () => {
    const escrowId = new BN(escrowIdCounter++);
    const tradeId = new BN(2);
    const amount = new BN(1000000); // 1 USDC
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
      const logs = await provider.connection.getTransaction(error.txid, { commitment: "confirmed" });
      assert.include(
        logs?.meta?.logMessages?.join(""),
        "Invalid amount: Zero or negative",
        "Expected InvalidAmount error"
      );
    }
  });
});
