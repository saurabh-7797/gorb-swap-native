import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

// Get swap quote - READ ONLY, NO TRANSACTION REQUIRED
async function getSwapQuote(poolPDA: string, tokenIn: string, amountIn: number) {
  try {
    console.log(`\n🔍 Getting swap quote (READ ONLY):`);
    console.log(`  Pool: ${poolPDA}`);
    console.log(`  Token In: ${tokenIn}`);
    console.log(`  Amount In: ${formatTokenAmount(amountIn)}`);
    
    const poolPubkey = new PublicKey(poolPDA);
    const tokenInPubkey = new PublicKey(tokenIn);
    
    // Get pool account data
    const poolAccount = await connection.getAccountInfo(poolPubkey);
    if (!poolAccount) {
      console.log("❌ Pool account not found");
      return null;
    }

    // Parse pool data (89 bytes: 32 + 32 + 1 + 8 + 8 + 8)
    const data = poolAccount.data;
    if (data.length < 89) {
      console.log("❌ Invalid pool data length");
      return null;
    }

    const tokenA = new PublicKey(data.slice(0, 32));
    const tokenB = new PublicKey(data.slice(32, 64));
    const reserveA = data.readBigUInt64LE(65);
    const reserveB = data.readBigUInt64LE(73);

    // Determine swap direction
    const directionAToB = tokenInPubkey.equals(tokenA);
    const directionBToA = tokenInPubkey.equals(tokenB);
    
    if (!directionAToB && !directionBToA) {
      console.log("❌ Token not found in this pool");
      console.log(`   Pool contains: ${tokenA.toString()} and ${tokenB.toString()}`);
      return null;
    }

    const reserveIn = directionAToB ? Number(reserveA) : Number(reserveB);
    const reserveOut = directionAToB ? Number(reserveB) : Number(reserveA);
    const tokenOut = directionAToB ? tokenB : tokenA;

    // Apply constant product formula: amount_out = (amount_in * reserve_out) / (reserve_in + amount_in)
    const amountOut = reserveIn === 0 || amountIn === 0 ? 0 : 
      Math.floor((amountIn * reserveOut) / (reserveIn + amountIn));

    // Calculate price impact
    const priceImpact = reserveIn > 0 ? (amountIn / reserveIn) * 100 : 0;

    // Calculate exchange rate
    const exchangeRate = amountIn > 0 ? amountOut / amountIn : 0;

    // Calculate slippage (difference between expected and actual)
    const expectedOut = reserveIn > 0 ? (amountIn * reserveOut) / reserveIn : 0;
    const slippage = expectedOut > 0 ? ((expectedOut - amountOut) / expectedOut) * 100 : 0;

    const quote = {
      poolPDA: poolPDA,
      tokenIn: tokenIn,
      tokenOut: tokenOut.toString(),
      amountIn: amountIn,
      amountOut: amountOut,
      direction: directionAToB ? 'A->B' : 'B->A',
      reserveIn: reserveIn,
      reserveOut: reserveOut,
      priceImpact: priceImpact,
      exchangeRate: exchangeRate,
      slippage: slippage,
      expectedOut: expectedOut
    };

    console.log(`\n📊 Swap Quote Results:`);
    console.log(`  Token Out: ${tokenOut.toString()}`);
    console.log(`  Amount Out: ${formatTokenAmount(amountOut)}`);
    console.log(`  Direction: ${quote.direction}`);
    console.log(`  Reserve In: ${formatTokenAmount(reserveIn)}`);
    console.log(`  Reserve Out: ${formatTokenAmount(reserveOut)}`);
    console.log(`  Price Impact: ${priceImpact.toFixed(4)}%`);
    console.log(`  Exchange Rate: ${exchangeRate.toFixed(6)}`);
    console.log(`  Slippage: ${slippage.toFixed(4)}%`);
    console.log(`  Expected (no slippage): ${formatTokenAmount(expectedOut)}`);

    return quote;
  } catch (error) {
    console.error(`❌ Error getting swap quote:`, error);
    return null;
  }
}

// Test with different pools and amounts
async function testAllPools() {
  try {
    console.log("🚀 Simple Swap Quote Tool (NO TRANSACTIONS)");
    console.log("===========================================");
    
    // Load pool information
    const poolFiles = ['pool-pq-info.json', 'pool-qr-info.json'];
    const testAmounts = [
      1_000_000_000,    // 1 token
      5_000_000_000,    // 5 tokens
      10_000_000_000,   // 10 tokens
    ];
    
    for (const poolFile of poolFiles) {
      if (!fs.existsSync(poolFile)) {
        console.log(`⚠️  Pool file ${poolFile} not found, skipping...`);
        continue;
      }
      
      const poolInfo = JSON.parse(fs.readFileSync(poolFile, 'utf-8'));
      const poolPDA = poolInfo.poolPDA;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Pool: ${poolFile.replace('-info.json', '').toUpperCase()}`);
      console.log(`${'='.repeat(60)}`);
      
      // Test with both tokens in the pool
      const tokens = [
        { name: 'Token A', address: poolInfo.tokenA || poolInfo.tokenP },
        { name: 'Token B', address: poolInfo.tokenB || poolInfo.tokenQ || poolInfo.tokenR }
      ];
      
      for (const token of tokens) {
        if (!token.address) continue;
        
        console.log(`\n🪙 Testing with ${token.name}: ${token.address}`);
        console.log("-".repeat(40));
        
        for (const amount of testAmounts) {
          console.log(`\n💰 Amount: ${formatTokenAmount(amount)}`);
          
          const quote = await getSwapQuote(poolPDA, token.address, amount);
          
          if (quote) {
            // Save quote data
            const quoteData = {
              timestamp: new Date().toISOString(),
              pool: poolFile,
              poolPDA: poolPDA,
              tokenIn: token.address,
              amountIn: amount,
              quote: quote
            };
            
            const filename = `quote-${poolFile.replace('-info.json', '')}-${token.name.toLowerCase().replace(' ', '-')}-${amount}.json`;
            fs.writeFileSync(filename, JSON.stringify(quoteData, null, 2));
            console.log(`💾 Quote saved to ${filename}`);
          }
        }
      }
    }
    
    console.log("\n✅ All swap quotes completed!");
    
  } catch (error) {
    console.error("❌ Error in quote testing:", error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Get parameters from command line or use defaults
    const poolPDA = process.argv[2] || "5FUEfonnJmsZE3peqGRjbFBmejGeQUD9o8mXv46dTqGB"; // Default to P-Q pool
    const tokenIn = process.argv[3] || "AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW"; // Default to Token P
    const amountIn = parseInt(process.argv[4]) || 1_000_000_000; // Default to 1 token
    
    console.log("🚀 Simple Swap Quote Tool");
    console.log("=========================");
    console.log("📝 This is a READ-ONLY function - NO TRANSACTIONS REQUIRED");
    
    // Get quote
    const quote = await getSwapQuote(poolPDA, tokenIn, amountIn);
    
    if (quote) {
      console.log("\n✅ Quote calculation completed!");
      console.log(`\n🎯 Expected Minimum Amount: ${formatTokenAmount(quote.amountOut)} ${quote.tokenOut.slice(0, 8)}...`);
    } else {
      console.log("\n❌ Failed to get quote");
    }
    
  } catch (error) {
    console.error("❌ Error in main function:", error);
    throw error;
  }
}

// Run the main function
main().catch(console.error);
