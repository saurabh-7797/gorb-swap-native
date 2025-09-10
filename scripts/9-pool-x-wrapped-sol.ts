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
 * TypeScript Script: Initialize Pool X-Wrapped SOL
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPoolXWrappedSOL() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool X-Wrapped SOL...");
    
    // Load Token X and Wrapped SOL info from scripts folder
    const tokenXInfo = JSON.parse(fs.readFileSync('scripts/token-x-info.json', 'utf-8'));
    const wrappedSOLInfo = JSON.parse(fs.readFileSync('scripts/custom-wrapped-sol-info.json', 'utf-8'));
    
    const TOKEN_X_MINT = new PublicKey(tokenXInfo.mint);
    const WRAPPED_SOL_MINT = new PublicKey(wrappedSOLInfo.mint);
    
    console.log(`Token X: ${TOKEN_X_MINT.toString()}`);
    console.log(`Wrapped SOL: ${WRAPPED_SOL_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_X_MINT.toBuffer(), WRAPPED_SOL_MINT.toBuffer()],
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
    const [vaultX, vaultXBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_X_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultWrappedSOL, vaultWrappedSOLBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), WRAPPED_SOL_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault X: ${vaultX.toString()}`);
    console.log(`Vault Wrapped SOL: ${vaultWrappedSOL.toString()}`);

    // 4. User ATAs
    const userTokenX = getAssociatedTokenAddressSync(TOKEN_X_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userWrappedSOL = getAssociatedTokenAddressSync(WRAPPED_SOL_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token X ATA: ${userTokenX.toString()}`);
    console.log(`User Wrapped SOL ATA: ${userWrappedSOL.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenXBefore = await getTokenBalance(userTokenX);
    const balanceWrappedSOLBefore = await getTokenBalance(userWrappedSOL);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(balanceWrappedSOLBefore)} (${balanceWrappedSOLBefore} raw)`);

    // 5. Pool initialization parameters with different ratio (2:1)
    const amountX = 2_000_000_000; // 2 tokens
    const amountWrappedSOL = 1_000_000_000; // 1 wrapped SOL
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token X: ${formatTokenAmount(amountX)} Token X`);
    console.log(`Initial Wrapped SOL: ${formatTokenAmount(amountWrappedSOL)} Wrapped SOL`);
    console.log(`Initial Ratio: 2:1`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.1. Pool, vault, and LP mint accounts are created as PDAs by the program itself
    // 6.2. User LP ATA will be created by the program

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false },
      { pubkey: WRAPPED_SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultX, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultWrappedSOL, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenX, isSigner: false, isWritable: true },
      { pubkey: userWrappedSOL, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ATA Program
    ];

    // 6.7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountX), 1);
    data.writeBigUInt64LE(BigInt(amountWrappedSOL), 9);
    
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

    console.log(`✅ Pool X-Wrapped SOL initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenXAfter = await getTokenBalance(userTokenX);
    const balanceWrappedSOLAfter = await getTokenBalance(userWrappedSOL);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(balanceWrappedSOLAfter)} (${balanceWrappedSOLAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenX: TOKEN_X_MINT.toString(),
      wrappedSOL: WRAPPED_SOL_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultX: vaultX.toString(),
      vaultWrappedSOL: vaultWrappedSOL.toString(),
      userTokenX: userTokenX.toString(),
      userWrappedSOL: userWrappedSOL.toString(),
      userLP: userLP.toString(),
      initialAmountX: amountX,
      initialAmountWrappedSOL: amountWrappedSOL,
      transactionSignature: signature,
    };

    fs.writeFileSync("scripts/pool-x-wrapped-sol-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool X-Wrapped SOL info saved to scripts/pool-x-wrapped-sol-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool X-Wrapped SOL:", error);
    throw error;
  }
}

// Run the function
initPoolXWrappedSOL().catch(console.error);
