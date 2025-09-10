import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
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
 * Test single R → Q swap
 */
async function testSingleSwapRQ() {
  try {
    console.log("🚀 Testing single R → Q swap...");
    
    // Load pool info
    const poolQRInfo = JSON.parse(fs.readFileSync('pool-qr-info.json', 'utf-8'));
    
    // Pool Q-R details
    const poolQRPDA = new PublicKey(poolQRInfo.poolPDA);
    const TOKEN_Q_MINT = new PublicKey(poolQRInfo.tokenQ);
    const TOKEN_R_MINT = new PublicKey(poolQRInfo.tokenR);
    const vaultQ = new PublicKey(poolQRInfo.vaultQ);
    const vaultR = new PublicKey(poolQRInfo.vaultR);
    
    console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
    console.log(`Pool Q-R PDA: ${poolQRPDA.toString()}`);
    console.log(`Vault Q: ${vaultQ.toString()}`);
    console.log(`Vault R: ${vaultR.toString()}`);

    // User ATAs
    const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token R ATA: ${userTokenR.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Single Swap:");
    const balanceTokenRBefore = await getTokenBalance(userTokenR);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    
    console.log(`Token R: ${formatTokenAmount(balanceTokenRBefore)} (${balanceTokenRBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);

    // Define swap parameters
    const amountIn = 1_000_000_000; // 1 Token R
    const direction_a_to_b = false; // R → Q (B → A)
    
    console.log(`\n🔄 Single Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token R`);
    console.log(`Direction: R → Q (direction_a_to_b = ${direction_a_to_b})`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      
      // Pool accounts
      { pubkey: poolQRPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false }, // token_a = Q
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false }, // token_b = R
      { pubkey: vaultQ, isSigner: false, isWritable: true }, // vault_a = Q vault
      { pubkey: vaultR, isSigner: false, isWritable: true }, // vault_b = R vault
      { pubkey: userTokenR, isSigner: false, isWritable: true }, // user input account
      { pubkey: userTokenQ, isSigner: false, isWritable: true }, // user output account
    ];

    // Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(direction_a_to_b ? 1 : 0, 9);
    
    console.log('Instruction data breakdown:');
    console.log('Discriminator (byte 0):', data.readUInt8(0));
    console.log('Amount in (bytes 1-8):', data.readBigUInt64LE(1).toString());
    console.log('Direction (byte 9):', data.readUInt8(9));
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add Swap instruction
    console.log("📝 Adding Swap instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending single swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Single swap R → Q completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Single Swap:");
    const balanceTokenRAfter = await getTokenBalance(userTokenR);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    
    console.log(`Token R: ${formatTokenAmount(balanceTokenRAfter)} (${balanceTokenRAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);

    // Calculate changes
    const tokenRUsed = balanceTokenRBefore - balanceTokenRAfter;
    const tokenQReceived = balanceTokenQAfter - balanceTokenQBefore;
    
    console.log(`\n📈 Single Swap Results:`);
    console.log(`Token R Used: ${formatTokenAmount(tokenRUsed)}`);
    console.log(`Token Q Received: ${formatTokenAmount(tokenQReceived)}`);

  } catch (error) {
    console.error("❌ Error in single swap R → Q:", error);
    throw error;
  }
}

// Run the function
testSingleSwapRQ().catch(console.error);
