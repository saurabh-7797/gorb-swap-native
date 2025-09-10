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
  createInitializeAccount3Instruction,
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
 * TypeScript Script: Initialize Pool S-V
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPoolSV() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool S-V...");
    
    // Load Token S and V info from previous steps
    const tokenSInfo = JSON.parse(fs.readFileSync('token-s-info.json', 'utf-8'));
    const tokenVInfo = JSON.parse(fs.readFileSync('token-v-info.json', 'utf-8'));
    
    const TOKEN_S_MINT = new PublicKey(tokenSInfo.mint);
    const TOKEN_V_MINT = new PublicKey(tokenVInfo.mint);
    
    console.log(`Token S: ${TOKEN_S_MINT.toString()}`);
    console.log(`Token V: ${TOKEN_V_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_S_MINT.toBuffer(), TOKEN_V_MINT.toBuffer()],
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
    const [vaultS, vaultSBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_S_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultV, vaultVBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_V_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault S: ${vaultS.toString()}`);
    console.log(`Vault V: ${vaultV.toString()}`);

    // 4. User ATAs
    const userTokenS = getAssociatedTokenAddressSync(TOKEN_S_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenV = getAssociatedTokenAddressSync(TOKEN_V_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token S ATA: ${userTokenS.toString()}`);
    console.log(`User Token V ATA: ${userTokenV.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenSBefore = await getTokenBalance(userTokenS);
    const balanceTokenVBefore = await getTokenBalance(userTokenV);
    console.log(`Token S: ${formatTokenAmount(balanceTokenSBefore)} (${balanceTokenSBefore} raw)`);
    console.log(`Token V: ${formatTokenAmount(balanceTokenVBefore)} (${balanceTokenVBefore} raw)`);

    // 5. Pool initialization parameters with different ratio (1:2)
    const amountS = 1_000_000_000; // 1 token
    const amountV = 2_000_000_000; // 2 tokens
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token S: ${formatTokenAmount(amountS)} Token S`);
    console.log(`Initial Token V: ${formatTokenAmount(amountV)} Token V`);
    console.log(`Initial Ratio: 1:2`);

    // 6. Create transaction
    const transaction = new Transaction();

    // Note: LP mint and vault accounts are created as PDAs by the program itself
    // The program will also handle creating the user LP ATA

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_S_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_V_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultS, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultV, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenS, isSigner: false, isWritable: true },
      { pubkey: userTokenV, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ATA Program
    ];

    // 6.7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountS), 1);
    data.writeBigUInt64LE(BigInt(amountV), 9);
    
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

    console.log(`✅ Pool S-V initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenSAfter = await getTokenBalance(userTokenS);
    const balanceTokenVAfter = await getTokenBalance(userTokenV);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSAfter)} (${balanceTokenSAfter} raw)`);
    console.log(`Token V: ${formatTokenAmount(balanceTokenVAfter)} (${balanceTokenVAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenS: TOKEN_S_MINT.toString(),
      tokenV: TOKEN_V_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultS: vaultS.toString(),
      vaultV: vaultV.toString(),
      userTokenS: userTokenS.toString(),
      userTokenV: userTokenV.toString(),
      userLP: userLP.toString(),
      initialAmountS: amountS,
      initialAmountV: amountV,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-sv-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool S-V info saved to pool-sv-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool S-V:", error);
    throw error;
  }
}

// Run the function
initPoolSV().catch(console.error);
