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
 * Create Native SOL Pool
 * This creates a pool between Token A and native SOL
 */
async function createNativeSOLPool() {
  try {
    console.log("🚀 Creating Native SOL Pool...");
    
    // Load Token A info
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);

    // 1. Derive native SOL pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_pool"), TOKEN_A_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Native SOL Pool PDA: ${poolPDA.toString()}`);

    // 2. Derive LP mint PDA
    const [lpMintPDA, lpMintBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_lp_mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`LP Mint PDA: ${lpMintPDA.toString()}`);

    // 3. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before
    console.log("\n📊 Balances BEFORE:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const solBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Native SOL: ${solBalanceBefore / 1e9} SOL (${solBalanceBefore} lamports)`);

    // 5. Pool parameters
    const amountSOL = 1_000_000_000; // 1 SOL
    const amountToken = 1_000_000_000; // 1 Token A
    
    console.log(`\n🏊 Pool Parameters:`);
    console.log(`SOL: ${amountSOL / 1e9} SOL`);
    console.log(`Token A: ${formatTokenAmount(amountToken)} Token A`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.1. Create pool account
    const poolRent = await connection.getMinimumBalanceForRentExemption(57); // NativeSOLPool::LEN
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: poolPDA,
        lamports: poolRent + amountSOL, // Rent + initial SOL
        space: 57, // NativeSOLPool::LEN
        programId: AMM_PROGRAM_ID,
      })
    );

    // 6.2. Create LP mint account
    const mintRent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: lpMintPDA,
        lamports: mintRent,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 6.3. Initialize LP mint
    transaction.add(
      createInitializeMintInstruction(
        lpMintPDA,
        9, // decimals
        AMM_PROGRAM_ID, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 6.4. Create user LP ATA
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey, // payer
        userLP, // ata
        userKeypair.publicKey, // owner
        lpMintPDA, // mint
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // 6.5. Call InitNativeSOLPool instruction
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(11, 0); // InitNativeSOLPool discriminator
    data.writeBigUInt64LE(BigInt(amountSOL), 1);
    data.writeBigUInt64LE(BigInt(amountToken), 9);

    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // 7. Send transaction
    console.log("\n📝 Sending transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Native SOL Pool created successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after
    console.log("\n📊 Balances AFTER:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const solBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Native SOL: ${solBalanceAfter / 1e9} SOL (${solBalanceAfter} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenMint: TOKEN_A_MINT.toString(),
      lpMint: lpMintPDA.toString(),
      lpMintBump,
      userTokenA: userTokenA.toString(),
      userLP: userLP.toString(),
      initialAmountSOL: amountSOL,
      initialAmountToken: amountToken,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-a-native-sol-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool info saved to pool-a-native-sol-info.json");

  } catch (error) {
    console.error("❌ Error creating native SOL pool:", error);
    throw error;
  }
}

// Run the function
createNativeSOLPool().catch(console.error);

