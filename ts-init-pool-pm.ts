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
 * TypeScript Script: Initialize Pool P-M
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPoolPM() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool P-M...");
    
    // Load Token P and M info from previous steps
    const tokenPInfo = JSON.parse(fs.readFileSync('token-p-info.json', 'utf-8'));
    const tokenMInfo = JSON.parse(fs.readFileSync('token-m-info.json', 'utf-8'));
    
    const TOKEN_P_MINT = new PublicKey(tokenPInfo.mint);
    const TOKEN_M_MINT = new PublicKey(tokenMInfo.mint);
    
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token M: ${TOKEN_M_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_P_MINT.toBuffer(), TOKEN_M_MINT.toBuffer()],
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
    const [vaultP, vaultPBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_P_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultM, vaultMBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_M_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault P: ${vaultP.toString()}`);
    console.log(`Vault M: ${vaultM.toString()}`);

    // 4. User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenM = getAssociatedTokenAddressSync(TOKEN_M_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token M ATA: ${userTokenM.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenMBefore = await getTokenBalance(userTokenM);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMBefore)} (${balanceTokenMBefore} raw)`);

    // 5. Pool initialization parameters with 1:2 ratio
    const amountP = 1_000_000_000; // 1 token
    const amountM = 2_000_000_000; // 2 tokens
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token P: ${formatTokenAmount(amountP)} Token P`);
    console.log(`Initial Token M: ${formatTokenAmount(amountM)} Token M`);
    console.log(`Initial Ratio: 1:2`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_M_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultP, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultM, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userTokenM, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ATA Program
    ];

    // 6.7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountP), 1);
    data.writeBigUInt64LE(BigInt(amountM), 9);
    
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

    console.log(`✅ Pool P-M initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenMAfter = await getTokenBalance(userTokenM);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMAfter)} (${balanceTokenMAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenP: TOKEN_P_MINT.toString(),
      tokenM: TOKEN_M_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultP: vaultP.toString(),
      vaultM: vaultM.toString(),
      userTokenP: userTokenP.toString(),
      userTokenM: userTokenM.toString(),
      userLP: userLP.toString(),
      initialAmountP: amountP,
      initialAmountM: amountM,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-pm-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool P-M info saved to pool-pm-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool P-M:", error);
    throw error;
  }
}

// Run the function
initPoolPM().catch(console.error);
