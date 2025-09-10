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
 * TypeScript Script: Swap Token A to Native SOL
 */
async function swapTokenToNativeSOL() {
  try {
    console.log("🔄 Swapping Token A to Native SOL...");
    
    // Load pool info
    const poolInfo = JSON.parse(fs.readFileSync('pool-a-native-sol-info.json', 'utf-8'));
    
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_A_MINT = new PublicKey(poolInfo.tokenA);
    const POOL_TOKEN_VAULT = new PublicKey(poolInfo.poolTokenVault);
    
    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Pool Token Vault: ${POOL_TOKEN_VAULT.toString()}`);

    // User ATAs
    const userTokenA = new PublicKey(poolInfo.userTokenA);
    
    console.log(`User Token A ATA: ${userTokenA.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Swap:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const nativeSOLBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceBefore / 1e9} SOL (${nativeSOLBalanceBefore} lamports)`);

    // Swap parameters
    const amountIn = 50_000_000; // 0.05 Token A
    const minimumAmountOut = 20_000_000; // 0.02 SOL (60% slippage tolerance)
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`Token A to swap: ${formatTokenAmount(amountIn)} Token A`);
    console.log(`Minimum SOL out: ${minimumAmountOut / 1e9} SOL`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for SwapTokenToNativeSOL (matching Rust program order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },                    // pool_info
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },             // token_mint_info
      { pubkey: POOL_TOKEN_VAULT, isSigner: false, isWritable: true },          // pool_token_vault
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },      // user_info
      { pubkey: userTokenA, isSigner: false, isWritable: true },                // user_token_account
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },     // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
    ];

    // Instruction data (Borsh: SwapTokenToNativeSOL { amount_in, minimum_amount_out })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(13, 0); // SwapTokenToNativeSOL discriminator (index 13 in enum)
    data.writeBigUInt64LE(BigInt(amountIn), 1); // amount_in
    data.writeBigUInt64LE(BigInt(minimumAmountOut), 9); // minimum_amount_out
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add SwapTokenToNativeSOL instruction
    console.log("📝 Adding SwapTokenToNativeSOL instruction...");
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

    console.log(`✅ Swap successful!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Swap:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const nativeSOLBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceAfter / 1e9} SOL (${nativeSOLBalanceAfter} lamports)`);

    // Calculate changes
    const tokenAChange = balanceTokenABefore - balanceTokenAAfter;
    const solChange = nativeSOLBalanceAfter - nativeSOLBalanceBefore;
    
    console.log(`\n📈 Changes:`);
    console.log(`Token A spent: ${formatTokenAmount(tokenAChange)}`);
    console.log(`SOL received: ${solChange / 1e9} SOL`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastReverseSwapSignature: signature,
      lastReverseSwapAmountIn: amountIn,
      lastReverseSwapMinimumAmountOut: minimumAmountOut,
    };

    fs.writeFileSync("pool-a-native-sol-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Pool info updated with reverse swap details");

  } catch (error) {
    console.error("❌ Error swapping token to native SOL:", error);
    throw error;
  }
}

// Run the function
swapTokenToNativeSOL().catch(console.error);