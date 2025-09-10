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

/**
 * Test Native SOL Instructions
 * This script tests the new native SOL instruction discriminators
 */
async function testNativeSOLInstructions() {
  try {
    console.log("🚀 Testing Native SOL Instructions...");
    
    // Load Token A info
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);

    // Test GetNativeSOLPoolInfo instruction (discriminant: 13)
    console.log("\n📝 Testing GetNativeSOLPoolInfo instruction...");
    
    const poolPDA = new PublicKey("DVyLb3QQ4DUDZr2uSbgA3timvyo3aMk5ddTUdoWQQQVa"); // Example PDA
    
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: false },
    ];

    const data = Buffer.alloc(1);
    data.writeUInt8(16, 0); // GetNativeSOLPoolInfo discriminator (16)
    
    console.log(`Instruction data: ${data.toString('hex')}`);

    const transaction = new Transaction();
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    console.log("📝 Sending GetNativeSOLPoolInfo instruction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ GetNativeSOLPoolInfo instruction completed!`);
    console.log(`Transaction signature: ${signature}`);

    // Test GetNativeSOLSwapQuote instruction (discriminant: 14)
    console.log("\n📝 Testing GetNativeSOLSwapQuote instruction...");
    
    const amountIn = 1_000_000_000; // 1 SOL
    const isSolToToken = true;
    
    const quoteData = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    quoteData.writeUInt8(17, 0); // GetNativeSOLSwapQuote discriminator (17)
    quoteData.writeBigUInt64LE(BigInt(amountIn), 1);
    quoteData.writeUInt8(isSolToToken ? 1 : 0, 9);
    
    console.log(`Quote instruction data: ${quoteData.toString('hex')}`);

    const quoteTransaction = new Transaction();
    quoteTransaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: quoteData,
    });

    console.log("📝 Sending GetNativeSOLSwapQuote instruction...");
    const quoteSignature = await sendAndConfirmTransaction(connection, quoteTransaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ GetNativeSOLSwapQuote instruction completed!`);
    console.log(`Transaction signature: ${quoteSignature}`);

    console.log("\n🎉 All Native SOL instruction tests completed successfully!");

  } catch (error) {
    console.error("❌ Error testing native SOL instructions:", error);
    throw error;
  }
}

// Run the function
testNativeSOLInstructions().catch(console.error);
