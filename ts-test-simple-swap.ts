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

// Test simple swap on S-T pool
async function testSimpleSwap() {
  try {
    console.log("🚀 Testing Simple Swap on S-T Pool...");
    
    // Load pool info
    const poolSTInfo = JSON.parse(fs.readFileSync('pool-st-info.json', 'utf-8'));
    
    const poolSTPDA = new PublicKey(poolSTInfo.poolPDA);
    const TOKEN_S_MINT = new PublicKey(poolSTInfo.tokenS);
    const TOKEN_T_MINT = new PublicKey(poolSTInfo.tokenT);
    const vaultS = new PublicKey(poolSTInfo.vaultS);
    const vaultT = new PublicKey(poolSTInfo.vaultT);
    
    console.log(`Pool S-T PDA: ${poolSTPDA.toString()}`);
    console.log(`Token S: ${TOKEN_S_MINT.toString()}`);
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);

    // User ATAs
    const userTokenS = getAssociatedTokenAddressSync(TOKEN_S_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenT = getAssociatedTokenAddressSync(TOKEN_T_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    // Check balances before swap
    console.log("\n📊 Balances BEFORE Simple Swap:");
    const balanceTokenSBefore = await getTokenBalance(userTokenS);
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSBefore)} (${balanceTokenSBefore} raw)`);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);

    // Simple swap parameters
    const amountIn = 1_000_000_000; // 1 Token S
    const directionAtoB = true; // S to T
    
    console.log(`\n🔄 Simple Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token S`);
    console.log(`Direction: S → T`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap
    const accounts = [
      { pubkey: poolSTPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_S_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultS, isSigner: false, isWritable: true },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: userTokenS, isSigner: false, isWritable: true },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(directionAtoB ? 1 : 0, 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add Swap instruction
    console.log("📝 Adding Swap instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending simple swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Simple swap completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log("\n📊 Balances AFTER Simple Swap:");
    const balanceTokenSAfter = await getTokenBalance(userTokenS);
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    
    console.log(`Token S: ${formatTokenAmount(balanceTokenSAfter)} (${balanceTokenSAfter} raw)`);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);

    // Calculate changes
    const tokenSUsed = balanceTokenSBefore - balanceTokenSAfter;
    const tokenTReceived = balanceTokenTAfter - balanceTokenTBefore;
    
    console.log(`\n📈 Simple Swap Results:`);
    console.log(`Token S Used: ${formatTokenAmount(tokenSUsed)}`);
    console.log(`Token T Received: ${formatTokenAmount(tokenTReceived)}`);
    
    // Calculate exchange rate
    if (tokenSUsed > 0) {
      const exchangeRate = tokenTReceived / tokenSUsed;
      console.log(`\n💱 Exchange Rate: 1 Token S = ${exchangeRate.toFixed(6)} Token T`);
    }

  } catch (error) {
    console.error("❌ Error in simple swap:", error);
    throw error;
  }
}

// Run the function
testSimpleSwap().catch(console.error);
