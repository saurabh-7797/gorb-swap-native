# Swap Quote Functions - READ ONLY (No Transactions Required)

## 🎯 Overview
This document describes the swap quote functionality that calculates expected minimum amounts for swaps **without requiring any transactions**.

## ✅ What We Built

### 1. **Simple Quote Function** (`ts-simple-quote.ts`)
- **READ-ONLY** - No transactions required
- Calculates expected minimum output amount
- Shows price impact, slippage, and exchange rates
- Works with any pool and token combination

### 2. **On-Chain Quote Function** (`ts-get-swap-quote.ts`)
- Uses on-chain instruction for validation
- Requires transaction but provides verification
- Useful for confirming calculations

## 🚀 Usage Examples

### Basic Quote (1 Token P → Token Q)
```bash
npx ts-node ts-simple-quote.ts
```
**Result**: 1 Token P = 2.530101 Token Q

### Custom Amount (5 Token P → Token Q)
```bash
npx ts-node ts-simple-quote.ts 5FUEfonnJmsZE3peqGRjbFBmejGeQUD9o8mXv46dTqGB AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW 5000000000
```
**Result**: 5 Token P = 5.506176 Token Q

### Different Pool (1 Token R → Token Q)
```bash
npx ts-node ts-simple-quote.ts JDBuxeQ9kT77Co4qyEv7kJY17sTMTyBhDCJNHkZErzFy 4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq 1000000000
```
**Result**: 1 Token R = 0.950790 Token Q

## 📊 Quote Information Provided

### Core Data
- **Token Out**: Address of the output token
- **Amount Out**: Expected minimum amount you'll receive
- **Direction**: A→B or B→A swap direction
- **Reserve In**: Current reserve of input token
- **Reserve Out**: Current reserve of output token

### Analysis Metrics
- **Price Impact**: Percentage impact on pool price
- **Exchange Rate**: Effective exchange rate (output/input)
- **Slippage**: Difference between expected and actual output
- **Expected (no slippage)**: What you'd get with infinite liquidity

## 🔧 Technical Details

### Formula Used
```
amount_out = (amount_in * reserve_out) / (reserve_in + amount_in)
```

### Price Impact Calculation
```
price_impact = (amount_in / reserve_in) * 100
```

### Slippage Calculation
```
slippage = ((expected_out - actual_out) / expected_out) * 100
```

## 📁 Files Created

1. **`ts-simple-quote.ts`** - Main quote function (READ-ONLY)
2. **`ts-get-swap-quote.ts`** - On-chain validation function
3. **`ts-find-pools-by-token.ts`** - Find pools by token address
4. **`ts-get-pool-info.ts`** - Get comprehensive pool information

## 🎯 Key Benefits

### ✅ **No Transaction Fees**
- Read-only function
- No gas costs
- Instant results

### ✅ **Accurate Calculations**
- Uses real-time pool data
- Constant product formula
- Includes slippage analysis

### ✅ **Easy Integration**
- Simple command-line interface
- JSON output for programmatic use
- Works with any pool/token combination

## 📈 Example Results

### Small Swap (1 Token)
- **Input**: 1 Token P
- **Output**: 2.530101 Token Q
- **Price Impact**: 48.0118%
- **Exchange Rate**: 2.530101

### Large Swap (5 Tokens)
- **Input**: 5 Token P
- **Output**: 5.506176 Token Q
- **Price Impact**: 240.0588%
- **Exchange Rate**: 1.101235

### Different Pool (R→Q)
- **Input**: 1 Token R
- **Output**: 0.950790 Token Q
- **Price Impact**: 14.1426%
- **Exchange Rate**: 0.950790

## 🚀 Next Steps

1. **Use for Trading**: Get quotes before executing swaps
2. **Price Monitoring**: Track exchange rates over time
3. **Slippage Analysis**: Understand price impact of large trades
4. **Pool Comparison**: Compare rates across different pools

## 💡 Pro Tips

- **Small amounts** = Lower price impact
- **Large amounts** = Higher slippage
- **Check multiple pools** for best rates
- **Monitor reserves** for liquidity depth

---

**🎯 The quote function now works perfectly without any transactions - just pure calculation based on current pool state!**
