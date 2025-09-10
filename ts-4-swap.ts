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
 * TypeScript Script 4: Swap Tokens
 * Based on IDL: Swap (discriminant: 3)
 * Args: amountIn (u64), directionAToB (bool)
 */
async function swapTokens() {
  try {
    console.log("🚀 TypeScript Script 4: Swapping Tokens...");
    
    // Load pool info from previous step
    const poolInfo = JSON.parse(fs.readFileSync('pool-ab-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_A_MINT = new PublicKey(poolInfo.tokenA);
    const TOKEN_B_MINT = new PublicKey(poolInfo.tokenB);
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const vaultA = new PublicKey(poolInfo.vaultA);
    const vaultB = new PublicKey(poolInfo.vaultB);
    const userTokenA = new PublicKey(poolInfo.userTokenA);
    const userTokenB = new PublicKey(poolInfo.userTokenB);
    const userLP = new PublicKey(poolInfo.userLP);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);

    // 1. Check balances before swap
    console.log("\n📊 Balances BEFORE Swap:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const vaultABefore = await getTokenBalance(vaultA);
    const vaultBBefore = await getTokenBalance(vaultB);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`Vault A: ${formatTokenAmount(vaultABefore)} (${vaultABefore} raw)`);
    console.log(`Vault B: ${formatTokenAmount(vaultBBefore)} (${vaultBBefore} raw)`);

    // 2. Swap parameters
    const amountIn = 500_000_000; // 0.5 tokens
    const directionAToB = true; // Swap A to B
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token ${directionAToB ? 'A' : 'B'}`);
    console.log(`Direction: ${directionAToB ? 'A → B' : 'B → A'}`);

    // 3. Create transaction
    const transaction = new Transaction();

    // 3.1. Swap instruction
    const swapInstruction = {
      programId: AMM_PROGRAM_ID,
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
        { pubkey: vaultA, isSigner: false, isWritable: true },
        { pubkey: vaultB, isSigner: false, isWritable: true },
        { pubkey: userTokenA, isSigner: false, isWritable: true },
        { pubkey: userTokenB, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([3]), // Swap discriminator
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountIn)]).buffer)),
        Buffer.from([directionAToB ? 1 : 0]), // directionAToB as u8
      ]),
    };

    transaction.add(swapInstruction);

    // 4. Send transaction
    console.log("\n📝 Sending swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair]);

    console.log(`✅ Swap completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Check balances after swap
    console.log("\n📊 Balances AFTER Swap:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const vaultAAfter = await getTokenBalance(vaultA);
    const vaultBAfter = await getTokenBalance(vaultB);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`Vault A: ${formatTokenAmount(vaultAAfter)} (${vaultAAfter} raw)`);
    console.log(`Vault B: ${formatTokenAmount(vaultBAfter)} (${vaultBAfter} raw)`);

    // 6. Calculate changes
    const tokenAChange = balanceTokenABefore - balanceTokenAAfter;
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    const vaultAChange = vaultAAfter - vaultABefore;
    const vaultBChange = vaultBBefore - vaultBAfter;

    console.log(`\n📈 Changes:`);
    console.log(`Token A removed from user: ${formatTokenAmount(tokenAChange)}`);
    console.log(`Token B received by user: ${formatTokenAmount(tokenBChange)}`);
    console.log(`Token A added to vault: ${formatTokenAmount(vaultAChange)}`);
    console.log(`Token B removed from vault: ${formatTokenAmount(vaultBChange)}`);

    // 7. Calculate swap rate and slippage
    const expectedOutput = directionAToB ? 
      (vaultBBefore * amountIn) / (vaultABefore + amountIn) : 
      (vaultABefore * amountIn) / (vaultBBefore + amountIn);
    
    const actualOutput = directionAToB ? tokenBChange : tokenAChange;
    const slippage = ((expectedOutput - actualOutput) / expectedOutput) * 100;

    console.log(`\n📊 Swap Analysis:`);
    console.log(`Expected output: ${formatTokenAmount(expectedOutput)}`);
    console.log(`Actual output: ${formatTokenAmount(actualOutput)}`);
    console.log(`Slippage: ${slippage.toFixed(4)}%`);

    // 8. Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastSwap: {
        amountIn,
        directionAToB,
        tokenAChange,
        tokenBChange,
        expectedOutput,
        actualOutput,
        slippage,
        transactionSignature: signature,
        timestamp: new Date().toISOString(),
      }
    };

    fs.writeFileSync("pool-ab-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool info saved to pool-ab-info.json");

  } catch (error) {
    console.error("❌ Error swapping tokens:", error);
    throw error;
  }
}

// Run the function
swapTokens().catch(console.error);
