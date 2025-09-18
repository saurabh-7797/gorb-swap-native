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
 * TypeScript Script: Set Fee Treasury for Pool
 * This script sets/updates the treasury address where fees will be collected
 */
async function setFeeTreasury() {
  try {
    console.log("🚀 TypeScript Script: Set Fee Treasury for Pool...");
    
    // Load pool info (using X-Y pool as example)
    const poolXYInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
    const POOL_XY_PDA = new PublicKey(poolXYInfo.poolPDA);
    
    // Create a new treasury keypair (in practice, this would be a specific treasury account)
    const newTreasury = userKeypair.publicKey; // Using user as treasury for demo
    
    console.log(`Pool PDA: ${POOL_XY_PDA.toString()}`);
    console.log(`New Treasury: ${newTreasury.toString()}`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for SetFeeTreasury
    const accounts = [
      { pubkey: POOL_XY_PDA, isSigner: false, isWritable: true },      // pool_info
      { pubkey: newTreasury, isSigner: false, isWritable: false },     // treasury_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false }, // authority_info
    ];

    // Instruction data (Borsh: SetFeeTreasury { pool, treasury })
    const data = Buffer.alloc(1 + 32 + 32); // 1 byte discriminator + 2x 32 bytes Pubkey
    data.writeUInt8(8, 0); // SetFeeTreasury discriminator (8)
    POOL_XY_PDA.toBuffer().copy(data, 1);
    newTreasury.toBuffer().copy(data, 33);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding SetFeeTreasury instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending set fee treasury transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Set fee treasury completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Create set treasury info file
    const setTreasuryInfo = {
      poolPDA: POOL_XY_PDA.toString(),
      newTreasury: newTreasury.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("set-treasury-info.json", JSON.stringify(setTreasuryInfo, null, 2));
    console.log("\n💾 Set treasury info saved to set-treasury-info.json");

  } catch (error) {
    console.error("❌ Error setting fee treasury:", error);
    throw error;
  }
}

// Run the script
setFeeTreasury()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
