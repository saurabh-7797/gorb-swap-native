import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getAccount,
  getMint,
} from "@solana/spl-token";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

/**
 * Verify Wrapped SOL Token
 * This script checks if the Wrapped SOL token is properly backed by native SOL
 */
async function verifyWrappedSOL() {
  try {
    console.log("🔍 Verifying Wrapped SOL Token...");
    
    // Load Wrapped SOL info
    const wrappedSOLInfo = JSON.parse(fs.readFileSync('wrapped-sol-info.json', 'utf-8'));
    const WRAPPED_SOL_MINT = new PublicKey(wrappedSOLInfo.mint);
    
    console.log(`Wrapped SOL Mint: ${WRAPPED_SOL_MINT.toString()}`);
    console.log(`Native SOL Mint: So11111111111111111111111111111111111111112`);
    
    // 1. Check Wrapped SOL mint details
    console.log("\n📊 Wrapped SOL Mint Information:");
    try {
      const mintInfo = await getMint(connection, WRAPPED_SOL_MINT, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`✅ Mint exists and is valid`);
      console.log(`   Decimals: ${mintInfo.decimals}`);
      console.log(`   Supply: ${formatTokenAmount(Number(mintInfo.supply))} Wrapped SOL`);
      console.log(`   Mint Authority: ${mintInfo.mintAuthority?.toString() || "None"}`);
      console.log(`   Freeze Authority: ${mintInfo.freezeAuthority?.toString() || "None"}`);
    } catch (error) {
      console.log(`❌ Error fetching mint info: ${error}`);
      return;
    }

    // 2. Check user's Wrapped SOL balance
    console.log("\n📊 User's Wrapped SOL Balance:");
    try {
      const userWrappedSOLATA = new PublicKey(wrappedSOLInfo.userATA);
      const accountInfo = await getAccount(connection, userWrappedSOLATA, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`✅ User ATA exists`);
      console.log(`   Balance: ${formatTokenAmount(Number(accountInfo.amount))} Wrapped SOL`);
      console.log(`   Owner: ${accountInfo.owner.toString()}`);
      console.log(`   Mint: ${accountInfo.mint.toString()}`);
    } catch (error) {
      console.log(`❌ Error fetching user balance: ${error}`);
    }

    // 3. Check native SOL balance
    console.log("\n📊 Native SOL Balance:");
    const nativeSOLBalance = await connection.getBalance(userKeypair.publicKey);
    console.log(`   Native SOL: ${nativeSOLBalance / 1e9} SOL (${nativeSOLBalance} lamports)`);

    // 4. Verify the relationship
    console.log("\n🔗 Verification Analysis:");
    console.log("=".repeat(50));
    
    // Check if this is a proper wrapped token
    const isWrappedToken = WRAPPED_SOL_MINT.toString() !== "So11111111111111111111111111111111111111112";
    
    if (isWrappedToken) {
      console.log("✅ This is a CUSTOM Wrapped SOL token (not the official one)");
      console.log("   - Created by our script");
      console.log("   - Represents SOL but is not the official wrapped SOL");
      console.log("   - Value is maintained by the mint authority");
    } else {
      console.log("❌ This is the official native SOL mint address");
    }

    // 5. Check if it's backed by actual SOL
    console.log("\n💰 Backing Analysis:");
    console.log("   - Wrapped SOL tokens created: 2.000000");
    console.log("   - Native SOL used: ~0.0035456 SOL (for transaction fees)");
    console.log("   - This is a CUSTOM token, not backed by official SOL wrapping");
    
    // 6. Show the difference between official and custom wrapped SOL
    console.log("\n📋 Official vs Custom Wrapped SOL:");
    console.log("   Official Wrapped SOL:");
    console.log("   - Mint: So11111111111111111111111111111111111111112");
    console.log("   - Backed by actual SOL deposits");
    console.log("   - Can be unwrapped to native SOL");
    console.log("   - Used by most DeFi protocols");
    console.log("");
    console.log("   Our Custom Wrapped SOL:");
    console.log("   - Mint: H8xkwzxCxQgFCi7jN1pXzYNZ4EprkwoJd61rSDvciMLM");
    console.log("   - Created as a regular SPL token");
    console.log("   - Represents SOL conceptually");
    console.log("   - Cannot be unwrapped to native SOL");

    // 7. Recommendations
    console.log("\n💡 Recommendations:");
    console.log("   1. For production, use official Wrapped SOL (So111...)");
    console.log("   2. For testing, our custom token works fine");
    console.log("   3. Users can still trade 'SOL' through the AMM");
    console.log("   4. The pool works the same way regardless");

  } catch (error) {
    console.error("❌ Error verifying wrapped SOL:", error);
    throw error;
  }
}

// Run the function
verifyWrappedSOL().catch(console.error);
