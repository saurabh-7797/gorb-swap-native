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
 * TypeScript Script: Create Token Z
 */
async function createTokenZ() {
  try {
    console.log("🚀 Creating Token Z...");
    
    const tokenZKeypair = Keypair.generate();
    console.log(`Token Z Mint: ${tokenZKeypair.publicKey.toString()}`);
    
    const userTokenZ = getAssociatedTokenAddressSync(
      tokenZKeypair.publicKey,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    console.log(`User Token Z ATA: ${userTokenZ.toString()}`);

    // 1. Create mint account
    console.log("\n📝 Creating Token Z mint account...");
    const mintLamports = await getMinimumBalanceForRentExemptMint(connection);
    
    const transaction = new Transaction();
    
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: tokenZKeypair.publicKey,
        lamports: mintLamports,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 2. Initialize mint
    console.log("📝 Initializing Token Z mint...");
    transaction.add(
      createInitializeMintInstruction(
        tokenZKeypair.publicKey,
        9, // decimals
        userKeypair.publicKey, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 3. Create user ATA
    console.log("📝 Creating user Token Z ATA...");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey, // payer
        userTokenZ, // ata
        userKeypair.publicKey, // owner
        tokenZKeypair.publicKey, // mint
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // 4. Send transaction
    console.log("📝 Minting large amount of Token Z to user...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair, tokenZKeypair]);

    console.log(`✅ Token Z created successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Mint tokens to user
    console.log("📝 Minting tokens to user...");
    const mintAmount = 4_000_000_000_000; // 4 billion tokens
    const mintTransaction = new Transaction();
    mintTransaction.add(
      createMintToInstruction(
        tokenZKeypair.publicKey, // mint
        userTokenZ, // destination
        userKeypair.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        SPL_TOKEN_PROGRAM_ID
      )
    );
    
    await sendAndConfirmTransaction(connection, mintTransaction, [userKeypair]);
    
    const balance = await getTokenBalance(userTokenZ);
    console.log(`\n📊 Token Z Balance: ${formatTokenAmount(balance)} Token Z (${balance} raw)`);

    // 6. Save token info
    const tokenInfo = {
      mint: tokenZKeypair.publicKey.toString(),
      userATA: userTokenZ.toString(),
      supply: mintAmount,
      decimals: 9,
      transactionSignature: signature,
    };

    fs.writeFileSync("token-z-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log("\n💾 Token Z info saved to token-z-info.json");

  } catch (error) {
    console.error("❌ Error creating Token Z:", error);
    throw error;
  }
}

// Run the function
createTokenZ().catch(console.error);
