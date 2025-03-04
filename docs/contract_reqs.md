# LocalSolana: Cross-Border P2P Marketplace

## Secure, Sequential Escrow with Advanced Dispute Resolution on Solana

## 1. Introduction

This document outlines the requirements for implementing the LocalSolana Sequential Escrow system on the Solana blockchain. The implementation will be for the Solana ecosystem using Rust and Anchor framework, enabling secure peer-to-peer trades across borders with chained transactions.

### 1.1 Project Overview

The LocalSolana Sequential Escrow system is a secure escrow mechanism that facilitates both P2P (peer-to-peer) and chained remittance trades using a stablecoin (USDC) on the Solana blockchain. The system enforces rules for deposit, fiat confirmation, release, cancellation and dispute handling, with a particular focus on enabling sequential multi-party trades for cross-border transactions.

### 1.2 Key Constraints

- **Maximum Amount**: 100 USDC per escrow (until public beta)
- **Fee Structure**: 1% fee added to the escrow principal amount for the seller
- **Timeouts**:
  - Deposit Deadline: 15 minutes from order initiation
  - Fiat Confirmation Deadline: 30 minutes after funding

## 2. Data Structures

### 2.1 Escrow State Enum

The escrow can exist in one of the following states:

```rust
pub enum EscrowState {
    Created,
    Funded,
    Released,
    Cancelled,
    Disputed,
    Resolved
}
```

### 2.2 Escrow Account Structure

The main account structure to store escrow data:

```rust
pub struct Escrow {
    escrow_id: u64,
    trade_id: u64,
    seller: Pubkey,
    buyer: Pubkey,
    arbitrator: Pubkey,
    amount: u64,
    fee: u64,
    deposit_deadline: i64,
    fiat_deadline: i64,
    state: EscrowState,
    sequential: bool,
    sequential_escrow_address: Option<Pubkey>,
    fiat_paid: bool,
    counter: u64,
    // Dispute resolution fields
    dispute_initiator: Option<Pubkey>,
    dispute_initiated_time: Option<i64>,
    dispute_evidence_hash_buyer: Option<[u8; 32]>,
    dispute_evidence_hash_seller: Option<[u8; 32]>,
    dispute_resolution_hash: Option<[u8; 32]>
}
```

### 2.3 Token Account

A separate token account will be created to hold the escrowed USDC funds.

### 2.4 Dispute Bond Accounts

Two additional token accounts will be created to hold dispute bonds from buyer and seller when a dispute is initiated:

```rust
pub struct DisputeBonds {
    buyer_bond: Option<Pubkey>,    // Token account containing buyer's bond
    seller_bond: Option<Pubkey>,   // Token account containing seller's bond
    bond_amount_buyer: u64,        // Amount of buyer's bond in USDC (5% of transaction)
    bond_amount_seller: u64,       // Amount of seller's bond in USDC (5% of transaction)
    buyer_submitted: bool,         // Whether buyer has submitted bond
    seller_submitted: bool,        // Whether seller has submitted bond
}
```

## 3. Events

The contract should emit the following events to track escrow state changes:

1. **EscrowCreated**:
   - object_id, escrow_id, trade_id, seller, buyer, arbitrator, amount, fee, deposit_deadline, fiat_deadline, sequential, sequential_escrow_address, timestamp

2. **FundsDeposited**:
   - object_id, escrow_id, trade_id, amount, fee, counter, timestamp

3. **FiatMarkedPaid**:
   - object_id, escrow_id, trade_id, timestamp

4. **EscrowReleased**:
   - object_id, escrow_id, trade_id, buyer, amount, fee, counter, timestamp, destination

5. **EscrowCancelled**:
   - object_id, escrow_id, trade_id, seller, amount, fee, counter, timestamp

6. **DisputeOpened**:
   - object_id, escrow_id, trade_id, disputing_party, timestamp, evidence_hash, bond_amount

7. **DisputeResponseSubmitted**:
   - object_id, escrow_id, trade_id, responding_party, timestamp, evidence_hash, bond_amount

8. **DisputeResolved**:
   - object_id, escrow_id, trade_id, decision, fee, counter, timestamp, resolution_hash, winner, explanation_reference

9. **DisputeDefaultJudgment**:
   - object_id, escrow_id, trade_id, defaulting_party, decision, timestamp

