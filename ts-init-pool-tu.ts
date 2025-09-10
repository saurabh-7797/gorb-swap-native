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
 * TypeScript Script: Initialize Pool T-U
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPoolTU() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool T-U...");
    
    // Load Token T and U info from previous steps
    const tokenTInfo = JSON.parse(fs.readFileSync('token-t-info.json', 'utf-8'));
    const tokenUInfo = JSON.parse(fs.readFileSync('token-u-info.json', 'utf-8'));
    
    const TOKEN_T_MINT = new PublicKey(tokenTInfo.mint);
    const TOKEN_U_MINT = new PublicKey(tokenUInfo.mint);
    
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);
    console.log(`Token U: ${TOKEN_U_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_T_MINT.toBuffer(), TOKEN_U_MINT.toBuffer()],
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
    const [vaultT, vaultTBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_T_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultU, vaultUBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_U_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault T: ${vaultT.toString()}`);
    console.log(`Vault U: ${vaultU.toString()}`);

    // 4. User ATAs
    const userTokenT = getAssociatedTokenAddressSync(TOKEN_T_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenU = getAssociatedTokenAddressSync(TOKEN_U_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token T ATA: ${userTokenT.toString()}`);
    console.log(`User Token U ATA: ${userTokenU.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceTokenUBefore = await getTokenBalance(userTokenU);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUBefore)} (${balanceTokenUBefore} raw)`);

    // 5. Pool initialization parameters with different ratio (3:5)
    const amountT = 3_000_000_000; // 3 tokens
    const amountU = 5_000_000_000; // 5 tokens
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token T: ${formatTokenAmount(amountT)} Token T`);
    console.log(`Initial Token U: ${formatTokenAmount(amountU)} Token U`);
    console.log(`Initial Ratio: 3:5`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.1. Pool, vault, and LP mint accounts are created as PDAs by the program itself
    // 6.2. User LP ATA will be created by the program

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_U_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultU, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userTokenU, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ATA Program
    ];

    // 6.7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountT), 1);
    data.writeBigUInt64LE(BigInt(amountU), 9);
    
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

    console.log(`✅ Pool T-U initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceTokenUAfter = await getTokenBalance(userTokenU);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`Token U: ${formatTokenAmount(balanceTokenUAfter)} (${balanceTokenUAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenT: TOKEN_T_MINT.toString(),
      tokenU: TOKEN_U_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultT: vaultT.toString(),
      vaultU: vaultU.toString(),
      userTokenT: userTokenT.toString(),
      userTokenU: userTokenU.toString(),
      userLP: userLP.toString(),
      initialAmountT: amountT,
      initialAmountU: amountU,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-tu-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool T-U info saved to pool-tu-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool T-U:", error);
    throw error;
  }
}

// Run the function
initPoolTU().catch(console.error);