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
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
 * TypeScript Script 1: Initialize Pool
 * Based on IDL: InitPool (discriminant: 0)
 * Args: amountA (u64), amountB (u64)
 */
async function initPool() {
  try {
    console.log("🚀 TypeScript Script 1: Initializing Pool...");
    
    // Load Token A and B info from previous steps
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const tokenBInfo = JSON.parse(fs.readFileSync('token-b-info.json', 'utf-8'));
    
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    const TOKEN_B_MINT = new PublicKey(tokenBInfo.mint);
    const LP_MINT = Keypair.generate();
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.publicKey.toString()}`);

    // 1. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Create vault accounts as regular accounts (not PDAs)
    const vaultA = Keypair.generate();
    const vaultB = Keypair.generate();
    console.log(`Vault A: ${vaultA.publicKey.toString()}`);
    console.log(`Vault B: ${vaultB.publicKey.toString()}`);

    // 3. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT.publicKey, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);

    // 5. Pool initialization parameters
    const amountA = 1_000_000_000; // 1 token
    const amountB = 1_000_000_000; // 1 token
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token A: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Initial Token B: ${formatTokenAmount(amountB)} Token B`);

    // 6. Create transaction
    const transaction = new Transaction();

    // 6.1. Create LP mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: LP_MINT.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(82),
        space: 82,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 6.2. Initialize LP mint
    transaction.add(
      createInitializeMintInstruction(
        LP_MINT.publicKey,
        9, // decimals
        poolPDA, // mint authority
        null // freeze authority
      )
    );

    // 6.3. Create vault A account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: vaultA.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 6.4. Create vault B account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: vaultB.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 6.5. Create user LP ATA if it doesn't exist
    try {
      await getAccount(connection, userLP, "confirmed", SPL_TOKEN_PROGRAM_ID);
    } catch (error) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userKeypair.publicKey, // payer
          userLP, // ata
          userKeypair.publicKey, // owner
          LP_MINT.publicKey // mint
        )
      );
    }

    // 6.6. Initialize pool instruction
    const initPoolInstruction = {
      programId: AMM_PROGRAM_ID,
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
        { pubkey: LP_MINT.publicKey, isSigner: true, isWritable: true },
        { pubkey: vaultA.publicKey, isSigner: true, isWritable: true },
        { pubkey: vaultB.publicKey, isSigner: true, isWritable: true },
        { pubkey: userTokenA, isSigner: false, isWritable: true },
        { pubkey: userTokenB, isSigner: false, isWritable: true },
        { pubkey: userLP, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([0]), // InitPool discriminator
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountA)]).buffer)),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountB)]).buffer)),
      ]),
    };

    transaction.add(initPoolInstruction);

    // 7. Send transaction
    console.log("\n📝 Sending pool initialization transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
      LP_MINT,
      vaultA,
      vaultB,
    ]);

    console.log(`✅ Pool initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenA: TOKEN_A_MINT.toString(),
      tokenB: TOKEN_B_MINT.toString(),
      lpMint: LP_MINT.publicKey.toString(),
      vaultA: vaultA.publicKey.toString(),
      vaultB: vaultB.publicKey.toString(),
      userTokenA: userTokenA.toString(),
      userTokenB: userTokenB.toString(),
      userLP: userLP.toString(),
      initialAmountA: amountA,
      initialAmountB: amountB,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-ab-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool info saved to pool-ab-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool:", error);
    throw error;
  }
}

// Run the function
initPool().catch(console.error);
