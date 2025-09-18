import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import * as fs from "fs";

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("EtGrXaRpEdozMtfd8tbkbrbDN8LqZNba3xWTdT3HtQWq");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

/**
 * TypeScript Script: Withdraw Fees from Pool
 * This script withdraws accumulated trading fees from pool vaults to treasury
 */
async function withdrawFees() {
  try {
    console.log("🚀 TypeScript Script: Withdraw Fees from Pool...");
    
    // Load pool info (using X-Y pool as example)
    const poolXYInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
    const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
    const tokenYInfo = JSON.parse(fs.readFileSync('token-y-info.json', 'utf-8'));
    
    const POOL_XY_PDA = new PublicKey(poolXYInfo.poolPDA);
    const VAULT_X = new PublicKey(poolXYInfo.vaultX);
    const VAULT_Y = new PublicKey(poolXYInfo.vaultY);
    const TOKEN_X_MINT = new PublicKey(tokenXInfo.mint);
    const TOKEN_Y_MINT = new PublicKey(tokenYInfo.mint);
    
    console.log(`Pool PDA: ${POOL_XY_PDA.toString()}`);
    console.log(`Treasury: ${userKeypair.publicKey.toString()}`);

    // Fee withdrawal amounts (small amounts for testing)
    const amountA = 0; // No Token X fees available (was reset by collect_fees)
    const amountB = 300000; // 0.0003 Token Y (0.3% of 0.1 = 0.0003)
    
    console.log(`\n💰 Withdrawal amounts:`);
    console.log(`Token X fees: ${amountA / 1e9} (${amountA} raw)`);
    console.log(`Token Y fees: ${amountB / 1e9} (${amountB} raw)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for WithdrawFees
    const accounts = [
      { pubkey: POOL_XY_PDA, isSigner: false, isWritable: true },              // pool_info
      { pubkey: userKeypair.publicKey, isSigner: false, isWritable: true },    // treasury_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },    // authority_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },    // token_program_info
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program_info
      { pubkey: VAULT_X, isSigner: false, isWritable: true },                  // vault_a_info
      { pubkey: VAULT_Y, isSigner: false, isWritable: true },                  // vault_b_info
    ];

    // Instruction data (Borsh: WithdrawFees { pool, amount_a, amount_b })
    const data = Buffer.alloc(1 + 32 + 8 + 8); // 1 byte discriminator + 32 bytes Pubkey + 2x u64
    data.writeUInt8(7, 0); // WithdrawFees discriminator (7)
    POOL_XY_PDA.toBuffer().copy(data, 1);
    data.writeBigUInt64LE(BigInt(amountA), 33);
    data.writeBigUInt64LE(BigInt(amountB), 41);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding WithdrawFees instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending withdraw fees transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Withdraw fees completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Create withdraw fees info file
    const withdrawFeesInfo = {
      poolPDA: POOL_XY_PDA.toString(),
      treasury: userKeypair.publicKey.toString(),
      amountA: amountA,
      amountB: amountB,
      tokenAMint: TOKEN_X_MINT.toString(),
      tokenBMint: TOKEN_Y_MINT.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("withdraw-fees-info.json", JSON.stringify(withdrawFeesInfo, null, 2));
    console.log("\n💾 Withdraw fees info saved to withdraw-fees-info.json");

  } catch (error) {
    console.error("❌ Error withdrawing fees:", error);
    throw error;
  }
}

// Run the script
withdrawFees()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
