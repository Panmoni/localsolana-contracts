#!/bin/bash
# This script ensures your keypair is always in the right place

# Create the deploy directory if it doesn't exist
mkdir -p target/deploy

# Copy the keypair (using copy instead of symlink for reliability)
# cp keys/program-keypair.json target/deploy/localsolana_contracts-keypair.json

cp keys/program-devnet/program-keypair.json target/deploy/localsolana_contracts-keypair.json

echo "Program keypair installed."
