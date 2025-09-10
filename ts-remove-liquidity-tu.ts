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
 * TypeScript Script: Remove Liquidity from Pool T-U
 * Based on IDL: RemoveLiquidity (discriminant: 2)
 * Args: amount (u64)
 */
async function removeLiquidityTU() {
  try {
    console.log("🚀 TypeScript Script: Removing Liquidity from Pool T-U...");
    
    // Load pool info from previous step
    const poolInfo = JSON.parse(fs.readFileSync('pool-tu-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_T_MINT = new PublicKey(poolInfo.tokenT);
    const TOKEN_U_MINT = new PublicKey(poolInfo.tokenU);
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const vaultT = new PublicKey(poolInfo.vaultT);
    const vaultU = new PublicKey(poolInfo.vaultU);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);
    console.log(`Token U: ${TOKEN_U_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // User ATAs
    const userTokenT = getAssociatedTokenAddressSync(TOKEN_T_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenU = getAssociatedTokenAddressSync(TOKEN_U_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token T ATA: ${userTokenT.toString()}`);
    console.log(`User Token U ATA: ${userTokenU.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before removing liquidity
    console.log("\n📊 Balances BEFORE Removing Liquidity:");
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceTokenUBefore = await getTokenBalance(userTokenU);
    const balanceLPBefore = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUBefore)} (${balanceTokenUBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Define liquidity removal amount (remove 50% of LP tokens)
    const lpAmountToRemove = Math.floor(balanceLPBefore / 2); // Remove half of LP tokens
    
    console.log(`\n🏊 Removing Liquidity Parameters:`);
    console.log(`LP Tokens to Remove: ${formatTokenAmount(lpAmountToRemove)} (${lpAmountToRemove} raw)`);
    console.log(`Percentage: 50% of total LP tokens`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for RemoveLiquidity (matching working JavaScript script order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_U_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: vaultU, isSigner: false, isWritable: true },
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userTokenU, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: RemoveLiquidity { amount })
    const data = Buffer.alloc(1 + 8); // 1 byte discriminator + 1x u64
    data.writeUInt8(2, 0); // RemoveLiquidity discriminator
    data.writeBigUInt64LE(BigInt(lpAmountToRemove), 1);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add RemoveLiquidity instruction
    console.log("📝 Adding RemoveLiquidity instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending remove liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Liquidity removed from Pool T-U successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after removing liquidity
    console.log("\n📊 Balances AFTER Removing Liquidity:");
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceTokenUAfter = await getTokenBalance(userTokenU);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUAfter)} (${balanceTokenUAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenTReceived = balanceTokenTAfter - balanceTokenTBefore;
    const tokenUReceived = balanceTokenUAfter - balanceTokenUBefore;
    const lpTokensRemoved = balanceLPBefore - balanceLPAfter;
    
    console.log(`\n📈 Liquidity Removal Results:`);
    console.log(`Token T Received: ${formatTokenAmount(tokenTReceived)}`);
    console.log(`Token U Received: ${formatTokenAmount(tokenUReceived)}`);
    console.log(`LP Tokens Removed: ${formatTokenAmount(lpTokensRemoved)}`);

    // Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      removedLPTokens: lpAmountToRemove,
      tokenTReceived,
      tokenUReceived,
      remainingLPTokens: balanceLPAfter,
      removeLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-tu-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated Pool T-U info saved to pool-tu-info.json");

  } catch (error) {
    console.error("❌ Error removing liquidity from Pool T-U:", error);
    throw error;
  }
}

// Run the function
removeLiquidityTU().catch(console.error);
