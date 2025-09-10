import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

async function testSimpleInstruction() {
  try {
    console.log("🔍 Testing simple instruction (GetTotalPools)...");
    
    // Test GetTotalPools discriminator (should be 6 based on enum order)
    console.log("\n📝 Testing GetTotalPools discriminator...");
    const getTotalPoolsData = Buffer.alloc(8);
    getTotalPoolsData.writeBigUInt64LE(BigInt(6), 0); // GetTotalPools discriminator
    
    console.log(`GetTotalPools data: ${getTotalPoolsData.toString('hex')}`);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Add GetTotalPools instruction
    transaction.add({
      keys: [], // No accounts needed for GetTotalPools
      programId: AMM_PROGRAM_ID,
      data: getTotalPoolsData,
    });
    
    // Send transaction
    console.log("\n📝 Sending GetTotalPools transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log(`✅ GetTotalPools successful!`);
    console.log(`Transaction signature: ${signature}`);
    
  } catch (error) {
    console.error("❌ Error testing simple instruction:", error);
    console.error("Full error:", error);
  }
}

testSimpleInstruction().catch(console.error);
