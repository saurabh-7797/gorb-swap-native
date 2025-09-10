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

// Test tokens (from your existing pools)
const TEST_TOKENS = {
  TOKEN_P: "AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW",
  TOKEN_Q: "8W2CSgx45fsxP1WnnYJxJVqqVC7XKB1ARmFbiRXyUBTR", 
  TOKEN_R: "4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq",
  TOKEN_M: "Unknown", // Add if you have Token M
  TOKEN_S: "Unknown", // Add if you have Token S
  TOKEN_T: "Unknown", // Add if you have Token T
  TOKEN_U: "Unknown", // Add if you have Token U
  TOKEN_V: "Unknown", // Add if you have Token V
};

async function testPoolFinder() {
  try {
    console.log("🧪 Testing Pool Finder Tool");
    console.log("===========================");
    
    // Test with each known token
    for (const [tokenName, tokenAddress] of Object.entries(TEST_TOKENS)) {
      if (tokenAddress === "Unknown") continue;
      
      console.log(`\n🔍 Testing with ${tokenName}: ${tokenAddress}`);
      console.log("-".repeat(50));
      
      try {
        // Call the FindPoolsByToken instruction
        const transaction = new Transaction();
        
        // Instruction data (Borsh: FindPoolsByToken { token_address: Pubkey })
        const data = Buffer.alloc(1 + 32); // 1 byte discriminator + 32 bytes Pubkey
        data.writeUInt8(8, 0); // FindPoolsByToken discriminator
        data.set(new PublicKey(tokenAddress).toBytes(), 1);
        
        // Add FindPoolsByToken instruction
        transaction.add({
          keys: [
            // No accounts needed for this instruction in current implementation
          ],
          programId: AMM_PROGRAM_ID,
          data,
        });

        // Send transaction
        const signature = await sendAndConfirmTransaction(connection, transaction, [
          userKeypair,
        ], {
          commitment: "confirmed",
          preflightCommitment: "confirmed",
        });

        console.log(`✅ FindPoolsByToken completed! Signature: ${signature}`);
        
        // Get transaction logs
        const logs = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        
        if (logs?.meta?.logMessages) {
          console.log("📋 On-chain logs:");
          logs.meta.logMessages.forEach(log => {
            if (log.includes("FindPoolsByToken") || log.includes("token:")) {
              console.log(`  ${log}`);
            }
          });
        }
        
      } catch (error) {
        console.error(`❌ Error testing ${tokenName}:`, error);
      }
    }
    
    console.log("\n✅ Pool finder testing completed!");
    
  } catch (error) {
    console.error("❌ Error in pool finder test:", error);
    throw error;
  }
}

// Run the test
testPoolFinder().catch(console.error);
