import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function inspectEscrow() {
  try {
    // Setup provider
    const provider = anchor.AnchorProvider.env();
    console.log("Provider URL:", provider.connection.rpcEndpoint);
    anchor.setProvider(provider);

    // Get program instance
    const program = anchor.workspace.LocalsolanaContracts;
    console.log("Program ID:", program.programId.toBase58());

    // List all escrow accounts
    console.log("\nFetching all escrow accounts...");
    const escrowAccounts = await program.account.escrow.all();
    console.log(`Found ${escrowAccounts.length} escrow accounts\n`);

    for (const escrowData of escrowAccounts) {
      const escrowAddress = escrowData.publicKey;
      const escrowAccount = escrowData.account;

      console.log("=".repeat(50));
      console.log(`Escrow Account: ${escrowAddress.toBase58()}`);
      console.log("=".repeat(50));

      // Basic Info
      console.log("\nBasic Info:");
      console.log("---------------");
      console.log("Escrow ID:", escrowAccount.escrowId.toString());
      console.log("Trade ID:", escrowAccount.tradeId.toString());
      console.log("Seller:", escrowAccount.seller.toBase58());
      console.log("Buyer:", escrowAccount.buyer.toBase58());
      console.log("Amount:", escrowAccount.amount.toString(), "lamports");
      console.log("Fee:", escrowAccount.fee.toString(), "lamports");

      // State & Status
      console.log("\nState & Status:");
      console.log("---------------");
      console.log("State:", escrowAccount.state);
      console.log("Fiat Paid:", escrowAccount.fiatPaid);
      console.log("Is Sequential:", escrowAccount.isSequential);

      // Timestamps
      console.log("\nTimestamps:");
      console.log("---------------");
      console.log("Created At:", escrowAccount.createdAt?.toString() || "Not set");
      console.log("Fiat Deadline:", escrowAccount.fiatDeadline?.toString() || "Not set");
      console.log("Deposit Deadline:", escrowAccount.depositDeadline?.toString() || "Not set");

      // Dispute Info
      console.log("\nDispute Information:");
      console.log("---------------");
      console.log("Dispute Initiated Time:", escrowAccount.disputeInitiatedTime?.toString() || "No dispute");
      console.log("Seller Evidence Hash:", escrowAccount.sellerEvidenceHash || "None");
      console.log("Buyer Evidence Hash:", escrowAccount.buyerEvidenceHash || "None");
      console.log("Seller Evidence Time:", escrowAccount.sellerEvidenceTime?.toString() || "None");
      console.log("Buyer Evidence Time:", escrowAccount.buyerEvidenceTime?.toString() || "None");

      // Sequential Trade Info
      if (escrowAccount.isSequential) {
        console.log("\nSequential Trade Info:");
        console.log("---------------");
        console.log("Previous Trade ID:", escrowAccount.previousTradeId?.toString() || "None");
        console.log("Next Trade ID:", escrowAccount.nextTradeId?.toString() || "None");
      }

      console.log("\n");
    }
  } catch (error) {
    console.error("Error fetching escrow:", error);
    if (error.logs) {
      console.error("\nError logs:", error.logs);
    }
  }
}

inspectEscrow();
