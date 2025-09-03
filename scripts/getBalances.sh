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

# Function to strip units from balance (convert to plain number)
strip_balance() {
    echo "$1" | awk '{print $1}'
}

# Function to check SOL balance
check_sol_balance() {
    local address=$1

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

# Initialize totals
total_sol=0
total_usdc=0

# Main balance checking
echo -e "${GREEN}Starting balance checks...${NC}\n"

# Table header
printf "%-20s %-15s %-15s\n" "ACCOUNT" "SOL BALANCE" "USDC BALANCE"
echo "------------------------------------------------------------"

# Check seller account
if [ -n "$SELLER_KEYPAIR" ]; then
    seller_address=$(solana-keygen pubkey $SELLER_KEYPAIR 2>/dev/null)
    if [ $? -eq 0 ]; then
        seller_sol=$(check_sol_balance $seller_address)
        seller_usdc=$(check_usdc_balance_for_token_account $SELLER_TOKEN_ADDRESS)
        printf "%-20s %-15s %-15s\n" "SELLER" "$seller_sol" "$seller_usdc"

        # Add to totals
        total_sol=$(echo "$total_sol + $(strip_balance "$seller_sol")" | bc)
        total_usdc=$(echo "$total_usdc + $(strip_balance "$seller_usdc")" | bc)
    fi
fi

# Check buyer account
if [ -n "$BUYER_KEYPAIR" ]; then
    buyer_address=$(solana-keygen pubkey $BUYER_KEYPAIR 2>/dev/null)
    if [ $? -eq 0 ]; then
        buyer_sol=$(check_sol_balance $buyer_address)
        buyer_usdc=$(check_usdc_balance_for_token_account $BUYER_TOKEN_ADDRESS)
        printf "%-20s %-15s %-15s\n" "BUYER" "$buyer_sol" "$buyer_usdc"

        total_sol=$(echo "$total_sol + $(strip_balance "$buyer_sol")" | bc)
        total_usdc=$(echo "$total_usdc + $(strip_balance "$buyer_usdc")" | bc)
    fi
fi

# Check arbitrator account
if [ -n "$ARBITRATOR_KEYPAIR" ]; then
    arbitrator_address=$(solana-keygen pubkey $ARBITRATOR_KEYPAIR 2>/dev/null)
    if [ $? -eq 0 ]; then
        arbitrator_sol=$(check_sol_balance $arbitrator_address)
        arbitrator_usdc=$(check_usdc_balance_for_token_account $ARBITRATOR_TOKEN_ADDRESS)
        printf "%-20s %-15s %-15s\n" "ARBITRATOR" "$arbitrator_sol" "$arbitrator_usdc"

        total_sol=$(echo "$total_sol + $(strip_balance "$arbitrator_sol")" | bc)
        total_usdc=$(echo "$total_usdc + $(strip_balance "$arbitrator_usdc")" | bc)
    fi
fi

# Check original account
if [ -n "$ORIGINAL_ADDRESS" ] && [ -n "$ORIGINAL_TOKEN_ADDRESS" ]; then
    original_sol=$(check_sol_balance $ORIGINAL_ADDRESS)
    original_usdc=$(check_usdc_balance_for_token_account $ORIGINAL_TOKEN_ADDRESS)
    printf "%-20s %-15s %-15s\n" "ORIGINAL ACCOUNT" "$original_sol" "$original_usdc"

    total_sol=$(echo "$total_sol + $(strip_balance "$original_sol")" | bc)
    total_usdc=$(echo "$total_usdc + $(strip_balance "$original_usdc")" | bc)
fi

echo "------------------------------------------------------------"

# Print totals
printf "%-20s %-15s %-15s\n" "TOTAL" "$total_sol SOL" "$total_usdc USDC"

# Summary
echo -e "\n${GREEN}Balance check complete!${NC}"
