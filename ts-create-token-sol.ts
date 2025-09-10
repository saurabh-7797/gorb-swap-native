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
 * TypeScript Script: Create Token SOL (using native SOL mint)
 */
async function createTokenSOL() {
  try {
    console.log("🚀 Creating Token SOL (using native SOL mint)...");
    
    // Use the native SOL mint address
    const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    console.log(`SOL Mint: ${SOL_MINT.toString()}`);
    
    // For SOL, we use the user's wallet as the token account
    const userSOL = userKeypair.publicKey;
    console.log(`User SOL Account: ${userSOL.toString()}`);

    // Check SOL balance
    const solBalance = await connection.getBalance(userKeypair.publicKey);
    console.log(`\n📊 SOL Balance: ${solBalance / 1e9} SOL (${solBalance} lamports)`);

    // Save token info
    const tokenInfo = {
      mint: SOL_MINT.toString(),
      userAccount: userSOL.toString(),
      balance: solBalance,
      decimals: 9,
      isNative: true,
    };

    fs.writeFileSync("token-sol-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log("\n💾 Token SOL info saved to token-sol-info.json");
    console.log("✅ Token SOL (native) ready!");

  } catch (error) {
    console.error("❌ Error creating Token SOL:", error);
    throw error;
  }
}

// Run the function
createTokenSOL().catch(console.error);
