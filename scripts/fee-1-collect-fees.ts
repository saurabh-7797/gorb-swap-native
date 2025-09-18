import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("EtGrXaRpEdozMtfd8tbkbrbDN8LqZNba3xWTdT3HtQWq");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

/**
 * TypeScript Script: Collect Fees from Pool
 * This script collects (views and resets) accumulated trading fees from a pool
 */
async function collectFees() {
  try {
    console.log("🚀 TypeScript Script: Collect Fees from Pool...");
    
    // Load pool info (using X-Y pool as example)
    const poolXYInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
    const POOL_XY_PDA = new PublicKey(poolXYInfo.poolPDA);
    
    console.log(`Pool PDA: ${POOL_XY_PDA.toString()}`);
    console.log(`Treasury: ${userKeypair.publicKey.toString()}`); // Using user as treasury for demo

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for CollectFees
    const accounts = [
      { pubkey: POOL_XY_PDA, isSigner: false, isWritable: true },           // pool_info
      { pubkey: userKeypair.publicKey, isSigner: false, isWritable: false }, // treasury_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },  // authority_info
    ];

    // Instruction data (Borsh: CollectFees { pool })
    const data = Buffer.alloc(1 + 32); // 1 byte discriminator + 32 bytes Pubkey
    data.writeUInt8(6, 0); // CollectFees discriminator (6)
    POOL_XY_PDA.toBuffer().copy(data, 1);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding CollectFees instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending collect fees transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Collect fees completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Create collect fees info file
    const collectFeesInfo = {
      poolPDA: POOL_XY_PDA.toString(),
      treasury: userKeypair.publicKey.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("collect-fees-info.json", JSON.stringify(collectFeesInfo, null, 2));
    console.log("\n💾 Collect fees info saved to collect-fees-info.json");

  } catch (error) {
    console.error("❌ Error collecting fees:", error);
    throw error;
  }
}

// Run the script
collectFees()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
