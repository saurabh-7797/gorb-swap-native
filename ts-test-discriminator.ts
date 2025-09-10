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
} from "@solana/spl-token";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX");
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

async function testDiscriminators() {
  try {
    console.log("🔍 Testing instruction discriminators...");
    
    // Load Token A info
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    
    // Test InitPool discriminator (should be 0)
    console.log("\n📝 Testing InitPool discriminator...");
    const initPoolData = Buffer.alloc(8 + 8 + 8);
    initPoolData.writeBigUInt64LE(BigInt(0), 0); // InitPool discriminator
    initPoolData.writeBigUInt64LE(BigInt(1000000000), 8); // amount_a
    initPoolData.writeBigUInt64LE(BigInt(1000000000), 16); // amount_b
    
    console.log(`InitPool data: ${initPoolData.toString('hex')}`);
    
    // Test InitNativeSOLPool discriminator (should be 10)
    console.log("\n📝 Testing InitNativeSOLPool discriminator...");
    const initNativeSOLData = Buffer.alloc(8 + 8 + 8);
    initNativeSOLData.writeBigUInt64LE(BigInt(10), 0); // InitNativeSOLPool discriminator
    initNativeSOLData.writeBigUInt64LE(BigInt(1000000000), 8); // amount_sol
    initNativeSOLData.writeBigUInt64LE(BigInt(1000000000), 16); // amount_token
    
    console.log(`InitNativeSOLPool data: ${initNativeSOLData.toString('hex')}`);
    
    // Try to find the correct discriminator by testing different values
    console.log("\n🔍 Testing different discriminators...");
    
    for (let i = 0; i < 20; i++) {
      const testData = Buffer.alloc(8 + 8 + 8);
      testData.writeBigUInt64LE(BigInt(i), 0);
      testData.writeBigUInt64LE(BigInt(1000000000), 8);
      testData.writeBigUInt64LE(BigInt(1000000000), 16);
      
      console.log(`Discriminator ${i}: ${testData.toString('hex')}`);
    }
    
  } catch (error) {
    console.error("❌ Error testing discriminators:", error);
  }
}

testDiscriminators().catch(console.error);
