#!/usr/bin/zsh

## DEFAULT
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 10.5 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 --url devnet --owner /home/george5492/.config/solana/id.json

## ARBITRATOR
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 10.76 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 --url devnet --owner /home/george5492/repos/ls-contracts-fixed/keys/devnet/program-keypair.json

## BUYER
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 13.95 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 --url devnet --owner /home/george5492/repos/ls-contracts-fixed/keys/buyer-devnet/buyer-keypair.json

## SELLER
spl-token balance --address 2ozy4RSqXbVvrE1kptN3UG4cseGcUEdKLjUQNtTULim8 --url devnet
