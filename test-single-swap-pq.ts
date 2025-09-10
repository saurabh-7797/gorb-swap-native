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
 * Test single P → Q swap
 */
async function testSingleSwapPQ() {
  try {
    console.log("🚀 Testing single P → Q swap...");
    
    // Load pool info
    const poolPQInfo = JSON.parse(fs.readFileSync('pool-pq-info.json', 'utf-8'));
    
    // Pool P-Q details
    const poolPQPDA = new PublicKey(poolPQInfo.poolPDA);
    const TOKEN_P_MINT = new PublicKey(poolPQInfo.tokenP);
    const TOKEN_Q_MINT = new PublicKey(poolPQInfo.tokenQ);
    const vaultP = new PublicKey(poolPQInfo.vaultP);
    const vaultQ = new PublicKey(poolPQInfo.vaultQ);
    
    console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
    console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
    console.log(`Pool P-Q PDA: ${poolPQPDA.toString()}`);
    console.log(`Vault P: ${vaultP.toString()}`);
    console.log(`Vault Q: ${vaultQ.toString()}`);

    // User ATAs
    const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token P ATA: ${userTokenP.toString()}`);
    console.log(`User Token Q ATA: ${userTokenQ.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Single Swap:");
    const balanceTokenPBefore = await getTokenBalance(userTokenP);
    const balanceTokenQBefore = await getTokenBalance(userTokenQ);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPBefore)} (${balanceTokenPBefore} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQBefore)} (${balanceTokenQBefore} raw)`);

    // Define swap parameters
    const amountIn = 1_000_000_000; // 1 Token P
    const direction_a_to_b = true; // P → Q (A → B)
    
    console.log(`\n🔄 Single Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token P`);
    console.log(`Direction: P → Q (direction_a_to_b = ${direction_a_to_b})`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      
      // Pool accounts
      { pubkey: poolPQPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false }, // token_a = P
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false }, // token_b = Q
      { pubkey: vaultP, isSigner: false, isWritable: true }, // vault_a = P vault
      { pubkey: vaultQ, isSigner: false, isWritable: true }, // vault_b = Q vault
      { pubkey: userTokenP, isSigner: false, isWritable: true }, // user input account
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

    console.log(`✅ Single swap P → Q completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Single Swap:");
    const balanceTokenPAfter = await getTokenBalance(userTokenP);
    const balanceTokenQAfter = await getTokenBalance(userTokenQ);
    
    console.log(`Token P: ${formatTokenAmount(balanceTokenPAfter)} (${balanceTokenPAfter} raw)`);
    console.log(`Token Q: ${formatTokenAmount(balanceTokenQAfter)} (${balanceTokenQAfter} raw)`);

    // Calculate changes
    const tokenPUsed = balanceTokenPBefore - balanceTokenPAfter;
    const tokenQReceived = balanceTokenQAfter - balanceTokenQBefore;
    
    console.log(`\n📈 Single Swap Results:`);
    console.log(`Token P Used: ${formatTokenAmount(tokenPUsed)}`);
    console.log(`Token Q Received: ${formatTokenAmount(tokenQReceived)}`);

  } catch (error) {
    console.error("❌ Error in single swap P → Q:", error);
    throw error;
  }
}

// Run the function
testSingleSwapPQ().catch(console.error);
