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
 * TypeScript Script: Swap Native SOL to Token A
 */
async function swapNativeSOLToToken() {
  try {
    console.log("🔄 Swapping Native SOL to Token A...");
    
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
    const amountIn = 100_000_000; // 0.1 SOL
    const minimumAmountOut = 50_000_000; // 0.05 Token A (50% slippage tolerance)
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`SOL to swap: ${amountIn / 1e9} SOL`);
    console.log(`Minimum Token A out: ${formatTokenAmount(minimumAmountOut)} Token A`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for SwapNativeSOLToToken (matching Rust program order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },                    // pool_info
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },             // token_mint_info
      { pubkey: POOL_TOKEN_VAULT, isSigner: false, isWritable: true },          // pool_token_vault
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },      // user_info
      { pubkey: userTokenA, isSigner: false, isWritable: true },                // user_token_account
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },     // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
    ];

    // Instruction data (Borsh: SwapNativeSOLToToken { amount_in, minimum_amount_out })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(12, 0); // SwapNativeSOLToToken discriminator (index 12 in enum)
    data.writeBigUInt64LE(BigInt(amountIn), 1); // amount_in
    data.writeBigUInt64LE(BigInt(minimumAmountOut), 9); // minimum_amount_out
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add SwapNativeSOLToToken instruction
    console.log("📝 Adding SwapNativeSOLToToken instruction...");
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
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const solChange = nativeSOLBalanceBefore - nativeSOLBalanceAfter;
    
    console.log(`\n📈 Changes:`);
    console.log(`Token A received: ${formatTokenAmount(tokenAChange)}`);
    console.log(`SOL spent: ${solChange / 1e9} SOL`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastSwapSignature: signature,
      lastSwapAmountIn: amountIn,
      lastSwapMinimumAmountOut: minimumAmountOut,
    };

    fs.writeFileSync("pool-a-native-sol-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Pool info updated with swap details");

  } catch (error) {
    console.error("❌ Error swapping native SOL to token:", error);
    throw error;
  }
}

// Run the function
swapNativeSOLToToken().catch(console.error);
