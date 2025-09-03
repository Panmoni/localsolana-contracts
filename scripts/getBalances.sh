#!/usr/bin/zsh

# Load environment variables
source .env

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== SOLANA ESCROW CONTRACT BALANCE CHECKER ===${NC}\n"

# Function to check SOL balance
check_sol_balance() {
    local address=$1
    local label=$2

    local balance=$(solana balance $address --url $ANCHOR_PROVIDER_URL 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "$balance"
    else
        echo "Error"
    fi
}

# Function to check USDC balance for a token account address
check_usdc_balance_for_token_account() {
    local token_account_address=$1

    if [ -n "$token_account_address" ] && [ "$token_account_address" != "null" ]; then
        local balance=$(spl-token balance --address $token_account_address --url $ANCHOR_PROVIDER_URL 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "$balance"
        else
            echo "Error"
        fi
    else
        echo "Not set"
    fi
}

# Main balance checking
echo -e "${GREEN}Starting balance checks...${NC}\n"

# Table header
printf "%-20s %-15s %-15s\n" "ACCOUNT" "SOL BALANCE" "USDC BALANCE"
echo "------------------------------------------------------------"

# Check seller account
if [ -n "$SELLER_KEYPAIR" ]; then
    local seller_address=$(solana-keygen pubkey $SELLER_KEYPAIR 2>/dev/null)
    if [ $? -eq 0 ]; then
        local seller_sol=$(check_sol_balance $seller_address "SELLER")
        local seller_usdc=$(check_usdc_balance_for_token_account $SELLER_TOKEN_ADDRESS)
        printf "%-20s %-15s %-15s\n" "SELLER" "$seller_sol" "$seller_usdc"
    fi
fi

# Check buyer account
if [ -n "$BUYER_KEYPAIR" ]; then
    local buyer_address=$(solana-keygen pubkey $BUYER_KEYPAIR 2>/dev/null)
    if [ $? -eq 0 ]; then
        local buyer_sol=$(check_sol_balance $buyer_address "BUYER")
        local buyer_usdc=$(check_usdc_balance_for_token_account $BUYER_TOKEN_ADDRESS)
        printf "%-20s %-15s %-15s\n" "BUYER" "$buyer_sol" "$buyer_usdc"
    fi
fi

# Check arbitrator account
if [ -n "$ARBITRATOR_KEYPAIR" ]; then
    local arbitrator_address=$(solana-keygen pubkey $ARBITRATOR_KEYPAIR 2>/dev/null)
    if [ $? -eq 0 ]; then
        local arbitrator_sol=$(check_sol_balance $arbitrator_address "ARBITRATOR")
        local arbitrator_usdc=$(check_usdc_balance_for_token_account $ARBITRATOR_TOKEN_ADDRESS)
        printf "%-20s %-15s %-15s\n" "ARBITRATOR" "$arbitrator_sol" "$arbitrator_usdc"
    fi
fi

# Check the original account using environment variables
if [ -n "$ORIGINAL_ADDRESS" ] && [ -n "$ORIGINAL_TOKEN_ADDRESS" ]; then
    local original_sol=$(check_sol_balance $ORIGINAL_ADDRESS "ORIGINAL")
    local original_usdc=$(check_usdc_balance_for_token_account $ORIGINAL_TOKEN_ADDRESS)
    printf "%-20s %-15s %-15s\n" "ORIGINAL ACCOUNT" "$original_sol" "$original_usdc"
fi

echo "------------------------------------------------------------"

# Summary
echo -e "\n${GREEN}Balance check complete!${NC}"
