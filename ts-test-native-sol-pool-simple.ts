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

/**
 * Test Native SOL Pool Initialization
 * This script tests the InitNativeSOLPool instruction
 */
async function testNativeSOLPoolInit() {
  try {
    console.log("🚀 Testing Native SOL Pool Initialization...");
    
    // Load Token A info
    const tokenAInfo = JSON.parse(fs.readFileSync('token-a-info.json', 'utf-8'));
    const TOKEN_A_MINT = new PublicKey(tokenAInfo.mint);
    
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);

    // 1. Derive native SOL pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_pool"), TOKEN_A_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Native SOL Pool PDA: ${poolPDA.toString()}`);

    // 2. Derive LP mint PDA
    const [lpMintPDA, lpMintBump] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_lp_mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`LP Mint PDA: ${lpMintPDA.toString()}`);

    // 3. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintPDA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Pool initialization parameters
    const amountSOL = 1_000_000_000; // 1 SOL (in lamports)
    const amountToken = 1_000_000_000; // 1 token A
    
    console.log(`\n🏊 Native SOL Pool Initialization Parameters:`);
    console.log(`Initial SOL: ${amountSOL / 1e9} SOL`);
    console.log(`Initial Token A: ${amountToken / 1e9} Token A`);

    // 5. Prepare accounts for InitNativeSOLPool (matching contract order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true }, // pool_info
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false }, // token_mint_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true }, // user_info
      { pubkey: userTokenA, isSigner: false, isWritable: true }, // user_token_account
      { pubkey: userLP, isSigner: false, isWritable: true }, // user_lp_account
      { pubkey: lpMintPDA, isSigner: false, isWritable: true }, // lp_mint_info
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
    ];

    // 6. Instruction data (Borsh: InitNativeSOLPool { amount_sol, amount_token })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(11, 0); // InitNativeSOLPool discriminator (11)
    data.writeBigUInt64LE(BigInt(amountSOL), 1);
    data.writeBigUInt64LE(BigInt(amountToken), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 7. Create and send transaction
    const transaction = new Transaction();
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    console.log("📝 Sending InitNativeSOLPool instruction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ InitNativeSOLPool instruction completed!`);
    console.log(`Transaction signature: ${signature}`);

    // 8. Check if pool was created
    try {
      const poolAccount = await connection.getAccountInfo(poolPDA);
      if (poolAccount) {
        console.log(`✅ Pool account created successfully!`);
        console.log(`Pool data length: ${poolAccount.data.length} bytes`);
      } else {
        console.log(`❌ Pool account not found`);
      }
    } catch (error) {
      console.log(`❌ Error checking pool account: ${error}`);
    }

  } catch (error) {
    console.error("❌ Error testing native SOL pool initialization:", error);
    throw error;
  }
}

// Run the function
testNativeSOLPoolInit().catch(console.error);
