import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("EtGrXaRpEdozMtfd8tbkbrbDN8LqZNba3xWTdT3HtQWq");
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
 * TypeScript Script: Swap Native SOL to Token X
 * This swaps native SOL for Token X using the existing native SOL pool
 */
async function swapNativeSOLToX() {
  try {
    console.log("🚀 TypeScript Script: Swapping Native SOL to Token X...");
    
    // Load pool info from existing file
    const poolInfo = JSON.parse(fs.readFileSync('pool-x-native-sol-info.json', 'utf-8'));
    
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_X_MINT = new PublicKey(poolInfo.tokenB);
    const VAULT_X = new PublicKey(poolInfo.vaultB);
    const USER_TOKEN_X = new PublicKey(poolInfo.userTokenB);

    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token X Mint: ${TOKEN_X_MINT.toString()}`);
    console.log(`Vault X: ${VAULT_X.toString()}`);
    console.log(`User Token X ATA: ${USER_TOKEN_X.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Swap:");
    const balanceTokenXBefore = await getTokenBalance(USER_TOKEN_X);
    const solBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`Native SOL: ${solBalanceBefore / 1e9} SOL (${solBalanceBefore} lamports)`);

    // Swap parameters
    const solAmountIn = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL to swap
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`SOL Amount In: ${solAmountIn / 1e9} SOL`);
    console.log(`Direction: SOL → Token X`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap (matching contract order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true }, // pool_info
      { pubkey: new PublicKey("So11111111111111111111111111111111111111112"), isSigner: false, isWritable: false }, // token_a_info (SOL)
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false }, // token_b_info (Token X)
      { pubkey: POOL_PDA, isSigner: false, isWritable: true }, // vault_a (SOL vault - pool account itself)
      { pubkey: VAULT_X, isSigner: false, isWritable: true }, // vault_b (Token X vault)
      { pubkey: userKeypair.publicKey, isSigner: false, isWritable: true }, // user_in_info (SOL - user's main account)
      { pubkey: USER_TOKEN_X, isSigner: false, isWritable: true }, // user_out_info (Token X)
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true }, // user_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // system_program
    ];

    // Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator (3)
    data.writeBigUInt64LE(BigInt(solAmountIn), 1);
    data.writeUInt8(1, 9); // direction_a_to_b = true (SOL to Token X)

    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding Swap instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending swap transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Swap completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log(`\n📊 Balances AFTER Swap:`);
    const balanceTokenXAfter = await getTokenBalance(USER_TOKEN_X);
    const solBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`Native SOL: ${solBalanceAfter / 1e9} SOL (${solBalanceAfter} lamports)`);

    // Calculate changes
    const tokenXChange = balanceTokenXAfter - balanceTokenXBefore;
    const solChange = solBalanceBefore - solBalanceAfter;
    
    console.log(`\n📈 Swap Results:`);
    console.log(`SOL Used: ${solChange / 1e9} SOL (${solChange} lamports)`);
    console.log(`Token X Received: ${formatTokenAmount(tokenXChange)} (${tokenXChange} raw)`);
    console.log(`Exchange Rate: ${formatTokenAmount(tokenXChange)} Token X per ${solChange / 1e9} SOL`);

    // Create swap info file
    const swapInfo = {
      poolPDA: poolInfo.poolPDA,
      tokenA: poolInfo.tokenA,
      tokenB: poolInfo.tokenB,
      swapDirection: "SOL → Token X",
      amountIn: solAmountIn,
      amountOut: tokenXChange,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      userTokenA: poolInfo.userTokenA,
      userTokenB: poolInfo.userTokenB,
      exchangeRate: `${formatTokenAmount(tokenXChange)} Token X per ${solChange / 1e9} SOL`
    };

    fs.writeFileSync("swap-native-sol-to-x-info.json", JSON.stringify(swapInfo, null, 2));
    console.log("\n💾 Swap info saved to swap-native-sol-to-x-info.json");

  } catch (error) {
    console.error("❌ Error swapping native SOL to Token X:", error);
    throw error;
  }
}

// Run the script
swapNativeSOLToX()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
