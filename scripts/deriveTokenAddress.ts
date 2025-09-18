#!/usr/bin/env ts-node

/**
 * Token Address Derivation Script (TypeScript)
 *
 * This script derives the Associated Token Account (ATA) address for a given
 * wallet address and token mint address.
 *
 * Usage:
 *   npm run derive-token-address <wallet_address> [token_mint]
 *   # or
 *   ts-node scripts/deriveTokenAddress.ts <wallet_address> [token_mint]
 *
 * Examples:
 *   ts-node scripts/deriveTokenAddress.ts 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8
 *   ts-node scripts/deriveTokenAddress.ts 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 */

import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

// Common token mints
export const COMMON_TOKENS = {
  USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT_DEVNET: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDT_MAINNET: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL_WRAPPED: 'So11111111111111111111111111111111111111112'
} as const;

interface DeriveTokenOptions {
  walletAddress: string;
  tokenMint: string;
}

function parseArgs(): DeriveTokenOptions {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Token Address Derivation Script

Usage: ts-node scripts/deriveTokenAddress.ts <wallet_address> [token_mint]

Arguments:
  wallet_address    The Solana wallet address (base58 string)
  token_mint        The token mint address (optional, defaults to USDC Devnet)

Examples:
  ts-node scripts/deriveTokenAddress.ts 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8
  ts-node scripts/deriveTokenAddress.ts 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
  ts-node scripts/deriveTokenAddress.ts 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 USDC_MAINNET

Common Token Mints:
  USDC_DEVNET      4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
  USDC_MAINNET     EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  USDT_DEVNET      Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
  USDT_MAINNET     Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
  SOL_WRAPPED      So11111111111111111111111111111111111111112

Options:
  --help, -h        Show this help message
`);
    process.exit(0);
  }

  const walletAddress = args[0];
  let tokenMint = args[1] || COMMON_TOKENS.USDC_DEVNET;

  // Handle common token shortcuts
  if (COMMON_TOKENS[tokenMint as keyof typeof COMMON_TOKENS]) {
    tokenMint = COMMON_TOKENS[tokenMint as keyof typeof COMMON_TOKENS];
  }

  return { walletAddress, tokenMint };
}

export async function deriveTokenAddress(walletAddress: string, tokenMint: string): Promise<string> {
  try {
    // Validate inputs
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(tokenMint);

    console.log('🔍 Deriving Associated Token Account...');
    console.log('─'.repeat(60));
    console.log(`Wallet Address: ${walletPubkey.toBase58()}`);
    console.log(`Token Mint:     ${mintPubkey.toBase58()}`);

    // Derive the associated token account address
    const tokenAccountAddress = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey
    );

    console.log('─'.repeat(60));
    console.log('✅ RESULT:');
    console.log(`Associated Token Account: ${tokenAccountAddress.toBase58()}`);

    // Additional information
    console.log('\n📋 Additional Information:');
    console.log(`Token Mint Name: ${getTokenName(tokenMint)}`);
    console.log(`Network: ${isDevnetToken(tokenMint) ? 'Devnet' : 'Mainnet'}`);

    return tokenAccountAddress.toBase58();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error deriving token address:', errorMessage);

    if (errorMessage.includes('Invalid public key')) {
      console.error('\n💡 Make sure you provided valid Solana public keys.');
      console.error('   Public keys should be base58 encoded strings.');
    }

    throw error;
  }
}

function getTokenName(tokenMint: string): string {
  const entries = Object.entries(COMMON_TOKENS);
  const found = entries.find(([, mint]) => mint === tokenMint);
  return found ? found[0] : 'Unknown Token';
}

function isDevnetToken(tokenMint: string): boolean {
  return tokenMint === COMMON_TOKENS.USDC_DEVNET ||
         tokenMint === COMMON_TOKENS.USDT_DEVNET;
}

async function main(): Promise<void> {
  console.log('🚀 Token Address Derivation Script');
  console.log('=' .repeat(50));

  const { walletAddress, tokenMint } = parseArgs();

  try {
    const tokenAddress = await deriveTokenAddress(walletAddress, tokenMint);

    console.log('\n🎯 Usage Examples:');
    console.log('  # Check USDC balance:');
    console.log(`  spl-token balance --address ${tokenAddress} --url devnet`);
    console.log('  # Transfer USDC:');
    console.log(`  spl-token transfer ${tokenMint} <amount> ${walletAddress} --url devnet`);

  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}
