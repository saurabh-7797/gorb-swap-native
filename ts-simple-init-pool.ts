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
 * TypeScript Script: Initialize Pool with existing tokens
 * Using Token P and Q from previous scripts
 */
async function initPoolWithExistingTokens() {
  try {
    console.log("🚀 TypeScript Script: Initializing Pool with existing tokens...");
    
    // Use existing Token P and Q
    const TOKEN_P_MINT = new PublicKey("2aFDtPPqgioYe4kCHSSL3kPQh5vDCNB8RYUNcD6QXuGu");
    const TOKEN_Q_MINT = new PublicKey("3RMVAGmP73vWUaV3bj9QNCfLUZWtnuLfQwGgfKhGBBua");
    const LP_MINT = Keypair.generate();
    
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.publicKey.toString()}`);

    // 1. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_P_MINT.toBuffer(), TOKEN_Q_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Create vault accounts as regular accounts (not PDAs)
    const vaultP = Keypair.generate();
    const vaultQ = Keypair.generate();
    console.log(`Vault P: ${vaultP.publicKey.toString()}`);
    console.log(`Vault Q: ${vaultQ.publicKey.toString()}`);

    // 3. User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT.publicKey, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);

    // 5. Pool initialization parameters
    const amountP = 1_000_000_000; // 1 token
    const amountQ = 1_000_000_000; // 1 token
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token P: ${formatTokenAmount(amountP)} Token P`);
    console.log(`Initial Token Q: ${formatTokenAmount(amountQ)} Token Q`);

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

    // 6.3. Create vault P account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: vaultP.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 6.4. Create vault Q account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: vaultQ.publicKey,
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
        { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
        { pubkey: LP_MINT.publicKey, isSigner: true, isWritable: true },
        { pubkey: vaultP.publicKey, isSigner: true, isWritable: true },
        { pubkey: vaultQ.publicKey, isSigner: true, isWritable: true },
        { pubkey: userTokenP, isSigner: false, isWritable: true },
        { pubkey: userTokenQ, isSigner: false, isWritable: true },
        { pubkey: userLP, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([0]), // InitPool discriminator
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountP)]).buffer)),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountQ)]).buffer)),
      ]),
    };

    transaction.add(initPoolInstruction);

    // 7. Send transaction
    console.log("\n📝 Sending pool initialization transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
      LP_MINT,
      vaultP,
      vaultQ,
    ]);

    console.log(`✅ Pool initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Save pool info
    const poolInfo = {
      poolPDA: poolPDA.toString(),
      poolBump,
      tokenP: TOKEN_P_MINT.toString(),
      tokenQ: TOKEN_Q_MINT.toString(),
      lpMint: LP_MINT.publicKey.toString(),
      vaultP: vaultP.publicKey.toString(),
      vaultQ: vaultQ.publicKey.toString(),
      userTokenP: userTokenP.toString(),
      userTokenQ: userTokenQ.toString(),
      userLP: userLP.toString(),
      initialAmountP: amountP,
      initialAmountQ: amountQ,
      transactionSignature: signature,
    };

    fs.writeFileSync("pool-pq-new-info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool info saved to pool-pq-new-info.json");

  } catch (error) {
    console.error("❌ Error initializing pool:", error);
    throw error;
  }
}

// Run the function
initPoolWithExistingTokens().catch(console.error);
