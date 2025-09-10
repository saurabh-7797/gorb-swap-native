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
  createMintToInstruction,
  getAccount,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
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
 * TypeScript Script: Create Wrapped SOL Token
 * This creates a regular SPL token that represents SOL
 */
async function createWrappedSOL() {
  try {
    console.log("🚀 Creating Wrapped SOL Token...");
    
    const wrappedSOLKeypair = Keypair.generate();
    console.log(`Wrapped SOL Mint: ${wrappedSOLKeypair.publicKey.toString()}`);
    
    const userWrappedSOL = getAssociatedTokenAddressSync(
      wrappedSOLKeypair.publicKey,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    console.log(`User Wrapped SOL ATA: ${userWrappedSOL.toString()}`);

    // 1. Create mint account
    console.log("\n📝 Creating Wrapped SOL mint account...");
    const mintLamports = await getMinimumBalanceForRentExemptMint(connection);
    
    const transaction = new Transaction();
    
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: wrappedSOLKeypair.publicKey,
        lamports: mintLamports,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 2. Initialize mint
    console.log("📝 Initializing Wrapped SOL mint...");
    transaction.add(
      createInitializeMintInstruction(
        wrappedSOLKeypair.publicKey,
        9, // decimals (same as SOL)
        userKeypair.publicKey, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 3. Create user ATA
    console.log("📝 Creating user Wrapped SOL ATA...");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey, // payer
        userWrappedSOL, // ata
        userKeypair.publicKey, // owner
        wrappedSOLKeypair.publicKey, // mint
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // 4. Send transaction
    console.log("📝 Minting large amount of Wrapped SOL to user...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair, wrappedSOLKeypair]);

    console.log(`✅ Wrapped SOL created successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Mint tokens to user
    console.log("📝 Minting tokens to user...");
    const mintAmount = 1_000_000_000_000; // 1 million tokens
    const mintTransaction = new Transaction();
    mintTransaction.add(
      createMintToInstruction(
        wrappedSOLKeypair.publicKey, // mint
        userWrappedSOL, // destination
        userKeypair.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        SPL_TOKEN_PROGRAM_ID
      )
    );
    
    await sendAndConfirmTransaction(connection, mintTransaction, [userKeypair]);
    
    const balance = await getTokenBalance(userWrappedSOL);
    console.log(`\n📊 Wrapped SOL Balance: ${formatTokenAmount(balance)} Wrapped SOL (${balance} raw)`);

    // 6. Save token info
    const tokenInfo = {
      mint: wrappedSOLKeypair.publicKey.toString(),
      userATA: userWrappedSOL.toString(),
      supply: mintAmount,
      decimals: 9,
      transactionSignature: signature,
      description: "Wrapped SOL - represents SOL as SPL token"
    };

    fs.writeFileSync("token-wrapped-sol-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log("\n💾 Wrapped SOL info saved to token-wrapped-sol-info.json");

  } catch (error) {
    console.error("❌ Error creating Wrapped SOL:", error);
    throw error;
  }
}

// Run the function
createWrappedSOL().catch(console.error);
