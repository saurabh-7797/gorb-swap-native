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
 * TypeScript Script: Initialize Pool X-Native SOL
 * This creates a pool between Token X and native SOL using the correct account setup
 */
async function initPoolXNativeSOL() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool X-Native SOL...");
    
    // Load Token X info from scripts folder
    const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
    const TOKEN_X_MINT = new PublicKey(tokenXInfo.mint);
    
    console.log(`Token X: ${TOKEN_X_MINT.toString()}`);
    console.log(`Native SOL: So11111111111111111111111111111111111111112`);

    // Native SOL mint address
    const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

    // 1. Derive pool PDA for native SOL pool (matching Rust program logic)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_pool"), TOKEN_X_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Derive LP mint PDA (matching Rust program logic)
    const [lpMintPDA, lpMintBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_lp_mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`LP Mint PDA: ${lpMintPDA.toString()}`);

    // 3. Derive vault PDAs (matching Rust program logic)
    // Note: For native SOL pools, only the token vault is created as PDA
    // SOL is stored directly in the pool account
    const [vaultX, vaultXBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_vault"), poolPDA.toBuffer(), TOKEN_X_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    // SOL vault is the pool account itself, not a separate PDA
    const vaultSOL = poolPDA;
    console.log(`Vault SOL: ${vaultSOL.toString()}`);
    console.log(`Vault X: ${vaultX.toString()}`);

    // 4. User ATAs
    const userTokenX = new PublicKey(tokenXInfo.userATA); // Use ATA from JSON file
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token X ATA: ${userTokenX.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenXBefore = await getTokenBalance(userTokenX);
    const solBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`Native SOL: ${solBalanceBefore / 1e9} SOL (${solBalanceBefore} lamports)`);

    // 5. Pool initialization parameters
    const amountSOL = 1_000_000_000; // 1 SOL (in lamports)
    const amountToken = 2_000_000_000; // 2 tokens X
    
    console.log(`\n🏊 Native SOL Pool Initialization Parameters:`);
    console.log(`Initial SOL: ${amountSOL / 1e9} SOL`);
    console.log(`Initial Token X: ${formatTokenAmount(amountToken)} Token X`);
    console.log(`Initial Ratio: 1:2`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.1. Pool, vault, and LP mint accounts are created as PDAs by the program itself
    // 6.2. User LP ATA will be created by the program

    // 6.5. Prepare accounts for InitPool (matching contract order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true }, // pool_info
      { pubkey: NATIVE_SOL_MINT, isSigner: false, isWritable: false }, // token_a_info (SOL)
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false }, // token_b_info (Token X)
      { pubkey: vaultSOL, isSigner: false, isWritable: true }, // vault_a (SOL vault - pool account itself)
      { pubkey: vaultX, isSigner: false, isWritable: true }, // vault_b (Token X vault)
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // lp_mint_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true }, // user_info (needs to be writable for SOL transfer)
      { pubkey: userKeypair.publicKey, isSigner: false, isWritable: true }, // user_token_a_info (SOL - user's main account)
      { pubkey: userTokenX, isSigner: false, isWritable: true }, // user_token_b_info (Token X)
      { pubkey: userLP, isSigner: false, isWritable: true }, // user_lp_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ata_program
    ];

    // 6.6. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator (0)
    data.writeBigUInt64LE(BigInt(amountSOL), 1);
    data.writeBigUInt64LE(BigInt(amountToken), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 6.7. Add InitPool instruction
    console.log("📝 Adding InitPool instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // 7. Send transaction
    console.log("\n📝 Sending native SOL pool initialization transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Pool X-SOL initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenXAfter = await getTokenBalance(userTokenX);
    const solBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`Native SOL: ${solBalanceAfter / 1e9} SOL (${solBalanceAfter} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenA: NATIVE_SOL_MINT.toString(),
      tokenB: TOKEN_X_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultA: vaultSOL.toString(),
      vaultB: vaultX.toString(),
      userTokenA: userKeypair.publicKey.toString(), // SOL account
      userTokenB: userTokenX.toString(), // Token X ATA
      userLP: userLP.toString(),
      initialAmountA: amountSOL,
      initialAmountB: amountToken,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-x-native-sol-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool X-Native SOL info saved to pool-x-native-sol-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool X-Native SOL:", error);
    throw error;
  }
}

// Run the function
initPoolXNativeSOL().catch(console.error);
