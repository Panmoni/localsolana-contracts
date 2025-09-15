#!/usr/bin/env ts-node

/**
 * Simple Event Generator for Solana Event Listener Testing
 *
 * This script generates the two simplest events from the escrow contract:
 * 1. EscrowCreated - Just creates an escrow state account
 * 2. FiatMarkedPaid - Updates a boolean flag
 *
 * These are the most lightweight events that require minimal setup.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { LocalsolanaContracts } from "../target/types/localsolana_contracts";

dotenv.config();

// Helper functions
const generateRandomId = () => new BN(Math.floor(Math.random() * 1_000_000_000));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Load keypair from file path
const loadKeypair = (filePath: string): Keypair => {
  const keypairData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
};

// PDA derivation functions
const deriveEscrowPDA = (escrowId: any, tradeId: any): [any, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8), tradeId.toArrayLike(Buffer, "le", 8)],
    new PublicKey("4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x")
  );

async function main() {
  console.log("🚀 Starting Simple Event Generator");

  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LocalsolanaContracts as any;

  // Check if we're on devnet
  const isDevnet = provider.connection.rpcEndpoint.includes('devnet') ||
                   provider.connection.rpcEndpoint.includes('api.mainnet-beta.com') === false;

  console.log("🌐 Network Configuration:");
  console.log("  RPC Endpoint:", provider.connection.rpcEndpoint);
  console.log("  Network:", isDevnet ? "Devnet" : "Mainnet");

  // Load existing accounts from environment variables
  const seller = loadKeypair(process.env.SELLER_KEYPAIR!);
  const buyer = loadKeypair(process.env.BUYER_KEYPAIR!);
  const sellerAddress = new PublicKey(process.env.SELLER_ADDRESS!);
  const buyerAddress = new PublicKey(process.env.BUYER_ADDRESS!);
  const sellerTokenAddress = new PublicKey(process.env.SELLER_TOKEN_ADDRESS!);
  const buyerTokenAddress = new PublicKey(process.env.BUYER_TOKEN_ADDRESS!);

  console.log("📋 Using existing accounts:");
  console.log("  Seller:", sellerAddress.toBase58());
  console.log("  Buyer:", buyerAddress.toBase58());
  console.log("  Seller Token Account:", sellerTokenAddress.toBase58());
  console.log("  Buyer Token Account:", buyerTokenAddress.toBase58());

  // Verify accounts have sufficient balance
  const sellerBalance = await provider.connection.getBalance(sellerAddress);
  const buyerBalance = await provider.connection.getBalance(buyerAddress);

  console.log("💰 Account balances:");
  console.log("  Seller SOL:", sellerBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("  Buyer SOL:", buyerBalance / LAMPORTS_PER_SOL, "SOL");

  if (sellerBalance < 0.01 * LAMPORTS_PER_SOL) {
    console.log("⚠️  Warning: Seller has low SOL balance for transaction fees");
  }
  if (buyerBalance < 0.01 * LAMPORTS_PER_SOL) {
    console.log("⚠️  Warning: Buyer has low SOL balance for transaction fees");
  }

  // Generate unique IDs
  const escrowId = generateRandomId();
  const tradeId = generateRandomId();
  const amount = new BN(1000000); // 1 USDC (minimum amount)

  console.log("📊 Escrow parameters:");
  console.log("  Escrow ID:", escrowId.toString());
  console.log("  Trade ID:", tradeId.toString());
  console.log("  Amount: 1 USDC");

  // Derive escrow PDA
  const [escrowPDA] = deriveEscrowPDA(escrowId, tradeId);
  console.log("  Escrow PDA:", escrowPDA.toBase58());

  try {
    // EVENT 1: EscrowCreated
    console.log("\n🎯 Generating EscrowCreated event...");

    const createTx = await program.methods
      .createEscrow(escrowId, tradeId, amount, false, null)
      .accounts({
        seller: sellerAddress,
        buyer: buyerAddress,
        escrow: escrowPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([seller])
      .rpc();

    await provider.connection.confirmTransaction(createTx, "confirmed");

    console.log("✅ EscrowCreated event generated!");
    console.log("  Transaction:", createTx);
    console.log("  Event: EscrowCreated");
    console.log("  Escrow ID:", escrowId.toString());
    console.log("  Trade ID:", tradeId.toString());
    console.log("  Seller:", sellerAddress.toBase58());
    console.log("  Buyer:", buyerAddress.toBase58());

    await sleep(1000);

    // Fetch transaction details to show event data
    console.log("\n🔍 Fetching transaction details to show event data...");
    try {
      const txDetails = await provider.connection.getTransaction(createTx, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });

      if (txDetails && txDetails.meta && txDetails.meta.logMessages) {
        console.log("📋 Transaction Logs:");
        txDetails.meta.logMessages.forEach((log, index) => {
          console.log(`  ${index + 1}. ${log}`);
        });

        // Look for program data logs (these contain the events)
        const programDataLogs = txDetails.meta.logMessages.filter(log =>
          log.includes("Program data:")
        );

        if (programDataLogs.length > 0) {
          console.log("\n🎯 Event Data Found:");
          programDataLogs.forEach((log, index) => {
            console.log(`  Event ${index + 1}: ${log}`);
          });
          console.log("💡 The event data is encoded in base64. Your event listener should decode this.");
        }
      }
    } catch (error) {
      console.log("⚠️  Could not fetch transaction details:", error);
    }

    // Create block explorer link
    const baseExplorerUrl = process.env.BLOCK_EXPLORER_DEVNET || "https://explorer.solana.com";
    const transactionUrl = `${baseExplorerUrl}/tx/${createTx}?cluster=devnet`;
    const escrowUrl = `${baseExplorerUrl}/address/${escrowPDA.toBase58()}?cluster=devnet`;

    console.log("\n📝 Summary:");
    console.log("✅ EscrowCreated event generated successfully");
    console.log("🔍 Check your event listener for the EscrowCreated event!");
    console.log("\n🌐 Devnet Information:");
    console.log("  RPC Endpoint:", provider.connection.rpcEndpoint);
    console.log("  Program ID: 4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x");
    console.log("  Transaction:", createTx);
    console.log("\n🔗 Block Explorer Links:");
    console.log("  Transaction:", transactionUrl);
    console.log("  Escrow Account:", escrowUrl);
    console.log("\n💡 To see the event:");
    console.log("   1. Click the transaction link above");
    console.log("   2. Look for 'Program Logs' section");
    console.log("   3. Find the 'Program data:' log (this contains the event)");
    console.log("   4. The event data is base64 encoded - your listener should decode it");
    console.log("\n🎯 Event Listener Info:");
    console.log("   - Program ID: 4PonUp1nPEzDPnRMPjTqufLT3f37QuBJGk1CVnsTXx7x");
    console.log("   - Event Type: EscrowCreated");
    console.log("   - Look for 'Program data:' logs in transaction details");

  } catch (error) {
    console.error("❌ Error generating events:", error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}

export { main as generateEvents };
