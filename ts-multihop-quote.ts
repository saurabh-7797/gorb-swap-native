import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
// Removed unused imports and variables for pure read-only function

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

// Get multihop quote - READ ONLY, NO TRANSACTION REQUIRED
async function getMultihopQuoteOffChain(tokenPath: string[], amountIn: number) {
  try {
    console.log(`\n🔍 Getting multihop quote (READ ONLY):`);
    console.log(`  Token Path: ${tokenPath.join(' → ')}`);
    console.log(`  Amount In: ${formatTokenAmount(amountIn)}`);
    
    // Load pool information
    const poolFiles = ['pool-pq-info.json', 'pool-qr-info.json'];
    const pools = [];
    
    for (const file of poolFiles) {
      if (fs.existsSync(file)) {
        const poolInfo = JSON.parse(fs.readFileSync(file, 'utf-8'));
        
        // Extract tokens based on file name
        let tokenA, tokenB;
        if (file.includes('pq')) {
          tokenA = poolInfo.tokenP;
          tokenB = poolInfo.tokenQ;
        } else if (file.includes('qr')) {
          tokenA = poolInfo.tokenQ;
          tokenB = poolInfo.tokenR;
        } else {
          tokenA = poolInfo.tokenA || poolInfo.tokenP;
          tokenB = poolInfo.tokenB || poolInfo.tokenQ || poolInfo.tokenR;
        }
        
        if (tokenA && tokenB) {
          pools.push({
            file,
            poolPDA: new PublicKey(poolInfo.poolPDA),
            tokenA: new PublicKey(tokenA),
            tokenB: new PublicKey(tokenB)
          });
        }
      }
    }
    
    let currentAmount = amountIn;
    const hops = [];
    
    // Process each hop
    for (let i = 0; i < tokenPath.length - 1; i++) {
      const tokenIn = new PublicKey(tokenPath[i]);
      const tokenOut = new PublicKey(tokenPath[i + 1]);
      
      // Find the pool for this hop
      const pool = pools.find(p => 
        (p.tokenA.equals(tokenIn) && p.tokenB.equals(tokenOut)) ||
        (p.tokenA.equals(tokenOut) && p.tokenB.equals(tokenIn))
      );
      
      if (!pool) {
        console.log(`❌ No pool found for hop ${i + 1}: ${tokenPath[i]} → ${tokenPath[i + 1]}`);
        return null;
      }
      
      // Get pool data
      const poolAccount = await connection.getAccountInfo(pool.poolPDA);
      if (!poolAccount) {
        console.log(`❌ Pool account not found for hop ${i + 1}`);
        return null;
      }
      
      const data = poolAccount.data;
      const poolTokenA = new PublicKey(data.slice(0, 32));
      const poolTokenB = new PublicKey(data.slice(32, 64));
      const reserveA = data.readBigUInt64LE(65);
      const reserveB = data.readBigUInt64LE(73);
      
      // Determine swap direction
      const directionAToB = tokenIn.equals(poolTokenA);
      const reserveIn = directionAToB ? Number(reserveA) : Number(reserveB);
      const reserveOut = directionAToB ? Number(reserveB) : Number(reserveA);
      
      // Calculate output for this hop
      const hopAmountOut = reserveIn === 0 || currentAmount === 0 ? 0 : 
        Math.floor((currentAmount * reserveOut) / (reserveIn + currentAmount));
      
      const hop = {
        hop: i + 1,
        tokenIn: tokenIn.toString(),
        tokenOut: tokenOut.toString(),
        poolPDA: pool.poolPDA.toString(),
        amountIn: currentAmount,
        amountOut: hopAmountOut,
        reserveIn,
        reserveOut,
        direction: directionAToB ? 'A->B' : 'B->A'
      };
      
      hops.push(hop);
      currentAmount = hopAmountOut;
      
      console.log(`\n🔄 Hop ${i + 1}: ${tokenIn.toString().slice(0, 8)}... → ${tokenOut.toString().slice(0, 8)}...`);
      console.log(`  Pool: ${pool.poolPDA.toString()}`);
      console.log(`  Amount In: ${formatTokenAmount(currentAmount)}`);
      console.log(`  Amount Out: ${formatTokenAmount(hopAmountOut)}`);
      console.log(`  Direction: ${hop.direction}`);
    }
    
    // Calculate total exchange rate
    const totalExchangeRate = amountIn > 0 ? currentAmount / amountIn : 0;
    
    const quote = {
      tokenPath,
      amountIn,
      amountOut: currentAmount,
      totalExchangeRate,
      hops
    };
    
    console.log(`\n📊 Multihop Quote Results:`);
    console.log(`  Final Amount Out: ${formatTokenAmount(currentAmount)}`);
    console.log(`  Total Exchange Rate: ${totalExchangeRate.toFixed(6)}`);
    console.log(`  Total Hops: ${hops.length}`);
    
    return quote;
  } catch (error) {
    console.error(`❌ Error getting multihop quote:`, error);
    return null;
  }
}

// Removed on-chain instruction call - this is now a pure read-only function

// Main function
async function main() {
  try {
    // Get parameters from command line or use defaults
    const tokenPath = process.argv[2] ? process.argv[2].split(',') : [
      "4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq", // Token R
      "8W2CSgx45fsxP1WnnYJxJVqqVC7XKB1ARmFbiRXyUBTR", // Token Q
      "AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW"  // Token P
    ];
    
    // Validate token addresses
    for (const token of tokenPath) {
      try {
        new PublicKey(token);
      } catch (error) {
        console.error(`❌ Invalid token address: ${token}`);
        return;
      }
    }
    const amountIn = parseInt(process.argv[3]) || 1_000_000_000; // Default to 1 token
    
    console.log("🚀 Multihop Quote Tool");
    console.log("=====================");
    console.log("📝 This calculates quotes for multihop swaps (R→Q→P)");
    
    // Get off-chain quote
    const quote = await getMultihopQuoteOffChain(tokenPath, amountIn);
    
    if (quote) {
      console.log("\n✅ Multihop quote completed!");
      console.log(`\n🎯 Expected Minimum Amount: ${formatTokenAmount(quote.amountOut)} ${tokenPath[tokenPath.length - 1].slice(0, 8)}...`);
      console.log("\n📝 This is a READ-ONLY calculation - NO TRANSACTIONS REQUIRED");
    } else {
      console.log("\n❌ Failed to get multihop quote");
    }
    
  } catch (error) {
    console.error("❌ Error in main function:", error);
    throw error;
  }
}

// Run the main function
main().catch(console.error);
