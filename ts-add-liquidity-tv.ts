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

/**
 * TypeScript Script: Add Liquidity to Pool T-V
 * Based on IDL: AddLiquidity (discriminant: 2)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidityTV() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool T-V...");
    
    // Load pool info from previous initialization
    const poolInfo = JSON.parse(fs.readFileSync('pool-tv-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_T_MINT = new PublicKey(poolInfo.tokenT);
    const TOKEN_V_MINT = new PublicKey(poolInfo.tokenV);
    const lpMintPDA = new PublicKey(poolInfo.lpMint);
    const vaultT = new PublicKey(poolInfo.vaultT);
    const vaultV = new PublicKey(poolInfo.vaultV);
    const userTokenT = new PublicKey(poolInfo.userTokenT);
    const userTokenV = new PublicKey(poolInfo.userTokenV);
    const userLP = new PublicKey(poolInfo.userLP);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);
    console.log(`Token V: ${TOKEN_V_MINT.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceTokenVBefore = await getTokenBalance(userTokenV);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`Token V: ${formatTokenAmount(balanceTokenVBefore)} (${balanceTokenVBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Liquidity parameters with 10:30 ratio
    const amountT = 10_000_000_000; // 10 tokens
    const amountV = 30_000_000_000; // 30 tokens
    
    console.log(`\n🏊 Liquidity Addition Parameters:`);
    console.log(`Token T Amount: ${formatTokenAmount(amountT)} Token T`);
    console.log(`Token V Amount: ${formatTokenAmount(amountV)} Token V`);
    console.log(`Ratio: 10:30 (1:3)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching working script order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_V_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: vaultV, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userTokenV, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountT), 1);
    data.writeBigUInt64LE(BigInt(amountV), 9);
    
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

    console.log(`✅ Liquidity added to Pool T-V successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceTokenVAfter = await getTokenBalance(userTokenV);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`Token V: ${formatTokenAmount(balanceTokenVAfter)} (${balanceTokenVAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenTChange = balanceTokenTBefore - balanceTokenTAfter;
    const tokenVChange = balanceTokenVBefore - balanceTokenVAfter;
    const lpChange = balanceLPAfter - balanceLPBefore;
    
    console.log(`\n📈 Liquidity Addition Results:`);
    console.log(`Token T Used: ${formatTokenAmount(tokenTChange)}`);
    console.log(`Token V Used: ${formatTokenAmount(tokenVChange)}`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpChange)}`);

    // Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalLiquidityT: amountT,
      additionalLiquidityV: amountV,
      totalLiquidityT: poolInfo.initialAmountT + amountT,
      totalLiquidityV: poolInfo.initialAmountV + amountV,
      addLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-tv-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool T-V info saved to pool-tv-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity to pool T-V:", error);
    throw error;
  }
}

// Run the function
addLiquidityTV().catch(console.error);
