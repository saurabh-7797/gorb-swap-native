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
 * TypeScript Script: Initialize Pool R-M
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPoolRM() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool R-M...");
    
    // Load Token R and M info from previous steps
    const tokenRInfo = JSON.parse(fs.readFileSync('token-r-info.json', 'utf-8'));
    const tokenMInfo = JSON.parse(fs.readFileSync('token-m-info.json', 'utf-8'));
    
    const TOKEN_R_MINT = new PublicKey(tokenRInfo.mint);
    const TOKEN_M_MINT = new PublicKey(tokenMInfo.mint);
    
    console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
    console.log(`Token M: ${TOKEN_M_MINT.toString()}`);

    // 1. Derive pool PDA (no sorting - matching Rust program)
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_R_MINT.toBuffer(), TOKEN_M_MINT.toBuffer()],
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
    const [vaultR, vaultRBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_R_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultM, vaultMBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), TOKEN_M_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault R: ${vaultR.toString()}`);
    console.log(`Vault M: ${vaultM.toString()}`);

    // 4. User ATAs
    const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenM = getAssociatedTokenAddressSync(TOKEN_M_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token R ATA: ${userTokenR.toString()}`);
    console.log(`User Token M ATA: ${userTokenM.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenRBefore = await getTokenBalance(userTokenR);
    const balanceTokenMBefore = await getTokenBalance(userTokenM);
    console.log(`Token R: ${formatTokenAmount(balanceTokenRBefore)} (${balanceTokenRBefore} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMBefore)} (${balanceTokenMBefore} raw)`);

    // 5. Pool initialization parameters with 1:1 ratio
    const amountR = 1_000_000_000; // 1 token
    const amountM = 1_000_000_000; // 1 token
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token R: ${formatTokenAmount(amountR)} Token R`);
    console.log(`Initial Token M: ${formatTokenAmount(amountM)} Token M`);
    console.log(`Initial Ratio: 1:1`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.3. Prepare accounts for InitPool (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_M_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultR, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: vaultM, isSigner: false, isWritable: true }, // PDA, not a signer
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // LP mint PDA
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenR, isSigner: false, isWritable: true },
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
    data.writeBigUInt64LE(BigInt(amountR), 1);
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

    console.log(`✅ Pool R-M initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenRAfter = await getTokenBalance(userTokenR);
    const balanceTokenMAfter = await getTokenBalance(userTokenM);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token R: ${formatTokenAmount(balanceTokenRAfter)} (${balanceTokenRAfter} raw)`);
    console.log(`Token M: ${formatTokenAmount(balanceTokenMAfter)} (${balanceTokenMAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenR: TOKEN_R_MINT.toString(),
      tokenM: TOKEN_M_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      vaultR: vaultR.toString(),
      vaultM: vaultM.toString(),
      userTokenR: userTokenR.toString(),
      userTokenM: userTokenM.toString(),
      userLP: userLP.toString(),
      initialAmountR: amountR,
      initialAmountM: amountM,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-rm-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool R-M info saved to pool-rm-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool R-M:", error);
    throw error;
  }
}

// Run the function
initPoolRM().catch(console.error);
