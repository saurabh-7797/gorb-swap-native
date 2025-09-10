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
 * TypeScript Script: Remove Liquidity from Pool P-Q
 * Based on IDL: RemoveLiquidity (discriminant: 2)
 * Args: lp_amount (u64)
 */
async function removeLiquidityPQ() {
  try {
    console.log("🚀 TypeScript Script: Removing Liquidity from Pool P-Q...");
    
    // Load pool info from previous initialization
    const poolInfo = JSON.parse(fs.readFileSync('pool-pq-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolInfo.tokenP);
    const TOKEN_Q_MINT = new PublicKey(poolInfo.tokenQ);
    const lpMintPDA = new PublicKey(poolInfo.lpMint);
    const vaultP = new PublicKey(poolInfo.vaultP);
    const vaultQ = new PublicKey(poolInfo.vaultQ);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before removing liquidity
    console.log("\n📊 Balances BEFORE Removing Liquidity:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Liquidity removal parameters
    const lpAmountToRemove = 2_000_000_000; // 2 LP tokens (remove half of current holdings)
    
    console.log(`\n🏊 Liquidity Removal Parameters:`);
    console.log(`LP Tokens to Remove: ${formatTokenAmount(lpAmountToRemove)}`);
    console.log(`Percentage of Holdings: ${((lpAmountToRemove / balanceLPBefore) * 100).toFixed(2)}%`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for RemoveLiquidity (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultP, isSigner: false, isWritable: true },
      { pubkey: vaultQ, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userTokenQ, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: RemoveLiquidity { lp_amount })
    const data = Buffer.alloc(1 + 8); // 1 byte discriminator + u64
    data.writeUInt8(2, 0); // RemoveLiquidity discriminator (2nd in enum)
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

    console.log(`✅ Liquidity removed from Pool P-Q successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after removing liquidity
    console.log("\n📊 Balances AFTER Removing Liquidity:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate results
    const tokenPReceived = balanceTokenPAfter - balanceTokenPBefore;
    const tokenQReceived = balanceTokenQAfter - balanceTokenQBefore;
    const lpTokensBurned = balanceLPBefore - balanceLPAfter;

    console.log(`\n📈 Liquidity Removal Results:`);
    console.log(`Token P Received: ${formatTokenAmount(tokenPReceived)}`);
    console.log(`Token Q Received: ${formatTokenAmount(tokenQReceived)}`);
    console.log(`LP Tokens Burned: ${formatTokenAmount(lpTokensBurned)}`);

    // Calculate effective exchange rate
    if (tokenPReceived > 0 && tokenQReceived > 0) {
      console.log(`Effective Exchange Rate: 1 Token P = ${(tokenQReceived / tokenPReceived).toFixed(6)} Token Q`);
    }

    // Save removal results
    const removalResults = {
      poolPDA: poolPDA.toString(),
      tokenP: TOKEN_P_MINT.toString(),
      tokenQ: TOKEN_Q_MINT.toString(),
      lpAmountRemoved: lpAmountToRemove,
      tokenPReceived: tokenPReceived,
      tokenQReceived: tokenQReceived,
      lpTokensBurned: lpTokensBurned,
      exchangeRate: tokenPReceived > 0 ? tokenQReceived / tokenPReceived : 0,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("remove-liquidity-pq-results.json", JSON.stringify(removalResults, null, 2));
    console.log("\n💾 Liquidity removal results saved to remove-liquidity-pq-results.json");

  } catch (error) {
    console.error("❌ Error removing liquidity from pool P-Q:", error);
    throw error;
  }
}

// Run the function
removeLiquidityPQ().catch(console.error);
