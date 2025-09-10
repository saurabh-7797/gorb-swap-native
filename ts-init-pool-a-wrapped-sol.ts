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
 * TypeScript Script: Initialize Pool A-WrappedSOL
 * Using wrapped SOL token that works with the existing program
 */
async function initPoolAWrappedSOL() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool A-WrappedSOL...");
    
    // Load Token A and Wrapped SOL info from previous steps
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const wrappedSOLInfo = JSON.parse(fs.readFileSync('token-wrapped-sol-info.json', 'utf-8'));
    
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    const WRAPPED_SOL_MINT = new PublicKey(wrappedSOLInfo.mint);
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Wrapped SOL: ${WRAPPED_SOL_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), WRAPPED_SOL_MINT.toBuffer()],
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
    const [vaultWrappedSOL, vaultWrappedSOLBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), WRAPPED_SOL_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault Wrapped SOL: ${vaultWrappedSOL.toString()}`);

    // 4. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userWrappedSOL = getAssociatedTokenAddressSync(WRAPPED_SOL_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Wrapped SOL ATA: ${userWrappedSOL.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceWrappedSOLBefore = await getTokenBalance(userWrappedSOL);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(balanceWrappedSOLBefore)} (${balanceWrappedSOLBefore} raw)`);

    // 5. Pool initialization parameters with 1:1 ratio
    const amountA = 1_000_000_000; // 1 token A
    const amountWrappedSOL = 1_000_000_000; // 1 wrapped SOL
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token A: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Initial Wrapped SOL: ${formatTokenAmount(amountWrappedSOL)} Wrapped SOL`);
    console.log(`Initial Ratio: 1:1`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: WRAPPED_SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultA, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultWrappedSOL, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
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
    data.writeBigUInt64LE(BigInt(amountA), 1);
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

    console.log(`✅ Pool A-WrappedSOL initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceWrappedSOLAfter = await getTokenBalance(userWrappedSOL);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(balanceWrappedSOLAfter)} (${balanceWrappedSOLAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenA: TOKEN_A_MINT.toString(),
      tokenWrappedSOL: WRAPPED_SOL_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultA: vaultA.toString(),
      vaultWrappedSOL: vaultWrappedSOL.toString(),
      userTokenA: userTokenA.toString(),
      userWrappedSOL: userWrappedSOL.toString(),
      userLP: userLP.toString(),
      initialAmountA: amountA,
      initialAmountWrappedSOL: amountWrappedSOL,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-a-wrapped-sol-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool A-WrappedSOL info saved to pool-a-wrapped-sol-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool A-WrappedSOL:", error);
    throw error;
  }
}

// Run the function
initPoolAWrappedSOL().catch(console.error);
