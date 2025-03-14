
# Borsch Error GRR

The error

  Failed to serialize or deserialize account data: Unknown
  …BorshIoError("Not all bytes read")

usually means that the space allocated for your account is not exactly equal to the number of bytes Borsh expects while serializing/deserializing your Escrow struct. In your CreateEscrow account, you’re using

  space = 8 + std::mem::size_of::<Escrow>()

However, std::mem::size_of::<Escrow>() reflects the Rust memory size of your struct, not the size it will have when Borsh–serialized. In particular, Borsh adds extra bytes for Option types (which are typically encoded with an extra 1-byte flag) and enums (which may be a u8) that aren’t captured by std::mem::size_of. Because the allocated space is off (often too large or too small), when the program later deserializes the account data it finds extra bytes left over or not enough bytes to match its expected layout.

Here’s how to fix it:

────────────────────────────
Step 1. Manually Calculate the Serialized Size

For your Escrow struct:

  pub struct Escrow {
    pub escrow_id: u64,                // 8 bytes
    pub trade_id: u64,                 // 8 bytes
    pub seller: Pubkey,                // 32 bytes
    pub buyer: Pubkey,                 // 32 bytes
    pub arbitrator: Pubkey,            // 32 bytes
    pub amount: u64,                   // 8 bytes
    pub fee: u64,                      // 8 bytes
    pub deposit_deadline: i64,         // 8 bytes
    pub fiat_deadline: i64,            // 8 bytes
    pub state: EscrowState,            // For most enums with Anchor, this is 1 byte
    pub sequential: bool,              // 1 byte
    pub sequential_escrow_address: Option<Pubkey>, // 1 + 32 = 33 bytes
    pub fiat_paid: bool,               // 1 byte
    pub counter: u64,                  // 8 bytes
    pub dispute_initiator: Option<Pubkey>,         // 1 + 32 = 33 bytes
    pub dispute_initiated_time: Option<i64>,       // 1 + 8  = 9 bytes
    pub dispute_evidence_hash_buyer: Option<[u8;32]>,// 1 + 32 = 33 bytes
    pub dispute_evidence_hash_seller: Option<[u8;32]>,// 1 + 32 = 33 bytes
    pub dispute_resolution_hash: Option<[u8;32]>     // 1 + 32 = 33 bytes
  }

Let’s add them together (remember Borsh serialization does not “pack” the array fields in the same way as in memory):

  8 (escrow_id)
  +8 (trade_id)
  +32 (seller)
  +32 (buyer)
  +32 (arbitrator)
  +8 (amount)
  +8 (fee)
  +8 (deposit_deadline)
  +8 (fiat_deadline)
  +1 (state)
  +1 (sequential)
  +33 (sequential_escrow_address)
  +1 (fiat_paid)
  +8 (counter)
  +33 (dispute_initiator)
  +9 (dispute_initiated_time)
  +33 (dispute_evidence_hash_buyer)
  +33 (dispute_evidence_hash_seller)
  +33 (dispute_resolution_hash)
  = 329 bytes

Then add 8 bytes for the account discriminator that Anchor prefixes to every account. The total serialized size is:

  8 + 329 = 337 bytes

Step 2. Update Your CreateEscrow Account Constraint

In your CreateEscrow account struct, change the space value from

  space = 8 + std::mem::size_of::<Escrow>()

to a fixed value matching our calculation:

  space = 337

For example, update it like this:

  #[account(
    init,
    payer = seller,
    space = 337,
    seeds = [b"escrow", escrow_id.to_le_bytes().as_ref(), trade_id.to_le_bytes().as_ref()],
    bump
  )]
  pub escrow: Account<'info, Escrow>,

Step 3. Rebuild and Test

Save your changes and run

  anchor test

Your create_escrow instruction should now correctly allocate an account with exactly 337 bytes. This should prevent the error “Not all bytes read” when Borsh deserializes your Escrow account.
