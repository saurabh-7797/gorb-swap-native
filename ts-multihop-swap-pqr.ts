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
 * TypeScript Script: Multihop Swap P → Q → R
 * Based on IDL: MultihopSwap (discriminant: 4)
 * Args: amountIn (u64), minimumAmountOut (u64)
 */
async function multihopSwapPQR() {
  try {
    console.log("🚀 TypeScript Script: Multihop Swap P → Q → R...");
    
    // Load pool info from previous steps
    const poolPQInfo = JSON.parse(fs.readFileSync('pool-pq-info.json', 'utf-8'));
    const poolQRInfo = JSON.parse(fs.readFileSync('pool-qr-info.json', 'utf-8'));
    
    // Pool P-Q details
    const poolPQPDA = new PublicKey(poolPQInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolPQInfo.tokenP);
    const TOKEN_Q_MINT = new PublicKey(poolPQInfo.tokenQ);
    const vaultP = new PublicKey(poolPQInfo.vaultP);
    const vaultQ = new PublicKey(poolPQInfo.vaultQ);
    
    // Pool Q-R details
    const poolQRPDA = new PublicKey(poolQRInfo.poolPDA);
    const TOKEN_R_MINT = new PublicKey(poolQRInfo.tokenR);
    const vaultQ2 = new PublicKey(poolQRInfo.vaultQ);
    const vaultR = new PublicKey(poolQRInfo.vaultR);
    
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
    console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
    console.log(`Pool P-Q PDA: ${poolPQPDA.toString()}`);
    console.log(`Pool Q-R PDA: ${poolQRPDA.toString()}`);

    // User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
    console.log(`User Token R ATA: ${userTokenR.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Multihop Swap:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    const balanceTokenRBefore = await getTokenBalance(userTokenR);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);
    console.log(`Token R: ${formatTokenAmount(balanceTokenRBefore)} (${balanceTokenRBefore} raw)`);

    // Define swap parameters
    const amountIn = 2_000_000_000; // 2 Token P
    const minimumAmountOut = 1; // Minimum 1 unit of Token R (very low for testing)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token P`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} Token R`);
    console.log(`Path: P → Q → R`);

    // Create transaction
    const transaction = new Transaction();

    // Create intermediate Token Q account for the swap route
    const intermediateTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

    // Prepare accounts for MultihopSwap (matching Rust program order)
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userTokenP, isSigner: false, isWritable: true }, // Initial input
      
      // Hop 1: P → Q (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      { pubkey: poolPQPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultP, isSigner: false, isWritable: true },
      { pubkey: vaultQ, isSigner: false, isWritable: true },
      { pubkey: intermediateTokenQ, isSigner: false, isWritable: true }, // Intermediate Q
      { pubkey: intermediateTokenQ, isSigner: false, isWritable: true }, // Next token account
      
      // Hop 2: Q → R (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      { pubkey: poolQRPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultQ2, isSigner: false, isWritable: true },
      { pubkey: vaultR, isSigner: false, isWritable: true },
      { pubkey: intermediateTokenQ, isSigner: false, isWritable: true }, // Intermediate Q
      { pubkey: userTokenR, isSigner: false, isWritable: true }, // Final output
    ];

    // Instruction data (Borsh: MultihopSwap { amount_in, minimum_amount_out })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(4, 0); // MultihopSwap discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeBigUInt64LE(BigInt(minimumAmountOut), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add MultihopSwap instruction
    console.log("📝 Adding MultihopSwap instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending multihop swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Multihop swap P → Q → R completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Multihop Swap:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    const balanceTokenRAfter = await getTokenBalance(userTokenR);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);
    console.log(`Token R: ${formatTokenAmount(balanceTokenRAfter)} (${balanceTokenRAfter} raw)`);

    // Calculate changes
    const tokenPUsed = balanceTokenPBefore - balanceTokenPAfter;
    const tokenQChange = balanceTokenQAfter - balanceTokenQBefore;
    const tokenRReceived = balanceTokenRAfter - balanceTokenRBefore;
    
    console.log(`\n📈 Multihop Swap Results:`);
    console.log(`Token P Used: ${formatTokenAmount(tokenPUsed)}`);
    console.log(`Token Q Change: ${formatTokenAmount(tokenQChange)} (should be ~0 for multihop)`);
    console.log(`Token R Received: ${formatTokenAmount(tokenRReceived)}`);
    
    // Calculate effective exchange rate
    if (tokenPUsed > 0) {
      const exchangeRate = tokenRReceived / tokenPUsed;
      console.log(`\n💱 Effective Exchange Rate: 1 Token P = ${exchangeRate.toFixed(6)} Token R`);
    }

    // Save swap info
    const swapInfo = {
      type: "multihop",
      path: "P → Q → R",
      amountIn,
      amountOut: tokenRReceived,
      tokenPUsed,
      tokenQChange,
      tokenRReceived,
      poolPQPDA: poolPQPDA.toString(),
      poolQRPDA: poolQRPDA.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("multihop-swap-pqr-results.json", JSON.stringify(swapInfo, null, 2));
    console.log("\n💾 Multihop swap results saved to multihop-swap-pqr-results.json");

  } catch (error) {
    console.error("❌ Error in multihop swap P → Q → R:", error);
    throw error;
  }
}

// Run the function
multihopSwapPQR().catch(console.error);
