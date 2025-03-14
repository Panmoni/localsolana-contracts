const fs = require("fs");
const bs58 = require("bs58");

const keypairJson = fs.readFileSync(
  "./keys/devnet/program-keypair.json",
  "utf8"
);
const keypair = JSON.parse(keypairJson);
const secretKey = Uint8Array.from(keypair); // 64 bytes, last 32 are pubkey
const pubkeyBytes = secretKey.slice(32); // Last 32 bytes are the pubkey
console.log(pubkeyBytes);

const pubkey = "GGrXhNVxUZXaA2uMopsa5q23aPmoNvQF14uxqo8qENUr";

// Decode the base58 string to a byte array
const bytes = bs58.decode(pubkey);

// Convert to a plain array and loop through each byte, formatting with 0x
const formattedBytes = Array.from(bytes).map(
  (byte) => `0x${byte.toString(16).padStart(2, "0")}`
);

// Output the formatted array
console.log("Formatted byte array:");
console.log(formattedBytes.join(", "));

// Optional: Output as a single line for easy copy-paste into Rust
console.log("\nAs a single line for Rust:");
console.log(`[${formattedBytes.join(", ")}]`);
