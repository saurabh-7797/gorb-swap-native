import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

/**
 * TypeScript Script 5: Multihop Swap
 * Based on IDL: MultihopSwap (discriminant: 4)
 * Args: amountIn (u64), minimumAmountOut (u64)
 * 
 * This function performs a multihop swap through multiple pools
 * For this example, we'll assume we have two pools: A-B and B-C
 */
async function multihopSwap() {
  try {
    console.log("🚀 TypeScript Script 5: Multihop Swap...");
    
    // Load pool info from previous steps
    const poolABInfo = JSON.parse(fs.readFileSync('pool-ab-info.json', 'utf-8'));
    const poolBCInfo = JSON.parse(fs.readFileSync('pool-bc-info.json', 'utf-8'));
    
    // Pool A-B
    const poolABPDA = new PublicKey(poolABInfo.poolPDA);
    const TOKEN_A_MINT = new PublicKey(poolABInfo.tokenA);
    const TOKEN_B_MINT = new PublicKey(poolABInfo.tokenB);
    const vaultAB_A = new PublicKey(poolABInfo.vaultA);
    const vaultAB_B = new PublicKey(poolABInfo.vaultB);
    
    // Pool B-C
    const poolBCPDA = new PublicKey(poolBCInfo.poolPDA);
    const TOKEN_C_MINT = new PublicKey(poolBCInfo.tokenB); // B in pool B-C is actually token C
    const vaultBC_B = new PublicKey(poolBCInfo.vaultA); // B in pool B-C
    const vaultBC_C = new PublicKey(poolBCInfo.vaultB); // C in pool B-C
    
    // User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenC = getAssociatedTokenAddressSync(TOKEN_C_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`Pool A-B PDA: ${poolABPDA.toString()}`);
    console.log(`Pool B-C PDA: ${poolBCPDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`Token C: ${TOKEN_C_MINT.toString()}`);

    // 1. Check balances before multihop swap
    console.log("\n📊 Balances BEFORE Multihop Swap:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceTokenCBefore = await getTokenBalance(userTokenC);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`User Token C: ${formatTokenAmount(balanceTokenCBefore)} (${balanceTokenCBefore} raw)`);

    // 2. Multihop swap parameters
    const amountIn = 1_000_000_000; // 1 token A
    const minimumAmountOut = 800_000_000; // Minimum 0.8 token C (20% slippage tolerance)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token A`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} Token C`);
    console.log(`Swap Path: A → B → C`);

    // 3. Create transaction
    const transaction = new Transaction();

    // 3.1. Multihop swap instruction
    const multihopSwapInstruction = {
      programId: AMM_PROGRAM_ID,
      keys: [
        // Pool A-B accounts
        { pubkey: poolABPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
        { pubkey: vaultAB_A, isSigner: false, isWritable: true },
        { pubkey: vaultAB_B, isSigner: false, isWritable: true },
        
        // Pool B-C accounts
        { pubkey: poolBCPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_C_MINT, isSigner: false, isWritable: false },
        { pubkey: vaultBC_B, isSigner: false, isWritable: true },
        { pubkey: vaultBC_C, isSigner: false, isWritable: true },
        
        // User accounts
        { pubkey: userTokenA, isSigner: false, isWritable: true },
        { pubkey: userTokenB, isSigner: false, isWritable: true },
        { pubkey: userTokenC, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([4]), // MultihopSwap discriminator
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountIn)]).buffer)),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(minimumAmountOut)]).buffer)),
      ]),
    };

    transaction.add(multihopSwapInstruction);

    // 4. Send transaction
    console.log("\n📝 Sending multihop swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair]);

    console.log(`✅ Multihop swap completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Check balances after multihop swap
    console.log("\n📊 Balances AFTER Multihop Swap:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceTokenCAfter = await getTokenBalance(userTokenC);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`User Token C: ${formatTokenAmount(balanceTokenCAfter)} (${balanceTokenCAfter} raw)`);

    // 6. Calculate changes
    const tokenAChange = balanceTokenABefore - balanceTokenAAfter;
    const tokenBChange = balanceTokenBBefore - balanceTokenBAfter;
    const tokenCChange = balanceTokenCAfter - balanceTokenCBefore;

    console.log(`\n📈 Changes:`);
    console.log(`Token A removed from user: ${formatTokenAmount(tokenAChange)}`);
    console.log(`Token B change: ${formatTokenAmount(tokenBChange)}`);
    console.log(`Token C received by user: ${formatTokenAmount(tokenCChange)}`);

    // 7. Calculate effective exchange rate
    const effectiveRate = tokenCChange / amountIn;
    const expectedRate = 1.0; // Assuming 1:1:1 ratio for simplicity
    const rateDifference = Math.abs(effectiveRate - expectedRate) / expectedRate * 100;

    console.log(`\n📊 Multihop Analysis:`);
    console.log(`Effective exchange rate: ${effectiveRate.toFixed(6)} C per A`);
    console.log(`Expected rate: ${expectedRate.toFixed(6)} C per A`);
    console.log(`Rate difference: ${rateDifference.toFixed(4)}%`);

    // 8. Check if minimum amount out was met
    const minimumMet = tokenCChange >= minimumAmountOut;
    console.log(`Minimum amount out met: ${minimumMet ? '✅ Yes' : '❌ No'}`);

    // 9. Save updated pool info
    const multihopSwapInfo = {
      amountIn,
      minimumAmountOut,
      tokenAChange,
      tokenBChange,
      tokenCChange,
      effectiveRate,
      expectedRate,
      rateDifference,
      minimumMet,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("multihop-swap-results.json", JSON.stringify(multihopSwapInfo, null, 2));
    console.log("\n💾 Multihop swap results saved to multihop-swap-results.json");

  } catch (error) {
    console.error("❌ Error performing multihop swap:", error);
    throw error;
  }
}

// Run the function
multihopSwap().catch(console.error);
