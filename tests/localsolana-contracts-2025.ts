import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LocalsolanaContracts2025 } from "../target/types/localsolana_contracts_2025";

describe("localsolana-contracts-2025", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.LocalsolanaContracts2025 as Program<LocalsolanaContracts2025>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
