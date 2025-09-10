import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to get token balance
async function getTokenBalance(tokenAccount: PublicKey): Promise<number> {
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
    return Number(account.amount);
  } catch (error) {
    return 0;
  }
}

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

// Helper function to perform a single swap
async function performSwap(
  poolInfo: any,
  amountIn: number,
  directionTtoV: boolean,
  swapNumber: number
): Promise<{ signature: string; amountOut: number; priceImpact: number }> {
  try {
    console.log(`\n🔄 Swap #${swapNumber}: ${directionTtoV ? 'T → V' : 'V → T'}`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} ${directionTtoV ? 'Token T' : 'Token V'}`);

    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_T_MINT = new PublicKey(poolInfo.tokenT);
    const TOKEN_V_MINT = new PublicKey(poolInfo.tokenV);
    const vaultT = new PublicKey(poolInfo.vaultT);
    const vaultV = new PublicKey(poolInfo.vaultV);
    const userTokenT = new PublicKey(poolInfo.userTokenT);
    const userTokenV = new PublicKey(poolInfo.userTokenV);

    // Get balances before swap
    const balanceTBefore = await getTokenBalance(userTokenT);
    const balanceVBefore = await getTokenBalance(userTokenV);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_V_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: vaultV, isSigner: false, isWritable: true },
      { pubkey: directionTtoV ? userTokenT : userTokenV, isSigner: false, isWritable: true },
      { pubkey: directionTtoV ? userTokenV : userTokenT, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(directionTtoV ? 1 : 0, 9); // direction_a_to_b

    // Add Swap instruction
    transaction.add({
      keys: accounts,
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

    // Get balances after swap
    const balanceTAfter = await getTokenBalance(userTokenT);
    const balanceVAfter = await getTokenBalance(userTokenV);

    // Calculate results
    const amountOut = directionTtoV 
      ? balanceVAfter - balanceVBefore 
      : balanceTAfter - balanceTBefore;

    // Calculate price impact (simplified)
    const priceImpact = directionTtoV 
      ? (amountIn / (balanceTBefore - amountIn)) * 100
      : (amountIn / (balanceVBefore - amountIn)) * 100;

    console.log(`✅ Swap #${swapNumber} completed!`);
    console.log(`Transaction: ${signature}`);
    console.log(`Amount Out: ${formatTokenAmount(amountOut)} ${directionTtoV ? 'Token V' : 'Token T'}`);
    console.log(`Price Impact: ${priceImpact.toFixed(4)}%`);

    return { signature, amountOut, priceImpact };

  } catch (error) {
    console.error(`❌ Swap #${swapNumber} failed:`, error);
    throw error;
  }
}

/**
 * Comprehensive Large Value Swap Test for T-V Pool
 */
async function largeSwapTestTV() {
  try {
    console.log("🚀 Large Value Swap Test for Pool T-V...");
    
    // Load pool info
    const poolInfo = JSON.parse(fs.readFileSync('pool-tv-info.json', 'utf-8'));
    
    console.log(`Pool PDA: ${poolInfo.poolPDA}`);
    console.log(`Token T: ${poolInfo.tokenT}`);
    console.log(`Token V: ${poolInfo.tokenV}`);

    // Get initial balances
    const userTokenT = new PublicKey(poolInfo.userTokenT);
    const userTokenV = new PublicKey(poolInfo.userTokenV);
    
    console.log("\n📊 Initial Balances:");
    const initialBalanceT = await getTokenBalance(userTokenT);
    const initialBalanceV = await getTokenBalance(userTokenV);
    console.log(`Token T: ${formatTokenAmount(initialBalanceT)}`);
    console.log(`Token V: ${formatTokenAmount(initialBalanceV)}`);

    // Define swap amounts (in raw units)
    const swapAmounts = [
      1_000_000_000,    // 1 token
      5_000_000_000,    // 5 tokens
      10_000_000_000,   // 10 tokens
      25_000_000_000,   // 25 tokens
      50_000_000_000,   // 50 tokens
      100_000_000_000,  // 100 tokens
    ];

    const swapResults = [];

    // Perform T → V swaps
    console.log("\n🔄 Performing T → V Swaps...");
    for (let i = 0; i < swapAmounts.length; i++) {
      const amount = swapAmounts[i];
      if (amount <= initialBalanceT) {
        const result = await performSwap(poolInfo, amount, true, i + 1);
        swapResults.push({
          swapNumber: i + 1,
          direction: 'T → V',
          amountIn: amount,
          amountOut: result.amountOut,
          priceImpact: result.priceImpact,
          signature: result.signature
        });
        
        // Wait a bit between swaps
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`⚠️ Skipping swap #${i + 1}: Insufficient Token T balance`);
      }
    }

    // Get current balances after T → V swaps
    const midBalanceT = await getTokenBalance(userTokenT);
    const midBalanceV = await getTokenBalance(userTokenV);

    // Perform V → T swaps
    console.log("\n🔄 Performing V → T Swaps...");
    for (let i = 0; i < swapAmounts.length; i++) {
      const amount = swapAmounts[i];
      if (amount <= midBalanceV) {
        const result = await performSwap(poolInfo, amount, false, swapAmounts.length + i + 1);
        swapResults.push({
          swapNumber: swapAmounts.length + i + 1,
          direction: 'V → T',
          amountIn: amount,
          amountOut: result.amountOut,
          priceImpact: result.priceImpact,
          signature: result.signature
        });
        
        // Wait a bit between swaps
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`⚠️ Skipping swap #${swapAmounts.length + i + 1}: Insufficient Token V balance`);
      }
    }

    // Final balances
    console.log("\n📊 Final Balances:");
    const finalBalanceT = await getTokenBalance(userTokenT);
    const finalBalanceV = await getTokenBalance(userTokenV);
    console.log(`Token T: ${formatTokenAmount(finalBalanceT)}`);
    console.log(`Token V: ${formatTokenAmount(finalBalanceV)}`);

    // Calculate total changes
    const totalTChange = finalBalanceT - initialBalanceT;
    const totalVChange = finalBalanceV - initialBalanceV;

    console.log("\n📈 Total Changes:");
    console.log(`Token T Change: ${formatTokenAmount(totalTChange)}`);
    console.log(`Token V Change: ${formatTokenAmount(totalVChange)}`);

    // Save results
    const testResults = {
      poolInfo: poolInfo,
      initialBalances: {
        tokenT: initialBalanceT,
        tokenV: initialBalanceV
      },
      finalBalances: {
        tokenT: finalBalanceT,
        tokenV: finalBalanceV
      },
      totalChanges: {
        tokenT: totalTChange,
        tokenV: totalVChange
      },
      swaps: swapResults,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync("large-swap-tv-results.json", JSON.stringify(testResults, null, 2));
    console.log("\n💾 Large swap test results saved to large-swap-tv-results.json");

    // Summary
    console.log("\n🎯 Test Summary:");
    console.log(`Total Swaps Performed: ${swapResults.length}`);
    console.log(`Average Price Impact: ${(swapResults.reduce((sum, s) => sum + s.priceImpact, 0) / swapResults.length).toFixed(4)}%`);
    console.log(`Net Token T Change: ${formatTokenAmount(totalTChange)}`);
    console.log(`Net Token V Change: ${formatTokenAmount(totalVChange)}`);

  } catch (error) {
    console.error("❌ Large swap test failed:", error);
    throw error;
  }
}

// Run the test
largeSwapTestTV().catch(console.error);
