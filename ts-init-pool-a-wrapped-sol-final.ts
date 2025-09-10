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
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  getAccount,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
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
 * TypeScript Script: Initialize Native SOL Pool with Token A
 * This creates a native SOL pool between Token A and Native SOL using the process_init_native_sol_pool function
 */
async function initNativeSOLPoolWithTokenA() {
  try {
    console.log("🚀 TypeScript Script: Initializing Native SOL Pool with Token A...");
    
    // Load Token A info
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    
    // Native SOL mint address on GorbChain
    const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Native SOL: ${NATIVE_SOL_MINT.toString()}`);

    // 1. Derive native SOL pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_pool"), TOKEN_A_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Native SOL Pool PDA: ${poolPDA.toString()}`);

    // 2. Derive LP mint PDA for native SOL pool
    const [lpMintPDA, lpMintBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_lp_mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`LP Mint PDA: ${lpMintPDA.toString()}`);

    // 3. Derive pool token vault PDA (for Token A)
    const [poolTokenVaultPDA, poolTokenVaultBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_vault"), poolPDA.toBuffer(), TOKEN_A_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool Token Vault PDA: ${poolTokenVaultPDA.toString()}`);

    // 4. User ATAs
    const userTokenA = new PublicKey(tokenAInfo.userATA); // Use ATA from JSON file
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 5. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const nativeSOLBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceBefore / 1e9} SOL (${nativeSOLBalanceBefore} lamports)`);

    // 6. Pool initialization parameters with 1:1 ratio
    const amountTokenA = 1_000_000_000; // 1 token A
    const amountSOL = 1_000_000_000; // 1 SOL (in lamports)
    
    console.log(`\n🏊 Native SOL Pool Initialization Parameters:`);
    console.log(`Initial Token A: ${formatTokenAmount(amountTokenA)} Token A`);
    console.log(`Initial SOL: ${amountSOL / 1e9} SOL`);
    console.log(`Initial Ratio: 1:1`);

    // 7. Create transaction
    const transaction = new Transaction();

    // 7.1. Prepare accounts for InitNativeSOLPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },                    // pool_info
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },             // token_mint_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },      // user_info
      { pubkey: userTokenA, isSigner: false, isWritable: true },                // user_token_account
      { pubkey: userLP, isSigner: false, isWritable: true },                    // user_lp_account
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },                 // lp_mint_info
      { pubkey: poolTokenVaultPDA, isSigner: false, isWritable: true },         // pool_token_vault
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },     // token_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },       // rent
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },           // ata_program
    ];

    // 7.2. Instruction data (Borsh: InitNativeSOLPool { amount_sol, amount_token })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(11, 0); // InitNativeSOLPool discriminator (try index 11)
    data.writeBigUInt64LE(BigInt(amountSOL), 1); // amount_sol
    data.writeBigUInt64LE(BigInt(amountTokenA), 9); // amount_token
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 7.3. Add InitNativeSOLPool instruction
    console.log("📝 Adding InitNativeSOLPool instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // 8. Send transaction
    console.log("\n📝 Sending native SOL pool initialization transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Native SOL Pool with Token A initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 9. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const nativeSOLBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceAfter / 1e9} SOL (${nativeSOLBalanceAfter} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 10. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenA: TOKEN_A_MINT.toString(),
      nativeSOL: NATIVE_SOL_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      poolTokenVault: poolTokenVaultPDA.toString(),
      userTokenA: userTokenA.toString(),
      userLP: userLP.toString(),
      initialAmountTokenA: amountTokenA,
      initialAmountSOL: amountSOL,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-a-native-sol-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Native SOL Pool info saved to pool-a-native-sol-info.json");

  } catch (error) {
    console.error("❌ Error initializing native SOL pool with Token A:", error);
    throw error;
  }
}

// Run the function
initNativeSOLPoolWithTokenA().catch(console.error);