## 4. Constants

```rust
// Maximum amount allowed (100 USDC)
const MAX_AMOUNT: u64 = 100_000_000; // 6 decimals for USDC
    
// Fee percentage (1%)
const FEE_BASIS_POINTS: u64 = 100; // 1% = 100 basis points

// Dispute bond percentage (5%)
const DISPUTE_BOND_BASIS_POINTS: u64 = 500; // 5% = 500 basis points
    
// Deadlines
const DEPOSIT_DEADLINE_MINUTES: i64 = 15; // 15 minutes from order initiation
const FIAT_DEADLINE_MINUTES: i64 = 30;    // 30 minutes after funding
const DISPUTE_RESPONSE_DEADLINE_HOURS: i64 = 72; // 72 hours to respond to dispute
const ARBITRATION_DEADLINE_HOURS: i64 = 168;     // 7 days for arbitrator to make decision

// Authority addresses
const ARBITRATOR_ADDRESS: &str = "DyKS1ywHcLwJCNFgY8yxN2pRRgnkpu3YwKAttuy9kdLP";
const UPGRADE_AUTHORITY: &str = "DyKS1ywHcLwJCNFgY8yxN2pRRgnkpu3YwKAttuy9kdLP";
```

## 5. Error Codes

```rust
// Error codes
const E100: u32 = 100; // Invalid amount: Zero or negative
const E101: u32 = 101; // Amount exceeds maximum (100 USDC)
const E102: u32 = 102; // Unauthorized caller
const E103: u32 = 103; // Deposit deadline expired
const E104: u32 = 104; // Fiat payment deadline expired
const E105: u32 = 105; // Invalid state transition
const E106: u32 = 106; // Missing sequential escrow address
const E107: u32 = 107; // Already in terminal state
const E108: u32 = 108; // Fee calculation error
const E109: u32 = 109; // Insufficient funds to cover principal and fee
const E110: u32 = 110; // Dispute bond amount incorrect
const E111: u32 = 111; // Dispute response deadline expired
const E112: u32 = 112; // Evidence hash missing or invalid
const E113: u32 = 113; // Duplicate evidence submission
const E114: u32 = 114; // Arbitration deadline expired
const E115: u32 = 115; // Missing dispute bond
const E116: u32 = 116; // Invalid resolution explanation
```

## 6. Public Functions

### 6.1 Create Escrow

**Function**: `create_escrow`

**Purpose**: Initializes a new escrow with the provided parameters.

**Parameters**:
- `seller`: Pubkey
- `buyer`: Pubkey
- `amount`: u64
- `escrow_id`: u64
- `trade_id`: u64
- `sequential`: bool
- `sequential_escrow_address`: Option<Pubkey>

**Preconditions**:
- Caller must be the seller
- Amount must be > 0 and <= MAX_AMOUNT
- If sequential is true, sequential_escrow_address must be provided

**Process**:
1. Validate all preconditions
2. Calculate fee (1% of principal)
3. Calculate deposit deadline (current time + 15 minutes)
4. Create escrow account
5. Emit EscrowCreated event

### 6.2 Fund Escrow

**Function**: `fund_escrow`

**Purpose**: Allows the seller to fund the escrow with the agreed amount plus fee.

**Parameters**:
- Escrow account reference
- USDC token amount

**Preconditions**:
- Caller must be the seller
- Escrow must be in Created state
- Current time must be before deposit deadline
- Amount must match exactly (principal + fee)

**Process**:
1. Validate all preconditions
2. Transfer USDC from seller to escrow token account
3. Update escrow state to Funded
4. Update counter
5. Set fiat deadline (current time + 30 minutes)
6. Emit FundsDeposited event

### 6.3 Mark Fiat Paid

**Function**: `mark_fiat_paid`

**Purpose**: Allows the buyer to confirm they've sent the fiat payment.

**Parameters**:
- Escrow account reference

**Preconditions**:
- Caller must be the buyer
- Escrow must be in Funded state
- Current time must be before fiat deadline

**Process**:
1. Validate all preconditions
2. Update fiat_paid flag to true
3. Emit FiatMarkedPaid event

### 6.4 Update Sequential Address

**Function**: `update_sequential_address`

**Purpose**: Allows the buyer to provide or update the sequential escrow address.

**Parameters**:
- Escrow account reference
- New address: Pubkey

