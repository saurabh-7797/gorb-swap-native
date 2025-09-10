# TypeScript AMM Scripts - Complete Implementation

This directory contains TypeScript implementations of all AMM functions based on the `cargo_swap.json` IDL file. Each script corresponds to a specific function in the AMM program with proper flow numbering.

## 📋 Script Overview

| Script | Function | Discriminant | Purpose |
|--------|----------|--------------|---------|
| `ts-1-init-pool.ts` | InitPool | 0 | Initialize a new liquidity pool |
| `ts-2-add-liquidity.ts` | AddLiquidity | 1 | Add liquidity to an existing pool |
| `ts-3-remove-liquidity.ts` | RemoveLiquidity | 2 | Remove liquidity from a pool |
| `ts-4-swap.ts` | Swap | 3 | Perform a direct token swap |
| `ts-5-multihop-swap.ts` | MultihopSwap | 4 | Perform a multihop swap through multiple pools |
| `ts-6-multihop-swap-with-path.ts` | MultihopSwapWithPath | 5 | Perform a multihop swap with custom token path |

## 🚀 Execution Flow

### 1. **ts-1-init-pool.ts** - Initialize Pool
```typescript
// Function: InitPool (discriminant: 0)
// Args: amountA (u64), amountB (u64)
```

**Purpose:**
- Creates a new liquidity pool between two tokens
- Generates LP (Liquidity Provider) tokens
- Sets up vault accounts for token storage
- Establishes initial pool state

**Key Features:**
- ✅ Pool PDA derivation
- ✅ Vault account creation
- ✅ LP mint initialization
- ✅ Initial liquidity provision
- ✅ Balance tracking and verification

**Output Files:**
- `pool-ab-info.json` - Pool configuration and addresses

---

### 2. **ts-2-add-liquidity.ts** - Add Liquidity
```typescript
// Function: AddLiquidity (discriminant: 1)
// Args: amountA (u64), amountB (u64)
```

**Purpose:**
- Adds more liquidity to an existing pool
- Mints LP tokens proportional to the added liquidity
- Maintains pool ratio and state

**Key Features:**
- ✅ Proportional liquidity addition
- ✅ LP token minting
- ✅ Balance verification
- ✅ Change tracking

**Dependencies:**
- Requires `pool-ab-info.json` from previous step

---

### 3. **ts-3-remove-liquidity.ts** - Remove Liquidity
```typescript
// Function: RemoveLiquidity (discriminant: 2)
// Args: lpAmount (u64)
```

**Purpose:**
- Removes liquidity from a pool
- Burns LP tokens
- Returns proportional token amounts

**Key Features:**
- ✅ LP token burning
- ✅ Proportional token withdrawal
- ✅ Removal ratio calculation
- ✅ Balance verification

**Dependencies:**
- Requires `pool-ab-info.json` from previous steps

---

### 4. **ts-4-swap.ts** - Direct Swap
```typescript
// Function: Swap (discriminant: 3)
// Args: amountIn (u64), directionAToB (bool)
```

**Purpose:**
- Performs a direct token swap within a single pool
- Implements constant product market maker formula
- Calculates slippage and exchange rates

**Key Features:**
- ✅ Directional swapping (A→B or B→A)
- ✅ Slippage calculation
- ✅ Exchange rate analysis
- ✅ Balance tracking

**Dependencies:**
- Requires `pool-ab-info.json` from previous steps

---

### 5. **ts-5-multihop-swap.ts** - Multihop Swap
```typescript
// Function: MultihopSwap (discriminant: 4)
// Args: amountIn (u64), minimumAmountOut (u64)
```

**Purpose:**
- Performs a multihop swap through multiple pools
- Enables complex trading paths (e.g., A→B→C)
- Implements minimum output protection

**Key Features:**
- ✅ Multi-pool routing
- ✅ Minimum output protection
- ✅ Effective rate calculation
- ✅ Path analysis

**Dependencies:**
- Requires `pool-ab-info.json` and `pool-bc-info.json`

---

### 6. **ts-6-multihop-swap-with-path.ts** - Multihop Swap With Path
```typescript
// Function: MultihopSwapWithPath (discriminant: 5)
// Args: amountIn (u64), minimumAmountOut (u64), tokenPath (Vec<PublicKey>)
```

**Purpose:**
- Performs a multihop swap with a custom token path
- Enables complex routing strategies
- Supports arbitrary path lengths

**Key Features:**
- ✅ Custom token path specification
- ✅ Dynamic path length support
- ✅ Path efficiency calculation
- ✅ Advanced routing analysis

**Dependencies:**
- Requires multiple pool info files (ab, bc, cd)

## 🛠️ Technical Implementation Details

### **Instruction Discriminators**
Each function uses a specific discriminator byte to identify the instruction:

```typescript
const discriminators = {
  InitPool: 0,
  AddLiquidity: 1,
  RemoveLiquidity: 2,
  Swap: 3,
  MultihopSwap: 4,
  MultihopSwapWithPath: 5
};
```

