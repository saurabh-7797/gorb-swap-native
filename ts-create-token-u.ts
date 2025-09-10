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
 * TypeScript Script: Create Token U
 */
async function createTokenU() {
  try {
    console.log("🚀 Creating Token U...");
    
    const tokenUKeypair = Keypair.generate();
    console.log(`Token U Mint: ${tokenUKeypair.publicKey.toString()}`);
    
    const userTokenU = getAssociatedTokenAddressSync(
      tokenUKeypair.publicKey,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    console.log(`User Token U ATA: ${userTokenU.toString()}`);

    // 1. Create mint account
    console.log("\n📝 Creating Token U mint account...");
    const mintLamports = await getMinimumBalanceForRentExemptMint(connection);
    
    const transaction = new Transaction();
    
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: tokenUKeypair.publicKey,
        lamports: mintLamports,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 2. Initialize mint
    console.log("📝 Initializing Token U mint...");
    transaction.add(
      createInitializeMintInstruction(
        tokenUKeypair.publicKey,
        9, // decimals
        userKeypair.publicKey, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 3. Create user ATA
    console.log("📝 Creating user Token U ATA...");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey, // payer
        userTokenU, // ata
        userKeypair.publicKey, // owner
        tokenUKeypair.publicKey, // mint
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // 4. Send transaction
    console.log("📝 Minting large amount of Token U to user...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair, tokenUKeypair]);

    console.log(`✅ Token U created successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Mint tokens to user
    console.log("📝 Minting tokens to user...");
    const mintAmount = 2_000_000_000_000; // 2 million tokens
    const mintTransaction = new Transaction();
    mintTransaction.add(
      createMintToInstruction(
        tokenUKeypair.publicKey, // mint
        userTokenU, // destination
        userKeypair.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        SPL_TOKEN_PROGRAM_ID
      )
    );
    
    await sendAndConfirmTransaction(connection, mintTransaction, [userKeypair]);
    
    const balance = await getTokenBalance(userTokenU);
    console.log(`\n📊 Token U Balance: ${formatTokenAmount(balance)} Token U (${balance} raw)`);

    // 6. Save token info
    const tokenInfo = {
      mint: tokenUKeypair.publicKey.toString(),
      userATA: userTokenU.toString(),
      supply: mintAmount,
      decimals: 9,
      transactionSignature: signature,
    };

    fs.writeFileSync("token-u-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log("\n💾 Token U info saved to token-u-info.json");

  } catch (error) {
    console.error("❌ Error creating Token U:", error);
    throw error;
  }
}

// Run the function
createTokenU().catch(console.error);