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
 * TypeScript Script 3: Remove Liquidity
 * Based on IDL: RemoveLiquidity (discriminant: 2)
 * Args: lpAmount (u64)
 */
async function removeLiquidity() {
  try {
    console.log("🚀 TypeScript Script 3: Removing Liquidity...");
    
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
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // 1. Check balances before removing liquidity
    console.log("\n📊 Balances BEFORE Removing Liquidity:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceLPBefore = await getTokenBalance(userLP);
    const vaultABefore = await getTokenBalance(vaultA);
    const vaultBBefore = await getTokenBalance(vaultB);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`User LP: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);
    console.log(`Vault A: ${formatTokenAmount(vaultABefore)} (${vaultABefore} raw)`);
    console.log(`Vault B: ${formatTokenAmount(vaultBBefore)} (${vaultBBefore} raw)`);

    // 2. Liquidity removal parameters
    const lpAmount = Math.floor(balanceLPBefore * 0.5); // Remove 50% of LP tokens
    
    console.log(`\n🏊 Liquidity Removal Parameters:`);
    console.log(`Removing LP Tokens: ${formatTokenAmount(lpAmount)} LP Tokens (50% of holdings)`);

    // 3. Create transaction
    const transaction = new Transaction();

    // 3.1. Remove liquidity instruction
    const removeLiquidityInstruction = {
      programId: AMM_PROGRAM_ID,
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
        { pubkey: LP_MINT, isSigner: false, isWritable: true },
        { pubkey: vaultA, isSigner: false, isWritable: true },
        { pubkey: vaultB, isSigner: false, isWritable: true },
        { pubkey: userLP, isSigner: false, isWritable: true },
        { pubkey: userTokenA, isSigner: false, isWritable: true },
        { pubkey: userTokenB, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([2]), // RemoveLiquidity discriminator
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(lpAmount)]).buffer)),
      ]),
    };

    transaction.add(removeLiquidityInstruction);

    // 4. Send transaction
    console.log("\n📝 Sending remove liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair]);

    console.log(`✅ Liquidity removed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Check balances after removing liquidity
    console.log("\n📊 Balances AFTER Removing Liquidity:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceLPAfter = await getTokenBalance(userLP);
    const vaultAAfter = await getTokenBalance(vaultA);
    const vaultBAfter = await getTokenBalance(vaultB);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`User LP: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);
    console.log(`Vault A: ${formatTokenAmount(vaultAAfter)} (${vaultAAfter} raw)`);
    console.log(`Vault B: ${formatTokenAmount(vaultBAfter)} (${vaultBAfter} raw)`);

    // 6. Calculate changes
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    const lpChange = balanceLPBefore - balanceLPAfter;
    const vaultAChange = vaultABefore - vaultAAfter;
    const vaultBChange = vaultBBefore - vaultBAfter;

    console.log(`\n📈 Changes:`);
    console.log(`Token A received by user: ${formatTokenAmount(tokenAChange)}`);
    console.log(`Token B received by user: ${formatTokenAmount(tokenBChange)}`);
    console.log(`LP tokens burned: ${formatTokenAmount(lpChange)}`);
    console.log(`Token A removed from vault: ${formatTokenAmount(vaultAChange)}`);
    console.log(`Token B removed from vault: ${formatTokenAmount(vaultBChange)}`);

    // 7. Calculate removal ratio
    const removalRatioA = tokenAChange / vaultABefore;
    const removalRatioB = tokenBChange / vaultBBefore;
    const lpRemovalRatio = lpChange / balanceLPBefore;

    console.log(`\n📊 Removal Ratios:`);
    console.log(`Token A removal ratio: ${(removalRatioA * 100).toFixed(2)}%`);
    console.log(`Token B removal ratio: ${(removalRatioB * 100).toFixed(2)}%`);
    console.log(`LP token removal ratio: ${(lpRemovalRatio * 100).toFixed(2)}%`);

    // 8. Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastLiquidityRemoval: {
        lpAmount,
        tokenAReceived: tokenAChange,
        tokenBReceived: tokenBChange,
        transactionSignature: signature,
        timestamp: new Date().toISOString(),
      }
    };

    fs.writeFileSync("pool-ab-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool info saved to pool-ab-info.json");

  } catch (error) {
    console.error("❌ Error removing liquidity:", error);
    throw error;
  }
}

// Run the function
removeLiquidity().catch(console.error);