**Preconditions**:
- Caller must be the buyer
- Escrow must be sequential
- Escrow must not be in a terminal state (Released, Cancelled, Resolved)

**Process**:
1. Validate all preconditions
2. Update sequential_escrow_address

### 6.5 Release Escrow

**Function**: `release_escrow`

**Purpose**: Releases funds to the buyer or sequential escrow account.

**Parameters**:
- Escrow account reference

**Preconditions**:
- Caller must be seller or arbitrator
- Escrow must be in Funded state
- Fiat must be marked as paid
- For sequential trades, sequential_escrow_address must exist

**Process**:
1. Validate all preconditions
2. Split funds: principal and fee
3. Transfer fee to arbitrator
4. If sequential, transfer principal to sequential_escrow_address
   Else, transfer principal to buyer
5. Update escrow state to Released
6. Increment counter
7. Emit EscrowReleased event

### 6.6 Cancel Escrow

**Function**: `cancel_escrow`

**Purpose**: Cancels the escrow and returns funds to the seller.

**Parameters**:
- Escrow account reference

**Preconditions**:
- Caller must be seller or arbitrator
- Fiat must not be marked as paid
- Escrow must be in Created or Funded state

**Process**:
1. Validate all preconditions
2. If escrow is funded, return funds to seller
3. Update escrow state to Cancelled
4. Increment counter
5. Emit EscrowCancelled event

### 6.7 Open Dispute With Bond

**Function**: `open_dispute_with_bond`

**Purpose**: Allows buyer or seller to open a dispute when fiat is paid, including a 5% bond.

**Parameters**:
- Escrow account reference
- USDC bond amount (5% of transaction value)
- Evidence hash (SHA-256 of evidence file and statement)

**Preconditions**:
- Caller must be buyer or seller
- Escrow must be in Funded state
- Fiat must be marked as paid
- Bond amount must be exactly 5% of transaction value
- Evidence hash must be valid

**Process**:
1. Validate all preconditions
2. Update escrow state to Disputed
3. Store dispute initiator's address
4. Store dispute initiation timestamp
5. Transfer bond to dispute bond account
6. Store evidence hash in appropriate field (buyer or seller)
7. Set dispute response deadline (current time + 72 hours)
8. Emit DisputeOpened event

### 6.8 Respond To Dispute With Bond

**Function**: `respond_to_dispute_with_bond`

**Purpose**: Allows the non-initiating party to respond to a dispute with their own bond and evidence.

**Parameters**:
- Escrow account reference
- USDC bond amount (5% of transaction value)
- Evidence hash (SHA-256 of evidence file and statement)

**Preconditions**:
- Caller must be the non-initiating party (buyer or seller)
- Escrow must be in Disputed state
- Current time must be before dispute response deadline
- Bond amount must be exactly 5% of transaction value
- Evidence hash must be valid

**Process**:
1. Validate all preconditions
2. Transfer bond to dispute bond account
3. Store evidence hash in appropriate field
4. Set arbitration deadline (current time + 168 hours)
5. Emit DisputeResponseSubmitted event

### 6.9 Default Judgment

**Function**: `default_judgment`

**Purpose**: Allows the arbitrator to issue a default judgment if the opposing party fails to respond.

**Parameters**:
- Escrow account reference
- Decision (in favor of responding party)

**Preconditions**:
- Caller must be the arbitrator
- Escrow must be in Disputed state
- Dispute response deadline must have passed
- One party must have failed to submit evidence/bond

**Process**:
1. Validate all preconditions
2. Determine winning party (always the party who submitted evidence/bond)
3. Transfer escrow funds to winning party
4. Return bond to winning party
5. Update escrow state to Resolved
6. Emit DisputeDefaultJudgment event

### 6.10 Resolve Dispute With Explanation

**Function**: `resolve_dispute_with_explanation`

**Purpose**: Allows the arbitrator to resolve a dispute with an explanation.

