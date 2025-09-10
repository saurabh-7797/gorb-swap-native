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
 * TypeScript Script: Add Liquidity to Pool R-M
 * Based on IDL: AddLiquidity (discriminant: 1)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidityRM() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool R-M...");
    
    // Load pool info from previous initialization
    const poolInfo = JSON.parse(fs.readFileSync('pool-rm-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_R_MINT = new PublicKey(poolInfo.tokenR);
    const TOKEN_M_MINT = new PublicKey(poolInfo.tokenM);
    const lpMintPDA = new PublicKey(poolInfo.lpMint);
    const vaultR = new PublicKey(poolInfo.vaultR);
    const vaultM = new PublicKey(poolInfo.vaultM);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
    console.log(`Token M: ${TOKEN_M_MINT.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // User ATAs
    const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenM = getAssociatedTokenAddressSync(TOKEN_M_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token R ATA: ${userTokenR.toString()}`);
    console.log(`User Token M ATA: ${userTokenM.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenRBefore = await getTokenBalance(userTokenR);
    const balanceTokenMBefore = await getTokenBalance(userTokenM);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token R: ${formatTokenAmount(balanceTokenRBefore)} (${balanceTokenRBefore} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMBefore)} (${balanceTokenMBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Liquidity addition parameters with 1:1 ratio
    const amountR = 3_000_000_000; // 3 tokens
    const amountM = 3_000_000_000; // 3 tokens
    
    console.log(`\n🏊 Liquidity Addition Parameters:`);
    console.log(`Token R Amount: ${formatTokenAmount(amountR)} Token R`);
    console.log(`Token M Amount: ${formatTokenAmount(amountM)} Token M`);
    console.log(`Ratio: 1:1`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_M_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultR, isSigner: false, isWritable: true },
      { pubkey: vaultM, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: userTokenR, isSigner: false, isWritable: true },
      { pubkey: userTokenM, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountR), 1);
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

    console.log(`✅ Liquidity added to Pool R-M successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenRAfter = await getTokenBalance(userTokenR);
    const balanceTokenMAfter = await getTokenBalance(userTokenM);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token R: ${formatTokenAmount(balanceTokenRAfter)} (${balanceTokenRAfter} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMAfter)} (${balanceTokenMAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate results
    const tokenRUsed = balanceTokenRBefore - balanceTokenRAfter;
    const tokenMUsed = balanceTokenMBefore - balanceTokenMAfter;
    const lpTokensReceived = balanceLPAfter - balanceLPBefore;

    console.log(`\n📈 Liquidity Addition Results:`);
    console.log(`Token R Used: ${formatTokenAmount(tokenRUsed)}`);
    console.log(`Token M Used: ${formatTokenAmount(tokenMUsed)}`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpTokensReceived)}`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalAmountR: amountR,
      additionalAmountM: amountM,
      addLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-rm-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool R-M info saved to pool-rm-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity to pool R-M:", error);
    throw error;
  }
}

// Run the function
addLiquidityRM().catch(console.error);
