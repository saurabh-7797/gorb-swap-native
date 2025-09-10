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
 * TypeScript Script: Add Liquidity to Pool T-U
 * Based on IDL: AddLiquidity (discriminant: 1)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidityTU() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool T-U...");
    
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

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceTokenUBefore = await getTokenBalance(userTokenU);
    const balanceLPBefore = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUBefore)} (${balanceTokenUBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Define liquidity amounts (maintaining 3:5 ratio)
    const amountT = 30_000_000_000; // 30 tokens
    const amountU = 50_000_000_000; // 50 tokens
    
    console.log(`\n🏊 Adding Liquidity Parameters:`);
    console.log(`Token T Amount: ${formatTokenAmount(amountT)} Token T`);
    console.log(`Token U Amount: ${formatTokenAmount(amountU)} Token U`);
    console.log(`Ratio: 3:5 (maintaining pool ratio)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching working JavaScript script order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_U_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: vaultU, isSigner: false, isWritable: true },
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userTokenU, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountT), 1);
    data.writeBigUInt64LE(BigInt(amountU), 9);
    
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

    console.log(`✅ Liquidity added to Pool T-U successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceTokenUAfter = await getTokenBalance(userTokenU);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUAfter)} (${balanceTokenUAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenTUsed = balanceTokenTBefore - balanceTokenTAfter;
    const tokenUUsed = balanceTokenUBefore - balanceTokenUAfter;
    const lpTokensReceived = balanceLPAfter - balanceLPBefore;
    
    console.log(`\n📈 Liquidity Changes:`);
    console.log(`Token T Used: ${formatTokenAmount(tokenTUsed)}`);
    console.log(`Token U Used: ${formatTokenAmount(tokenUUsed)}`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpTokensReceived)}`);

    // Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalAmountT: amountT,
      additionalAmountU: amountU,
      totalLPTokens: balanceLPAfter,
      addLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-tu-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated Pool T-U info saved to pool-tu-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity to Pool T-U:", error);
    throw error;
  }
}

// Run the function
addLiquidityTU().catch(console.error);
