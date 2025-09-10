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
 * TypeScript Script: Multihop Swap S → T → U
 * Based on IDL: MultihopSwap (discriminant: 4)
 * Args: amountIn (u64), minimumAmountOut (u64)
 */
async function multihopSwapSTU() {
  try {
    console.log("🚀 TypeScript Script: Multihop Swap S → T → U...");
    
    // Load pool info from previous steps
    const poolSTInfo = JSON.parse(fs.readFileSync('pool-st-info.json', 'utf-8'));
    const poolTUInfo = JSON.parse(fs.readFileSync('pool-tu-info.json', 'utf-8'));
    
    // Pool S-T details
    const poolSTPDA = new PublicKey(poolSTInfo.poolPDA);
    const TOKEN_S_MINT = new PublicKey(poolSTInfo.tokenS);
    const TOKEN_T_MINT = new PublicKey(poolSTInfo.tokenT);
    const vaultS = new PublicKey(poolSTInfo.vaultS);
    const vaultT = new PublicKey(poolSTInfo.vaultT);
    
    // Pool T-U details
    const poolTUPDA = new PublicKey(poolTUInfo.poolPDA);
    const TOKEN_U_MINT = new PublicKey(poolTUInfo.tokenU);
    const vaultT2 = new PublicKey(poolTUInfo.vaultT);
    const vaultU = new PublicKey(poolTUInfo.vaultU);
    
    console.log(`Token S: ${TOKEN_S_MINT.toString()}`);
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);
    console.log(`Token U: ${TOKEN_U_MINT.toString()}`);
    console.log(`Pool S-T PDA: ${poolSTPDA.toString()}`);
    console.log(`Pool T-U PDA: ${poolTUPDA.toString()}`);

    // User ATAs
    const userTokenS = getAssociatedTokenAddressSync(TOKEN_S_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenT = getAssociatedTokenAddressSync(TOKEN_T_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenU = getAssociatedTokenAddressSync(TOKEN_U_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token S ATA: ${userTokenS.toString()}`);
    console.log(`User Token T ATA: ${userTokenT.toString()}`);
    console.log(`User Token U ATA: ${userTokenU.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Multihop Swap:");
    const balanceTokenSBefore = await getTokenBalance(userTokenS);
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceTokenUBefore = await getTokenBalance(userTokenU);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSBefore)} (${balanceTokenSBefore} raw)`);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUBefore)} (${balanceTokenUBefore} raw)`);

    // Define swap parameters
    const amountIn = 1_000_000_000; // 1 Token S (smaller amount for testing)
    const minimumAmountOut = 1; // Minimum 1 unit of Token U (very low for testing)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token S`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} Token U`);
    console.log(`Path: S → T → U`);

    // Create transaction
    const transaction = new Transaction();

    // Create intermediate Token T account for the swap route
    const intermediateTokenT = getAssociatedTokenAddressSync(TOKEN_T_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

    // Prepare accounts for MultihopSwap (matching Rust program order)
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userTokenS, isSigner: false, isWritable: true }, // Initial input
      
      // Hop 1: S → T (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      { pubkey: poolSTPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_S_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultS, isSigner: false, isWritable: true },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: intermediateTokenT, isSigner: false, isWritable: true }, // Intermediate T
      { pubkey: intermediateTokenT, isSigner: false, isWritable: true }, // Next token account
      
      // Hop 2: T → U (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      { pubkey: poolTUPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_U_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT2, isSigner: false, isWritable: true },
      { pubkey: vaultU, isSigner: false, isWritable: true },
      { pubkey: intermediateTokenT, isSigner: false, isWritable: true }, // Intermediate T
      { pubkey: userTokenU, isSigner: false, isWritable: true }, // Final output
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

    console.log(`✅ Multihop swap S → T → U completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Multihop Swap:");
    const balanceTokenSAfter = await getTokenBalance(userTokenS);
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceTokenUAfter = await getTokenBalance(userTokenU);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSAfter)} (${balanceTokenSAfter} raw)`);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUAfter)} (${balanceTokenUAfter} raw)`);

    // Calculate changes
    const tokenSUsed = balanceTokenSBefore - balanceTokenSAfter;
    const tokenTChange = balanceTokenTAfter - balanceTokenTBefore;
    const tokenUReceived = balanceTokenUAfter - balanceTokenUBefore;
    
    console.log(`\n📈 Multihop Swap Results:`);
    console.log(`Token S Used: ${formatTokenAmount(tokenSUsed)}`);
    console.log(`Token T Change: ${formatTokenAmount(tokenTChange)} (should be ~0 for multihop)`);
    console.log(`Token U Received: ${formatTokenAmount(tokenUReceived)}`);
    
    // Calculate effective exchange rate
    if (tokenSUsed > 0) {
      const exchangeRate = tokenUReceived / tokenSUsed;
      console.log(`\n💱 Effective Exchange Rate: 1 Token S = ${exchangeRate.toFixed(6)} Token U`);
    }

    // Save swap info
    const swapInfo = {
      type: "multihop",
      path: "S → T → U",
      amountIn,
      amountOut: tokenUReceived,
      tokenSUsed,
      tokenTChange,
      tokenUReceived,
      poolSTPDA: poolSTPDA.toString(),
      poolTUPDA: poolTUPDA.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("multihop-swap-stu-results.json", JSON.stringify(swapInfo, null, 2));
    console.log("\n💾 Multihop swap results saved to multihop-swap-stu-results.json");

  } catch (error) {
    console.error("❌ Error in multihop swap S → T → U:", error);
    throw error;
  }
}

// Run the function
multihopSwapSTU().catch(console.error);
