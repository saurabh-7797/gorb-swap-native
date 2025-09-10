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
 * TypeScript Script: Initialize Pool SOL-B
 * Using native SOL mint address
 */
async function initPoolSOLB() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool SOL-B...");
    
    // Load Token B info from previous steps
    const tokenBInfo = JSON.parse(fs.readFileSync('token-b-info.json', 'utf-8'));
    
    const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Native SOL mint
    const TOKEN_B_MINT = new PublicKey(tokenBInfo.mint);
    
    console.log(`SOL Mint: ${SOL_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), SOL_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
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
    const [vaultSOL, vaultSOLBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), SOL_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultB, vaultBBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault SOL: ${vaultSOL.toString()}`);
    console.log(`Vault B: ${vaultB.toString()}`);

    // 4. User accounts
    const userSOL = userKeypair.publicKey; // Native SOL account
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User SOL Account: ${userSOL.toString()}`);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const solBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`SOL Native: ${solBalanceBefore / 1e9} SOL`);

    // 5. Pool initialization parameters with 1:1 ratio
    const amountSOL = 1_000_000_000; // 1 SOL (in lamports)
    const amountB = 1_000_000_000; // 1 token B
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial SOL: ${amountSOL / 1e9} SOL`);
    console.log(`Initial Token B: ${formatTokenAmount(amountB)} Token B`);
    console.log(`Initial Ratio: 1:1`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultSOL, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultB, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userSOL, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ATA Program
    ];

    // 6.7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountSOL), 1);
    data.writeBigUInt64LE(BigInt(amountB), 9);
    
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

    console.log(`✅ Pool SOL-B initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const solBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`SOL Native: ${solBalanceAfter / 1e9} SOL`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenSOL: SOL_MINT.toString(),
      tokenB: TOKEN_B_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultSOL: vaultSOL.toString(),
      vaultB: vaultB.toString(),
      userSOL: userSOL.toString(),
      userTokenB: userTokenB.toString(),
      userLP: userLP.toString(),
      initialAmountSOL: amountSOL,
      initialAmountB: amountB,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-sol-b-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool SOL-B info saved to pool-sol-b-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool SOL-B:", error);
    throw error;
  }
}

// Run the function
initPoolSOLB().catch(console.error);