### **Data Serialization**
All instruction data is properly serialized using BigUint64Array for u64 values:

```typescript
// Example for InitPool
const instructionData = Buffer.concat([
  Buffer.from([0]), // Discriminator
  Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountA)]).buffer)),
  Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountB)]).buffer)),
]);
```

### **Account Management**
Each script properly manages all required accounts:

- **Pool PDA**: Program Derived Address for pool state
- **Token Mints**: Token definition accounts
- **Vaults**: Token storage accounts
- **User ATAs**: User's token wallets
- **System Programs**: Required system accounts

### **Error Handling**
Comprehensive error handling with detailed logging:

```typescript
try {
  // Transaction execution
} catch (error) {
  console.error("❌ Error:", error);
  throw error;
}
```

## 📊 Data Flow and State Management

### **State Persistence**
Each script saves its results to JSON files for subsequent scripts:

```
ts-1-init-pool.ts → pool-ab-info.json
ts-2-add-liquidity.ts → pool-ab-info.json (updated)
ts-3-remove-liquidity.ts → pool-ab-info.json (updated)
ts-4-swap.ts → pool-ab-info.json (updated)
ts-5-multihop-swap.ts → multihop-swap-results.json
ts-6-multihop-swap-with-path.ts → multihop-swap-with-path-results.json
```

### **Balance Tracking**
Each script provides comprehensive balance tracking:

- **Before/After balances** for all relevant accounts
- **Change calculations** with detailed breakdowns
- **Rate analysis** and slippage calculations
- **Efficiency metrics** for complex operations

## 🚀 Usage Instructions

### **Prerequisites**
1. Node.js with TypeScript support
2. Solana CLI configured
3. Required token accounts and pools

### **Execution Order**
```bash
# 1. Initialize pool
npx ts-node ts-1-init-pool.ts

# 2. Add liquidity
npx ts-node ts-2-add-liquidity.ts

# 3. Remove liquidity
npx ts-node ts-3-remove-liquidity.ts

# 4. Perform swap
npx ts-node ts-4-swap.ts

# 5. Multihop swap
npx ts-node ts-5-multihop-swap.ts

# 6. Multihop swap with path
npx ts-node ts-6-multihop-swap-with-path.ts
```

### **Configuration**
Update the configuration section in each script:

```typescript
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const AMM_PROGRAM_ID = new PublicKey("8qhCTESZN9xDCHvtXFdCHfsgcctudbYdzdCFzUkTTMMe");
const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
```

## 📈 Advanced Features

### **Slippage Protection**
- Minimum output amounts for swaps
- Slippage calculation and reporting
- Rate difference analysis

### **Path Optimization**
- Custom token path specification
- Path efficiency calculation
- Multi-pool routing analysis

### **Comprehensive Logging**
- Detailed transaction information
- Balance change tracking
- Performance metrics
- Error reporting

## 🔧 Customization

### **Token Amounts**
Modify the amount parameters in each script:

```typescript
const amountA = 1_000_000_000; // 1 token (adjust as needed)
const amountB = 1_000_000_000; // 1 token (adjust as needed)
```

### **Pool Ratios**
Adjust initial pool ratios:

```typescript
const amountA = 2_000_000_000; // 2 tokens
const amountB = 3_000_000_000; // 3 tokens (2:3 ratio)
```

### **Slippage Tolerance**
Set minimum output amounts:

```typescript
const minimumAmountOut = 800_000_000; // 0.8 tokens (20% slippage tolerance)
```

## 📝 Output Examples

### **Pool Initialization**
```
🚀 TypeScript Script 1: Initializing Pool...
Token A: 2aFDtPPqgioYe4kCHSSL3kPQh5vDCNB8RYUNcD6QXuGu
Token B: 3RMVAGmP73vWUaV3bj9QNCfLUZWtnuLfQwGgfKhGBBua
LP Mint: J3Mk3vgoodi9N8qrqcqTkD8EQzZd2eBYZo8FaKPSjDXm
Pool PDA: CQfN6RTXhYSXBRt4Fy7ZuZjDzohZozjh5iAtE7MpeJF4
✅ Pool initialized successfully!
```

### **Swap Analysis**
```
📊 Swap Analysis:
Expected output: 0.500000
Actual output: 0.498750
Slippage: 0.2500%
```

## 🎯 Key Benefits

1. **Type Safety**: Full TypeScript implementation with proper types
2. **IDL Compliance**: Exact implementation of cargo_swap.json IDL
3. **Comprehensive Logging**: Detailed transaction and balance tracking
4. **Error Handling**: Robust error handling and reporting
5. **Modular Design**: Each script is independent and reusable
6. **State Management**: Proper state persistence between scripts
7. **Advanced Features**: Slippage protection, path optimization, rate analysis

This implementation provides a complete, production-ready TypeScript interface for the AMM program with all functions properly implemented according to the IDL specification.