**Parameters**:
- Escrow account reference
- Decision: bool (true = release to buyer, false = return to seller)
- Explanation hash (SHA-256 of arbitrator's explanation)

**Preconditions**:
- Caller must be the arbitrator
- Escrow must be in Disputed state
- Both dispute bonds must be present
- Both evidence hashes must be present
- Explanation hash must be valid
- Current time must be before arbitration deadline

**Process**:
1. Validate all preconditions
2. Store resolution hash
3. If decision is true:
   - Split escrow funds: principal and fee
   - Transfer fee to arbitrator
   - Transfer principal to buyer or sequential escrow
   - Return buyer's bond
   - Transfer seller's bond to platform fee address
4. If decision is false:
   - Transfer all escrow funds to seller
   - Return seller's bond
   - Transfer buyer's bond to platform fee address
5. Update escrow state to Resolved
6. Increment counter
7. Emit DisputeResolved event

### 6.11 Auto-cancel

**Function**: `auto_cancel`

**Purpose**: Automatically cancels an escrow if deadlines have expired.

**Parameters**:
- Escrow account reference

**Preconditions**:
- Caller must be the arbitrator
- For Created state: current time > deposit deadline
- For Funded state: current time > fiat deadline and !fiat_paid
- Escrow must not be in a terminal state

**Process**:
1. Validate all preconditions
2. If funds are present, return them to seller
3. Update escrow state to Cancelled
4. Increment counter
5. Emit EscrowCancelled event

## 7. View Functions

### 7.1 Get Escrow Details

**Function**: `get_escrow_details`

**Purpose**: Retrieves basic escrow information.

**Returns**: Tuple containing escrow_id, trade_id, seller, buyer, amount, fee, deposit_deadline, fiat_deadline, sequential, fiat_paid

### 7.2 Get Escrow State

**Function**: `get_escrow_state`

**Purpose**: Returns the current state of the escrow.

**Returns**: EscrowState enum value

### 7.3 Is Active

**Function**: `is_active`

**Purpose**: Checks if escrow is not in a terminal state.

**Returns**: Boolean (true if active)

### 7.4 Has Sequential Address

**Function**: `has_sequential_address`

**Purpose**: Checks if sequential escrow address is set.

**Returns**: Boolean

### 7.5 Get Dispute Details

**Function**: `get_dispute_details`

**Purpose**: Retrieves dispute-related information.

**Returns**: Tuple containing dispute_initiator, dispute_initiated_time, buyer_evidence_submitted, seller_evidence_submitted, dispute_response_deadline, dispute_resolution_hash

## 8. Solana-Specific Implementation Requirements

### 8.1 Account Structure

1. **Program-Derived Addresses (PDAs)**:
   - Use PDAs to derive the escrow account address
   - Use PDAs to derive the escrow token account address
   - Use PDAs to derive the dispute bond account addresses

2. **Seeds for PDAs**:
   - Escrow account: [prefix, escrow_id, trade_id]
   - Token account: [prefix, escrow_account_pubkey]
   - Buyer bond account: [prefix, "buyer_bond", escrow_account_pubkey]
   - Seller bond account: [prefix, "seller_bond", escrow_account_pubkey]

### 8.2 Token Handling

1. **SPL Token Integration**:
   - Use the Solana Program Library (SPL) Token program for USDC transfers
   - Implement Token Program Cross-Program Invocation (CPI) calls for transfers
   - Create separate token accounts for escrow principal and dispute bonds

### 8.3 Timestamp Handling

1. **Solana Clock**:
   - Use Solana's on-chain Clock sysvar for timestamp verification
   - Calculate deadlines based on Unix timestamp (seconds since epoch)

## 9. Security Considerations

1. **Access Control**:
   - Enforce proper signature verification for all actions
   - Validate that only authorized parties can perform specific actions

2. **Reentrancy Protection**:
   - Implement checks to prevent reentrancy attacks

3. **Arithmetic Overflow/Underflow**:
   - Use checked arithmetic operations for all calculations

4. **Token Account Validation**:
   - Verify token account ownership before transfers
   - Confirm token mint is the expected USDC mint

5. **Hash Validation**:
   - Validate that submitted evidence and explanation hashes are 32 bytes (proper SHA-256 format)

## 10. Testing Requirements

1. **Unit Tests**:
   - Test each function independently
   - Test error cases and edge conditions

2. **Integration Tests**:
   - Test the full escrow lifecycle
   - Test sequential escrow flows
   - Test dispute resolution workflow
   - Test default judgment scenarios

3. **Test Helpers**:
   - Implement test-only functions to facilitate testing
   - Create mock evidence and explanation hashes for testing

## 11. Program Upgrade Strategy

1. **Program Upgradability**:
   - Program will be deployed using BPFLoaderUpgradeable to allow for future updates
   - The upgrade authority will be set to `DyKS1ywHcLwJCNFgY8yxN2pRRgnkpu3YwKAttuy9kdLP`
   - All program upgrades will follow a transparent changelog process
   - Future implementation may include a time-lock mechanism for upgrades
   - Consider transitioning to governance-controlled upgrades in later phases

[doc.rust-lang.org](https://doc.rust-lang.org/1.20.0/reference/items.html) should be referenced for proper Rust module organization and item visibility.

## 12. Performance Optimizations

1. **Compute Budget**:
   - Optimize operations to minimize compute units used
   - Consider batching operations where possible

2. **Account Size**:
   - Minimize account size to reduce rent costs

[move-language.github.io](https://move-language.github.io/move/constants.html) cites style guidelines for naming constants which should be carried over to the Rust implementation.

## 13. Database Integration

### 13.1 Dispute Evidence Storage

The on-chain program will store only hashes of evidence, while the actual evidence will be stored off-chain:

```sql
CREATE TABLE dispute_evidence (
    id SERIAL PRIMARY KEY,
    escrow_id BIGINT REFERENCES escrows(id),
    trade_id BIGINT REFERENCES trades(id),
    submitter_address TEXT NOT NULL,
    submission_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    evidence_text TEXT NOT NULL,
    pdf_s3_path TEXT NOT NULL,
    evidence_hash TEXT NOT NULL,
    is_initial_submission BOOLEAN DEFAULT FALSE
);
```

### 13.2 Dispute Resolutions Storage

Similarly, detailed arbitrator explanations will be stored off-chain:

```sql
CREATE TABLE dispute_resolutions (
    id SERIAL PRIMARY KEY,
    dispute_id BIGINT REFERENCES disputes(id),
    arbitrator_address TEXT NOT NULL,
    resolution_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decision TEXT NOT NULL,
    decision_explanation TEXT NOT NULL,
    decision_hash TEXT NOT NULL,
    winner_address TEXT NOT NULL,
    funds_destination TEXT NOT NULL
);
```

## 14. Implementation Phases

### 14.1 Phase 1

1. Basic escrow functionality:
   - Create, fund, release, cancel functions
   - State management
   - Sequential escrow support

2. Basic dispute functionality:
   - Open dispute (without bond)
   - Simple arbitration

### 14.2 Phase 2

1. Enhanced dispute system:
   - Bond requirements
   - Evidence hashing
   - Database integration
   - Default judgment

### 14.3 Phase 3

1. Advanced features:
   - Reputation system
   - Appeal process
   - Community arbitration

## 15. API Integration

### 15.1 Required Endpoints

1. **Dispute Management**:
   - `/api/v1/disputes/initiate` - Initiate dispute with evidence
   - `/api/v1/disputes/respond` - Respond to dispute with evidence
   - `/api/v1/disputes/evidence` - Retrieve evidence
   - `/api/v1/disputes/status` - Check dispute status
   - `/api/v1/disputes/resolve` - Resolve dispute (arbitrator only)

2. **Escrow Management**:
   - `/api/v1/escrows/create` - Create new escrow
   - `/api/v1/escrows/fund` - Fund escrow
   - `/api/v1/escrows/mark-paid` - Mark fiat as paid
   - `/api/v1/escrows/release` - Release escrow
   - `/api/v1/escrows/cancel` - Cancel escrow

### 15.2 Webhook Notifications

1. **Event Notifications**:
   - Dispute initiated
   - Evidence submitted
   - Response deadline approaching
   - Default judgment issued
   - Dispute resolved

### 15.3 Evidence Storage

1. **S3 Integration**:
   - Secure upload to AWS S3
   - Access control based on user role
   - Versioning and tamper protection
   - Hash verification

## 16. User Interface Requirements

1. **Dispute Process**:
   - Evidence submission form
   - PDF template download
   - Dispute status tracking
   - Countdown timers

2. **Arbitrator Dashboard**:
   - Case list with priority order
   - Evidence comparison view
   - Decision input form
   - Resolution guidelines reference

3. **Notification Center**:
   - Alert for dispute initiation
   - Reminder for dispute response
   - Resolution notification
   - Appeal information