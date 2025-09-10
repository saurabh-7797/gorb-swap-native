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

// Helper function to calculate expected output using constant product formula
function calculateExpectedOutput(amountIn: number, reserveIn: number, reserveOut: number): number {
  const amountInWithFee = amountIn * 997; // 0.3% fee
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * 1000) + amountInWithFee;
  return Math.floor(numerator / denominator);
}

/**
 * TypeScript Script: Swap P → Q (Large Amount)
 * Based on IDL: Swap (discriminant: 2)
 * Args: amountIn (u64), minimumAmountOut (u64)
 */
async function swapPQ() {
  try {
    console.log("🚀 TypeScript Script: Large Swap P → Q...");
    
    // Load pool info from previous initialization
    const poolInfo = JSON.parse(fs.readFileSync('pool-pq-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolInfo.tokenP);
    const TOKEN_Q_MINT = new PublicKey(poolInfo.tokenQ);
    const vaultP = new PublicKey(poolInfo.vaultP);
    const vaultQ = new PublicKey(poolInfo.vaultQ);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);

    // User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Swap:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);

    // Get current pool reserves (approximate from previous transactions)
    // Pool P-Q was initialized with 1:1 ratio, then 5:5 was added
    // So current reserves should be approximately 6 P and 6 Q
    const reserveP = 6_000_000_000; // 6 tokens (approximate)
    const reserveQ = 6_000_000_000; // 6 tokens (approximate)

    // Large swap parameters
    const amountIn = 2_000_000_000; // 2 Token P (large amount)
    const minimumAmountOut = 0; // No slippage protection for this test
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token P`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} Token Q`);
    console.log(`Pool Reserves: ~${formatTokenAmount(reserveP)} P, ~${formatTokenAmount(reserveQ)} Q`);

    // Calculate expected output
    const expectedOutput = calculateExpectedOutput(amountIn, reserveP, reserveQ);
    console.log(`Expected Output: ~${formatTokenAmount(expectedOutput)} Token Q`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultP, isSigner: false, isWritable: true },
      { pubkey: vaultQ, isSigner: false, isWritable: true },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userTokenQ, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator (3rd in enum)
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(1, 9); // direction_a_to_b = true (P → Q)
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add Swap instruction
    console.log("📝 Adding Swap instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Swap P → Q completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Swap:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);

    // Calculate swap results
    const tokenPUsed = balanceTokenPBefore - balanceTokenPAfter;
    const tokenQReceived = balanceTokenQAfter - balanceTokenQBefore;

    console.log(`\n📈 Swap Results:`);
    console.log(`Token P Used: ${formatTokenAmount(tokenPUsed)}`);
    console.log(`Token Q Received: ${formatTokenAmount(tokenQReceived)}`);
    console.log(`Effective Exchange Rate: 1 Token P = ${(tokenQReceived / tokenPUsed).toFixed(6)} Token Q`);

    // Calculate price impact
    const priceImpact = ((expectedOutput - tokenQReceived) / expectedOutput * 100).toFixed(2);
    console.log(`Price Impact: ${priceImpact}%`);

    // Save swap results
    const swapResults = {
      poolPDA: poolPDA.toString(),
      tokenP: TOKEN_P_MINT.toString(),
      tokenQ: TOKEN_Q_MINT.toString(),
      amountIn: amountIn,
      amountOut: tokenQReceived,
      expectedOutput: expectedOutput,
      priceImpact: parseFloat(priceImpact),
      exchangeRate: tokenQReceived / tokenPUsed,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("swap-pq-results.json", JSON.stringify(swapResults, null, 2));
    console.log("\n💾 Swap results saved to swap-pq-results.json");

  } catch (error) {
    console.error("❌ Error performing swap P → Q:", error);
    throw error;
  }
}

// Run the function
swapPQ().catch(console.error);
