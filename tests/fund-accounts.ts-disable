import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function ensureFunds(
  publicKey: PublicKey,
  minLamports: number = 5 * LAMPORTS_PER_SOL
): Promise<void> {
  const connection = new anchor.web3.Connection(
  process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com",
  "confirmed"
);

  const balance = await connection.getBalance(publicKey);
  console.log(`Balance for ${publicKey.toBase58()}: ${balance} lamports`);
  if (balance < minLamports) {
    console.log(
      `Requesting airdrop for ${publicKey.toBase58()} (${minLamports} lamports)...`
    );
    const sig = await connection.requestAirdrop(publicKey, minLamports);
    await connection.confirmTransaction(sig);
    const newBalance = await connection.getBalance(publicKey);
    console.log(`Airdrop complete. New balance: ${newBalance} lamports`);
  }
}

function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(
        process.env.HOME || process.env.USERPROFILE || ".",
        filePath.slice(1)
      )
    : filePath;
  const secretKeyString = fs.readFileSync(absolutePath, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

async function main() {
  const seller = loadKeypair(process.env.SELLER_KEYPAIR || "");
  const buyer = loadKeypair(process.env.BUYER_KEYPAIR || "");
  const arbitrator = loadKeypair(process.env.ARBITRATOR_KEYPAIR || "");

  console.log("=== Funding Accounts ===");
  await Promise.all([
    ensureFunds(seller.publicKey, 5 * LAMPORTS_PER_SOL),
    ensureFunds(buyer.publicKey, 5 * LAMPORTS_PER_SOL),
    ensureFunds(arbitrator.publicKey, 5 * LAMPORTS_PER_SOL),
  ]);
  console.log("All accounts funded successfully.");
}

main().catch((err) => {
  console.error("Funding failed:", err);
  process.exit(1);
});
