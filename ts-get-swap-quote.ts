import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

// Get swap quote from on-chain data
async function getSwapQuoteOffChain(poolPDA: PublicKey, tokenIn: PublicKey, amountIn: number) {
  try {
    console.log(`\n🔍 Getting swap quote off-chain:`);
    console.log(`  Pool: ${poolPDA.toString()}`);
    console.log(`  Token In: ${tokenIn.toString()}`);
    console.log(`  Amount In: ${formatTokenAmount(amountIn)}`);
    
    // Get pool account data
    const poolAccount = await connection.getAccountInfo(poolPDA);
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
    const directionAToB = tokenIn.equals(tokenA);
    const directionBToA = tokenIn.equals(tokenB);
    
    if (!directionAToB && !directionBToA) {
      console.log("❌ Token not found in this pool");
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

    const quote = {
      poolPDA: poolPDA.toString(),
      tokenIn: tokenIn.toString(),
      tokenOut: tokenOut.toString(),
      amountIn,
      amountOut,
      direction: directionAToB ? 'A->B' : 'B->A',
      reserveIn,
      reserveOut,
      priceImpact,
      exchangeRate
    };

    console.log(`\n📊 Off-chain Quote:`);
    console.log(`  Token Out: ${tokenOut.toString()}`);
    console.log(`  Amount Out: ${formatTokenAmount(amountOut)}`);
    console.log(`  Direction: ${quote.direction}`);
    console.log(`  Reserve In: ${formatTokenAmount(reserveIn)}`);
    console.log(`  Reserve Out: ${formatTokenAmount(reserveOut)}`);
    console.log(`  Price Impact: ${priceImpact.toFixed(4)}%`);
    console.log(`  Exchange Rate: ${exchangeRate.toFixed(6)}`);

    return quote;
  } catch (error) {
    console.error(`❌ Error getting off-chain quote:`, error);
    return null;
  }
}

// Call the GetSwapQuote instruction on-chain
async function callGetSwapQuote(poolPDA: PublicKey, tokenIn: PublicKey, amountIn: number) {
  try {
    console.log(`\n📡 Calling GetSwapQuote instruction:`);
    console.log(`  Pool: ${poolPDA.toString()}`);
    console.log(`  Token In: ${tokenIn.toString()}`);
    console.log(`  Amount In: ${formatTokenAmount(amountIn)}`);
    
    const transaction = new Transaction();
    
    // Instruction data (Borsh: GetSwapQuote { amount_in: u64, token_in: Pubkey })
    const data = Buffer.alloc(1 + 8 + 32); // 1 byte discriminator + 8 bytes u64 + 32 bytes Pubkey
    data.writeUInt8(9, 0); // GetSwapQuote discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.set(tokenIn.toBytes(), 9);
    
    // Add GetSwapQuote instruction
    transaction.add({
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: false },
      ],
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ GetSwapQuote instruction completed! Signature: ${signature}`);
    
    // Get transaction logs
    const logs = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });
    
    if (logs?.meta?.logMessages) {
      console.log("\n📋 On-chain Quote from logs:");
      logs.meta.logMessages.forEach(log => {
        if (log.includes("Swap Quote:") || log.includes("Token In:") || log.includes("Amount In:") || 
            log.includes("Amount Out:") || log.includes("Price Impact:") || log.includes("Exchange Rate:")) {
          console.log(`  ${log}`);
        }
      });
    }
    
    return signature;
  } catch (error) {
    console.error("❌ Error calling GetSwapQuote instruction:", error);
    throw error;
  }
}

// Test swap quotes for different pools and amounts
async function testSwapQuotes() {
  try {
    console.log("🚀 Swap Quote Testing Tool");
    console.log("==========================");
    
    // Load pool information
    const poolFiles = ['pool-pq-info.json', 'pool-qr-info.json'];
    const testAmounts = [
      1_000_000_000,    // 1 token
      5_000_000_000,    // 5 tokens
      10_000_000_000,   // 10 tokens
      50_000_000_000,   // 50 tokens
      100_000_000_000   // 100 tokens
    ];
    
    for (const poolFile of poolFiles) {
      if (!fs.existsSync(poolFile)) {
        console.log(`⚠️  Pool file ${poolFile} not found, skipping...`);
        continue;
      }
      
      const poolInfo = JSON.parse(fs.readFileSync(poolFile, 'utf-8'));
      const poolPDA = new PublicKey(poolInfo.poolPDA);
      
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
          console.log(`\n💰 Testing amount: ${formatTokenAmount(amount)}`);
          
          // Get off-chain quote
          const offChainQuote = await getSwapQuoteOffChain(poolPDA, new PublicKey(token.address), amount);
          
          if (offChainQuote) {
            // Call on-chain instruction
            await callGetSwapQuote(poolPDA, new PublicKey(token.address), amount);
            
            // Save quote data
            const quoteData = {
              timestamp: new Date().toISOString(),
              pool: poolFile,
              poolPDA: poolPDA.toString(),
              tokenIn: token.address,
              amountIn: amount,
              offChainQuote
            };
            
            const filename = `swap-quote-${poolFile.replace('-info.json', '')}-${token.name.toLowerCase().replace(' ', '-')}-${amount}.json`;
            fs.writeFileSync(filename, JSON.stringify(quoteData, null, 2));
            console.log(`💾 Quote saved to ${filename}`);
          }
        }
      }
    }
    
    console.log("\n✅ Swap quote testing completed!");
    
  } catch (error) {
    console.error("❌ Error in swap quote testing:", error);
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
    
    console.log("🚀 Get Swap Quote Tool");
    console.log("======================");
    
    // Get off-chain quote
    const quote = await getSwapQuoteOffChain(new PublicKey(poolPDA), new PublicKey(tokenIn), amountIn);
    
    if (quote) {
      // Call on-chain instruction
      await callGetSwapQuote(new PublicKey(poolPDA), new PublicKey(tokenIn), amountIn);
      
      console.log("\n✅ Swap quote completed!");
    } else {
      console.log("\n❌ Failed to get swap quote");
    }
    
  } catch (error) {
    console.error("❌ Error in main function:", error);
    throw error;
  }
}

// Run the main function
main().catch(console.error);
