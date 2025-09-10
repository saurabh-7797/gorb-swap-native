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
 * TypeScript Script: Add Liquidity to Pool P-R
 * Based on IDL: AddLiquidity (discriminant: 1)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidityPR() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool P-R...");
    
    // Load pool info from previous initialization
    const poolInfo = JSON.parse(fs.readFileSync('pool-pr-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolInfo.tokenP);
    const TOKEN_R_MINT = new PublicKey(poolInfo.tokenR);
    const lpMintPDA = new PublicKey(poolInfo.lpMint);
    const vaultP = new PublicKey(poolInfo.vaultP);
    const vaultR = new PublicKey(poolInfo.vaultR);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token R ATA: ${userTokenR.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenRBefore = await getTokenBalance(userTokenR);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token R: ${formatTokenAmount(balanceTokenRBefore)} (${balanceTokenRBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Liquidity addition parameters with 2:3 ratio
    const amountP = 4_000_000_000; // 4 tokens
    const amountR = 6_000_000_000; // 6 tokens
    
    console.log(`\n🏊 Liquidity Addition Parameters:`);
    console.log(`Token P Amount: ${formatTokenAmount(amountP)} Token P`);
    console.log(`Token R Amount: ${formatTokenAmount(amountR)} Token R`);
    console.log(`Ratio: 2:3`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultP, isSigner: false, isWritable: true },
      { pubkey: vaultR, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userTokenR, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountP), 1);
    data.writeBigUInt64LE(BigInt(amountR), 9);
    
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

    console.log(`✅ Liquidity added to Pool P-R successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenRAfter = await getTokenBalance(userTokenR);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token R: ${formatTokenAmount(balanceTokenRAfter)} (${balanceTokenRAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate results
    const tokenPUsed = balanceTokenPBefore - balanceTokenPAfter;
    const tokenRUsed = balanceTokenRBefore - balanceTokenRAfter;
    const lpTokensReceived = balanceLPAfter - balanceLPBefore;

    console.log(`\n📈 Liquidity Addition Results:`);
    console.log(`Token P Used: ${formatTokenAmount(tokenPUsed)}`);
    console.log(`Token R Used: ${formatTokenAmount(tokenRUsed)}`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpTokensReceived)}`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalAmountP: amountP,
      additionalAmountR: amountR,
      addLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-pr-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool P-R info saved to pool-pr-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity to pool P-R:", error);
    throw error;
  }
}

// Run the function
addLiquidityPR().catch(console.error);
