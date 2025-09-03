// node scripts/inspectEscrow.js

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from '@solana/web3.js';
import * as token from "@solana/spl-token";
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

    let totalLockedFunds = 0;
    let accountsWithFunds = 0;
    let balanceMismatches = 0;

    // Table header
    console.log("ESCROW ACCOUNTS OVERVIEW");
    console.log("=".repeat(140));
    console.log("│ Escrow ID │ Trade ID │ State       │ Fiat │ Seq │ Tracked │ Token Account │ USDC Balance │ SOL Balance │ Status");
    console.log("│           │          │             │ Paid │     │ Balance │              │              │             │");
    console.log("=".repeat(140));

    for (const escrowData of escrowAccounts) {
      const escrowAddress = escrowData.publicKey;
      const escrowAccount = escrowData.account;

      // Basic info for table row
      const escrowId = escrowAccount.escrowId.toString().padEnd(10);
      const tradeId = escrowAccount.tradeId.toString().padEnd(10);

      // Fix the [object Object] issue by extracting the actual state
      let stateStr = "Unknown";
      if (escrowAccount.state.created) stateStr = "Created";
      else if (escrowAccount.state.funded) stateStr = "Funded";
      else if (escrowAccount.state.released) stateStr = "Released";
      else if (escrowAccount.state.cancelled) stateStr = "Cancelled";
      else if (escrowAccount.state.disputed) stateStr = "Disputed";
      else if (escrowAccount.state.resolved) stateStr = "Resolved";
      stateStr = stateStr.padEnd(11);

      const fiatPaid = escrowAccount.fiatPaid ? "Yes" : "No ";
      const sequential = escrowAccount.sequential ? "Yes" : "No ";
      const trackedBalance = escrowAccount.trackedBalance.toString().padEnd(8);

      // Token account info
      let tokenAccountPDA = "N/A";
      let usdcBalance = "0.00";
      let solBalance = "0.000000";
      let status = "Closed";

      try {
        const [escrowTokenPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("escrow_token"), escrowAddress.toBuffer()],
          program.programId
        );

        tokenAccountPDA = escrowTokenPDA.toBase58().slice(0, 8) + "...";

        const tokenAccountInfo = await provider.connection.getAccountInfo(escrowTokenPDA);

        if (tokenAccountInfo) {
          const tokenBalance = await provider.connection.getTokenAccountBalance(escrowTokenPDA);
          const balance = parseInt(tokenBalance.value.amount);
          usdcBalance = (balance / 1e6).toFixed(2);
          solBalance = (tokenAccountInfo.lamports / 1e9).toFixed(6);
          status = "Open";

          if (balance > 0) {
            totalLockedFunds += balance;
            accountsWithFunds++;

            if (escrowAccount.trackedBalance !== balance) {
              balanceMismatches++;
              status = "MISMATCH!";
            }
          }
        }
      } catch (error) {
        status = "Error";
      }

      // Print table row
      console.log(`│ ${escrowId} │ ${tradeId} │ ${stateStr} │ ${fiatPaid}  │ ${sequential} │ ${trackedBalance} │ ${tokenAccountPDA.padEnd(12)} │ ${usdcBalance.padEnd(11)} │ ${solBalance.padEnd(10)} │ ${status}`);

      // Add separator between rows
      if (escrowData !== escrowAccounts[escrowAccounts.length - 1]) {
        console.log("│" + "─".repeat(138) + "│");
      }
    }

    console.log("=".repeat(140));

    // Summary section
    console.log("\nDETAILED ACCOUNT INFORMATION");
    console.log("=".repeat(80));

    for (let i = 0; i < escrowAccounts.length; i++) {
      const escrowData = escrowAccounts[i];
      const escrowAddress = escrowData.publicKey;
      const escrowAccount = escrowData.account;

      console.log(`\n${i + 1}. ESCROW ACCOUNT: ${escrowAddress.toBase58()}`);
      console.log("   ──────────────────────────────────────────────────────────────────────────");

      // Basic Info
      console.log(`   Escrow ID: ${escrowAccount.escrowId.toString().padEnd(20)} Trade ID: ${escrowAccount.tradeId.toString()}`);
      console.log(`   Seller: ${escrowAccount.seller.toBase58()}`);
      console.log(`   Buyer:  ${escrowAccount.buyer.toBase58()}`);
      console.log(`   Amount: ${(escrowAccount.amount / 1e6).toFixed(2)} USDC    Fee: ${(escrowAccount.fee / 1e6).toFixed(2)} USDC`);

      // State & Status (fixed)
      let stateStr = "Unknown";
      if (escrowAccount.state.created) stateStr = "Created";
      else if (escrowAccount.state.funded) stateStr = "Funded";
      else if (escrowAccount.state.released) stateStr = "Released";
      else if (escrowAccount.state.cancelled) stateStr = "Cancelled";
      else if (escrowAccount.state.disputed) stateStr = "Disputed";
      else if (escrowAccount.state.resolved) stateStr = "Resolved";

      console.log(`   State: ${stateStr.padEnd(15)} Fiat Paid: ${escrowAccount.fiatPaid ? "Yes" : "No"}`);
      console.log(`   Sequential: ${escrowAccount.sequential ? "Yes" : "No"}    Tracked Balance: ${escrowAccount.trackedBalance}`);

      // Token Balance Information
      console.log("   ── Token Account ──");
      try {
        const [escrowTokenPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("escrow_token"), escrowAddress.toBuffer()],
          program.programId
        );

        const tokenAccountInfo = await provider.connection.getAccountInfo(escrowTokenPDA);

        if (tokenAccountInfo) {
          const tokenBalance = await provider.connection.getTokenAccountBalance(escrowTokenPDA);
          console.log(`   PDA: ${escrowTokenPDA.toBase58()}`);
          console.log(`   USDC Balance: ${tokenBalance.value.uiAmount} USDC (${tokenBalance.value.amount} lamports)`);
          console.log(`   SOL Balance: ${(tokenAccountInfo.lamports / 1e9).toFixed(6)} SOL`);

          // Check for balance mismatch
          if (escrowAccount.trackedBalance !== parseInt(tokenBalance.value.amount)) {
            console.log(`   ⚠️  BALANCE MISMATCH: Tracked=${escrowAccount.trackedBalance}, Actual=${tokenBalance.value.amount}`);
          }
        } else {
          console.log(`   PDA: ${escrowTokenPDA.toBase58()}`);
          console.log(`   Status: CLOSED (no funds locked)`);
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }

      // Check SOL balance of escrow state account
      console.log("   ── State Account ──");
      try {
        const stateAccountInfo = await provider.connection.getAccountInfo(escrowAddress);
        if (stateAccountInfo) {
          console.log(`   SOL Balance: ${(stateAccountInfo.lamports / 1e9).toFixed(6)} SOL`);
          console.log(`   Account Size: ${stateAccountInfo.data.length} bytes`);
        } else {
          console.log(`   Status: CLOSED`);
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }

      // Timestamps
      console.log("   ── Timestamps ──");
      const depositDeadline = new Date(escrowAccount.depositDeadline * 1000);
      console.log(`   Deposit Deadline: ${depositDeadline.toLocaleString()}`);
      if (escrowAccount.fiatDeadline > 0) {
        const fiatDeadline = new Date(escrowAccount.fiatDeadline * 1000);
        console.log(`   Fiat Deadline: ${fiatDeadline.toLocaleString()}`);
      } else {
        console.log(`   Fiat Deadline: Not set (escrow not funded)`);
      }

      // Dispute Info (if any)
      if (escrowAccount.disputeInitiator) {
        console.log("   ── Dispute Info ──");
        console.log(`   Initiator: ${escrowAccount.disputeInitiator.toBase58()}`);
        if (escrowAccount.disputeInitiatedTime) {
          const disputeTime = new Date(escrowAccount.disputeInitiatedTime * 1000);
          console.log(`   Initiated: ${disputeTime.toLocaleString()}`);
        }
      }

      // Sequential Info (if any)
      if (escrowAccount.sequential && escrowAccount.sequentialEscrowAddress) {
        console.log("   ── Sequential Trade ──");
        console.log(`   Next Escrow: ${escrowAccount.sequentialEscrowAddress.toBase58()}`);
      }
    }

    // Final summary
    console.log("\n" + "=".repeat(80));
    console.log("FINAL SUMMARY");
    console.log("=".repeat(80));

    console.log(`Total escrow accounts: ${escrowAccounts.length}`);
    console.log(`Accounts with locked funds: ${accountsWithFunds}`);
    console.log(`Total locked USDC: ${(totalLockedFunds / 1e6).toFixed(2)} USDC`);
    console.log(`Balance mismatches: ${balanceMismatches}`);

    if (totalLockedFunds > 0) {
      console.log("\n⚠️  FUNDS ARE LOCKED IN ESCROW ACCOUNTS!");
      console.log("These funds need to be reclaimed through proper cleanup.");
    } else {
      console.log("\n✅ All escrow accounts are properly closed with no locked funds.");
    }

  } catch (error) {
    console.error("Error fetching escrow:", error);
    if (error.logs) {
      console.error("\nError logs:", error.logs);
    }
  }
}

inspectEscrow();
