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
 * TypeScript Script: Initialize Pool A-SOL
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPoolASOL() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool A-SOL...");
    
    // Load Token A info from previous steps
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Native SOL mint
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`SOL Mint: ${SOL_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), SOL_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Derive LP mint PDA (matching Rust program logic)
    const [lpMintPDA, lpMintBump] = await PublicKey.findProgramAddress(
      [Buffer.from("mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`LP Mint PDA: ${lpMintPDA.toString()}`);

    // 3. Derive vault PDAs (matching Rust program logic)
    const [vaultA, vaultABump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_A_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultSOL, vaultSOLBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), SOL_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault SOL: ${vaultSOL.toString()}`);

    // 4. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    // For SOL, we use the native SOL account (user's wallet) instead of ATA
    const userSOL = userKeypair.publicKey; // Native SOL account
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User SOL Account: ${userSOL.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const solBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`SOL Native: ${solBalanceBefore / 1e9} SOL`);

    // 5. Pool initialization parameters with 1:1 ratio
    const amountA = 1_000_000_000; // 1 token A
    const amountSOL = 1_000_000_000; // 1 SOL (in lamports)
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token A: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Initial SOL: ${amountSOL / 1e9} SOL`);
    console.log(`Initial Ratio: 1:1`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultA, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultSOL, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userSOL, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ATA Program
    ];

    // 6.7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountSOL), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 6.8. Add InitPool instruction
    console.log("📝 Adding InitPool instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // 7. Send transaction
    console.log("\n📝 Sending pool initialization transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Pool A-SOL initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const solBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`SOL Native: ${solBalanceAfter / 1e9} SOL`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenA: TOKEN_A_MINT.toString(),
      tokenSOL: SOL_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultA: vaultA.toString(),
      vaultSOL: vaultSOL.toString(),
      userTokenA: userTokenA.toString(),
      userSOL: userSOL.toString(),
      userLP: userLP.toString(),
      initialAmountA: amountA,
      initialAmountSOL: amountSOL,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-a-sol-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool A-SOL info saved to pool-a-sol-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool A-SOL:", error);
    throw error;
  }
}

// Run the function
initPoolASOL().catch(console.error);
