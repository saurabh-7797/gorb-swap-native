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
 * TypeScript Script: Add Liquidity to Pool S-T
 * Based on IDL: AddLiquidity (discriminant: 1)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidityST() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool S-T...");
    
    // Load pool info from previous step
    const poolInfo = JSON.parse(fs.readFileSync('pool-st-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_S_MINT = new PublicKey(poolInfo.tokenS);
    const TOKEN_T_MINT = new PublicKey(poolInfo.tokenT);
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const vaultS = new PublicKey(poolInfo.vaultS);
    const vaultT = new PublicKey(poolInfo.vaultT);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token S: ${TOKEN_S_MINT.toString()}`);
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // User ATAs
    const userTokenS = getAssociatedTokenAddressSync(TOKEN_S_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenT = getAssociatedTokenAddressSync(TOKEN_T_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token S ATA: ${userTokenS.toString()}`);
    console.log(`User Token T ATA: ${userTokenT.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenSBefore = await getTokenBalance(userTokenS);
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceLPBefore = await getTokenBalance(userLP);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSBefore)} (${balanceTokenSBefore} raw)`);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Define liquidity amounts (maintaining 2:3 ratio)
    const amountS = 20_000_000_000; // 20 tokens
    const amountT = 30_000_000_000; // 30 tokens
    
    console.log(`\n🏊 Adding Liquidity Parameters:`);
    console.log(`Token S Amount: ${formatTokenAmount(amountS)} Token S`);
    console.log(`Token T Amount: ${formatTokenAmount(amountT)} Token T`);
    console.log(`Ratio: 2:3 (maintaining pool ratio)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching working JavaScript script order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_S_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultS, isSigner: false, isWritable: true },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      { pubkey: userTokenS, isSigner: false, isWritable: true },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountS), 1);
    data.writeBigUInt64LE(BigInt(amountT), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add AddLiquidity instruction
    console.log("📝 Adding AddLiquidity instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending add liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Liquidity added to Pool S-T successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenSAfter = await getTokenBalance(userTokenS);
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSAfter)} (${balanceTokenSAfter} raw)`);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenSUsed = balanceTokenSBefore - balanceTokenSAfter;
    const tokenTUsed = balanceTokenTBefore - balanceTokenTAfter;
    const lpTokensReceived = balanceLPAfter - balanceLPBefore;
    
    console.log(`\n📈 Liquidity Changes:`);
    console.log(`Token S Used: ${formatTokenAmount(tokenSUsed)}`);
    console.log(`Token T Used: ${formatTokenAmount(tokenTUsed)}`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpTokensReceived)}`);

    // Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalAmountS: amountS,
      additionalAmountT: amountT,
      totalLPTokens: balanceLPAfter,
      addLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-st-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated Pool S-T info saved to pool-st-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity to Pool S-T:", error);
    throw error;
  }
}

// Run the function
addLiquidityST().catch(console.error);
