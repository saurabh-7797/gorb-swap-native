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
 * TypeScript Script: Add Liquidity to Pool P-M
 * Based on IDL: AddLiquidity (discriminant: 1)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidityPM() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool P-M...");
    
    // Load pool info from previous initialization
    const poolInfo = JSON.parse(fs.readFileSync('pool-pm-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolInfo.tokenP);
    const TOKEN_M_MINT = new PublicKey(poolInfo.tokenM);
    const lpMintPDA = new PublicKey(poolInfo.lpMint);
    const vaultP = new PublicKey(poolInfo.vaultP);
    const vaultM = new PublicKey(poolInfo.vaultM);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token M: ${TOKEN_M_MINT.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenM = getAssociatedTokenAddressSync(TOKEN_M_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token M ATA: ${userTokenM.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenMBefore = await getTokenBalance(userTokenM);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMBefore)} (${balanceTokenMBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Liquidity addition parameters with 1:2 ratio
    const amountP = 2_000_000_000; // 2 tokens
    const amountM = 4_000_000_000; // 4 tokens
    
    console.log(`\n🏊 Liquidity Addition Parameters:`);
    console.log(`Token P Amount: ${formatTokenAmount(amountP)} Token P`);
    console.log(`Token M Amount: ${formatTokenAmount(amountM)} Token M`);
    console.log(`Ratio: 1:2`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_M_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultP, isSigner: false, isWritable: true },
      { pubkey: vaultM, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userTokenM, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountP), 1);
    data.writeBigUInt64LE(BigInt(amountM), 9);
    
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

    console.log(`✅ Liquidity added to Pool P-M successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenMAfter = await getTokenBalance(userTokenM);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMAfter)} (${balanceTokenMAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate results
    const tokenPUsed = balanceTokenPBefore - balanceTokenPAfter;
    const tokenMUsed = balanceTokenMBefore - balanceTokenMAfter;
    const lpTokensReceived = balanceLPAfter - balanceLPBefore;

    console.log(`\n📈 Liquidity Addition Results:`);
    console.log(`Token P Used: ${formatTokenAmount(tokenPUsed)}`);
    console.log(`Token M Used: ${formatTokenAmount(tokenMUsed)}`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpTokensReceived)}`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalAmountP: amountP,
      additionalAmountM: amountM,
      addLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-pm-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool P-M info saved to pool-pm-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity to pool P-M:", error);
    throw error;
  }
}

// Run the function
addLiquidityPM().catch(console.error);
