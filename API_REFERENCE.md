# 📚 AMM Contract API Reference

## 🎯 **Quick Reference**

### **Program ID:** `8qhCTESZN9xDCHvtXFdCHfsgcctudbYdzdCFzUkTTMMe`
### **Network:** GorbChain
### **RPC:** `https://rpc.gorbchain.xyz`

---

## 📋 **Instruction Reference**

### **1. InitPool**
```rust
InitPool { amount_a: u64, amount_b: u64 }
```
- **Discriminator:** `0`
- **Purpose:** Create new liquidity pool
- **Accounts:** 13 accounts required
- **Returns:** `ProgramResult`

### **2. AddLiquidity**
```rust
AddLiquidity { amount_a: u64, amount_b: u64 }
```
- **Discriminator:** `1`
- **Purpose:** Add liquidity to existing pool
- **Accounts:** 11 accounts required
- **Returns:** `ProgramResult`

### **3. RemoveLiquidity**
```rust
RemoveLiquidity { lp_amount: u64 }
```
- **Discriminator:** `2`
- **Purpose:** Remove liquidity from pool
- **Accounts:** 11 accounts required
- **Returns:** `ProgramResult`

### **4. Swap**
```rust
Swap { amount_in: u64, direction_a_to_b: bool }
```
- **Discriminator:** `3`
- **Purpose:** Single-hop token swap
- **Accounts:** 9 accounts required
- **Returns:** `ProgramResult`

### **5. MultihopSwap**
```rust
MultihopSwap { amount_in: u64, minimum_amount_out: u64 }
```
- **Discriminator:** `4`
- **Purpose:** Multi-hop token swap
- **Accounts:** Variable (7 per hop + 3 base)
- **Returns:** `ProgramResult`

### **6. MultihopSwapWithPath**
```rust
MultihopSwapWithPath { amount_in: u64, minimum_amount_out: u64, token_path: Vec<Pubkey> }
```
- **Discriminator:** `5`
- **Purpose:** Multi-hop with explicit path
- **Accounts:** Variable
- **Returns:** `ProgramResult`

---

## 🔧 **Helper Functions**

### **calculate_swap_output**
```rust
fn calculate_swap_output(amount_in: u64, reserve_in: u64, reserve_out: u64) -> Result<u64, ProgramError>
```
- **Formula:** `(amount_in * 997 * reserve_out) / (reserve_in * 1000 + amount_in * 997)`
- **Fee:** 0.3% (997/1000)

### **calculate_multihop_output**
```rust
fn calculate_multihop_output(initial_amount: u64, pools: &[Pool], directions: &[bool]) -> Result<u64, ProgramError>
```

### **determine_swap_direction**
```rust
fn determine_swap_direction(input_token: &Pubkey, pool: &Pool) -> Result<bool, ProgramError>
```

---

## 📊 **Data Structures**

### **Pool State**
```rust
pub struct Pool {
    pub token_a: Pubkey,        // 32 bytes
    pub token_b: Pubkey,        // 32 bytes
    pub bump: u8,               // 1 byte
    pub reserve_a: u64,         // 8 bytes
    pub reserve_b: u64,         // 8 bytes
    pub total_lp_supply: u64,   // 8 bytes
}
```
**Total Size:** 89 bytes

---

## 🎯 **Account Ordering**

### **InitPool Accounts**
1. Pool PDA (writable)
2. Token A mint (readonly)
3. Token B mint (readonly)
4. Vault A (writable)
5. Vault B (writable)
6. LP mint (writable)
7. User wallet (signer, writable)
8. User Token A account (writable)
9. User Token B account (writable)
10. User LP account (writable)
11. Token program (readonly)
12. System program (readonly)
13. Rent sysvar (readonly)

### **Swap Accounts**
1. Pool PDA (writable)
2. Token A mint (readonly)
3. Token B mint (readonly)
4. Vault A (writable)
5. Vault B (writable)
6. User input account (writable)
7. User output account (writable)
8. User wallet (signer, writable)
9. Token program (readonly)

---

## 💰 **Economic Parameters**

### **Swap Fee**
- **Rate:** 0.3%
- **Implementation:** 997/1000

### **LP Token Calculation**
- **Initial:** `sqrt(amount_a * amount_b)`
- **Additional:** `(amount_a * total_supply) / reserve_a`

### **Slippage Protection**
- **Parameter:** `minimum_amount_out`
- **Validation:** Transaction fails if output < minimum

---

## 🔍 **Error Codes**

| Code | Description | Solution |
|------|-------------|----------|
| `0x1` | Invalid instruction data | Check instruction discriminator |
| `0x2` | Invalid mint | Verify token mint addresses |
| `0x4` | Owner does not match | Check token account ownership |
| `0x5` | Insufficient funds | Check user token balances |
| `0x6` | Invalid seeds | Verify PDA derivation |

---

## 🚀 **Quick Start**

### **1. Connection Setup**
```javascript
const connection = new Connection('https://rpc.gorbchain.xyz', 'confirmed');
const AMM_PROGRAM_ID = new PublicKey('8qhCTESZN9xDCHvtXFdCHfsgcctudbYdzdCFzUkTTMMe');
```

### **2. Pool Address**
```javascript
const [poolAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
    AMM_PROGRAM_ID
);
```

### **3. Basic Swap**
```javascript
const instruction = new TransactionInstruction({
    keys: [/* 9 accounts */],
    programId: AMM_PROGRAM_ID,
    data: Buffer.concat([
        Buffer.from([3]), // Swap discriminator
        Buffer.from(amountIn.toString().padStart(8, '0'), 'hex'),
        Buffer.from([directionAtoB ? 1 : 0])
    ])
});
```

---

## 📞 **Support**

For integration help, provide:
- Frontend framework
- Wallet adapter
- Error messages
- Transaction signatures

**Happy building! 🎉**
