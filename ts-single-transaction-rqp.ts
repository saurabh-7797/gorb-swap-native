import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
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
 * TypeScript Script: Single Transaction Multihop Swap R → Q → P
 * Based on IDL: MultihopSwap (discriminant: 4)
 * Args: amountIn (u64), minimumAmountOut (u64)
 */
async function singleTransactionMultihopRQP() {
  try {
    console.log("🚀 TypeScript Script: Single Transaction Multihop Swap R → Q → P...");
    
    // Load pool info from previous steps
    const poolQRInfo = JSON.parse(fs.readFileSync('pool-qr-info.json', 'utf-8'));
    const poolPQInfo = JSON.parse(fs.readFileSync('pool-pq-info.json', 'utf-8'));
    
    // Pool Q-R details
    const poolQRPDA = new PublicKey(poolQRInfo.poolPDA);
    const TOKEN_Q_MINT = new PublicKey(poolQRInfo.tokenQ);
    const TOKEN_R_MINT = new PublicKey(poolQRInfo.tokenR);
    const vaultQ_QR = new PublicKey(poolQRInfo.vaultQ); // Q vault from Q-R pool
    const vaultR = new PublicKey(poolQRInfo.vaultR);
    
    // Pool P-Q details
    const poolPQPDA = new PublicKey(poolPQInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolPQInfo.tokenP);
    const vaultP = new PublicKey(poolPQInfo.vaultP);
    const vaultQ_PQ = new PublicKey(poolPQInfo.vaultQ); // Q vault from P-Q pool
    
    console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Pool Q-R PDA: ${poolQRPDA.toString()}`);
    console.log(`Pool P-Q PDA: ${poolPQPDA.toString()}`);

    // User ATAs
    const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token R ATA: ${userTokenR.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Multihop Swap:");
    const balanceTokenRBefore = await getTokenBalance(userTokenR);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    
    console.log(`Token R: ${formatTokenAmount(balanceTokenRBefore)} (${balanceTokenRBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);

    // Define swap parameters
    const amountIn = 1_500_000_000; // 1.5 Token R
    const minimumAmountOut = 1; // Minimum 1 unit of Token P (very low for testing)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token R`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} Token P`);
    console.log(`Path: R → Q → P`);

    // Create transaction
    const transaction = new Transaction();

    // Create intermediate Token Q account for the swap route
    const intermediateTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    // Check if intermediate Q account exists, if not create it
    try {
      await getAccount(connection, intermediateTokenQ, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log("✅ Intermediate Q account already exists");
    } catch (error) {
      console.log("📝 Creating intermediate Q account...");
      const createATAInstruction = {
        keys: [
          { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: intermediateTokenQ, isSigner: false, isWritable: true },
          { pubkey: userKeypair.publicKey, isSigner: false, isWritable: false },
          { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: ATA_PROGRAM_ID,
        data: Buffer.from([0]), // CreateAssociatedTokenAccount instruction
      };
      transaction.add(createATAInstruction);
    }

    // Prepare accounts for MultihopSwap (matching Rust program order)
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userTokenR, isSigner: false, isWritable: true }, // Initial input
      
      // Hop 1: R → Q (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      // Pool was created as Q-R, so use Q-R order but provide R as input
      { pubkey: poolQRPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false }, // token_a = Q
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false }, // token_b = R
      { pubkey: vaultQ_QR, isSigner: false, isWritable: true }, // vault_a = Q vault from Q-R pool
      { pubkey: vaultR, isSigner: false, isWritable: true }, // vault_b = R vault
      { pubkey: intermediateTokenQ, isSigner: false, isWritable: true }, // Intermediate Q
      { pubkey: intermediateTokenQ, isSigner: false, isWritable: true }, // Next token account
      
      // Hop 2: Q → P (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      // Pool was created as P-Q, so use P-Q order but provide Q as input
      { pubkey: poolPQPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false }, // token_a = P
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false }, // token_b = Q
      { pubkey: vaultP, isSigner: false, isWritable: true }, // vault_a = P vault
      { pubkey: vaultQ_PQ, isSigner: false, isWritable: true }, // vault_b = Q vault from P-Q pool
      { pubkey: intermediateTokenQ, isSigner: false, isWritable: true }, // input = Q account
      { pubkey: userTokenP, isSigner: false, isWritable: true }, // output = P account
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
    console.log("\n📝 Sending single transaction multihop swap...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Single transaction multihop swap R → Q → P completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Multihop Swap:");
    const balanceTokenRAfter = await getTokenBalance(userTokenR);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    
    console.log(`Token R: ${formatTokenAmount(balanceTokenRAfter)} (${balanceTokenRAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);

    // Calculate changes
    const tokenRUsed = balanceTokenRBefore - balanceTokenRAfter;
    const tokenQChange = balanceTokenQAfter - balanceTokenQBefore;
    const tokenPReceived = balanceTokenPAfter - balanceTokenPBefore;
    
    console.log(`\n📈 Multihop Swap Results:`);
    console.log(`Token R Used: ${formatTokenAmount(tokenRUsed)}`);
    console.log(`Token Q Change: ${formatTokenAmount(tokenQChange)} (should be ~0 for multihop)`);
    console.log(`Token P Received: ${formatTokenAmount(tokenPReceived)}`);
    
    // Calculate effective exchange rate
    if (tokenRUsed > 0) {
      const exchangeRate = tokenPReceived / tokenRUsed;
      console.log(`\n💱 Effective Exchange Rate: 1 Token R = ${exchangeRate.toFixed(6)} Token P`);
    }

    // Save swap info
    const swapInfo = {
      type: "single_transaction_multihop",
      path: "R → Q → P",
      amountIn,
      amountOut: tokenPReceived,
      tokenRUsed,
      tokenQChange,
      tokenPReceived,
      poolQRPDA: poolQRPDA.toString(),
      poolPQPDA: poolPQPDA.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("single-transaction-multihop-rqp-results.json", JSON.stringify(swapInfo, null, 2));
    console.log("\n💾 Single transaction multihop swap results saved to single-transaction-multihop-rqp-results.json");

  } catch (error) {
    console.error("❌ Error in single transaction multihop swap R → Q → P:", error);
    throw error;
  }
}

// Run the function
singleTransactionMultihopRQP().catch(console.error);
