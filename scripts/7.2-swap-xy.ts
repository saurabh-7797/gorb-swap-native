import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("EtGrXaRpEdozMtfd8tbkbrbDN8LqZNba3xWTdT3HtQWq");
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
 * TypeScript Script: Swap X to Y in Pool X-Y
 * This swaps Token X for Token Y in the existing X-Y pool
 */
async function swapXY() {
  try {
    console.log("🚀 TypeScript Script: Swapping X to Y in Pool X-Y...");
    
    // Load pool info from existing file
    const poolInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
    
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_X_MINT = new PublicKey(poolInfo.tokenX);
    const TOKEN_Y_MINT = new PublicKey(poolInfo.tokenY);
    const VAULT_X = new PublicKey(poolInfo.vaultX);
    const VAULT_Y = new PublicKey(poolInfo.vaultY);
    const USER_TOKEN_X = new PublicKey(poolInfo.userTokenX);
    const USER_TOKEN_Y = new PublicKey(poolInfo.userTokenY);

    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token X Mint: ${TOKEN_X_MINT.toString()}`);
    console.log(`Token Y Mint: ${TOKEN_Y_MINT.toString()}`);
    console.log(`Vault X: ${VAULT_X.toString()}`);
    console.log(`Vault Y: ${VAULT_Y.toString()}`);
    console.log(`User Token X ATA: ${USER_TOKEN_X.toString()}`);
    console.log(`User Token Y ATA: ${USER_TOKEN_Y.toString()}`);

    // Check balances before swap
    console.log("\n📊 Balances BEFORE Swap:");
    const balanceTokenXBefore = await getTokenBalance(USER_TOKEN_X);
    const balanceTokenYBefore = await getTokenBalance(USER_TOKEN_Y);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceTokenYBefore)} (${balanceTokenYBefore} raw)`);

    // Swap parameters
    const amountIn = 100_000_000; // 0.1 Token X
    const directionAToB = true; // true = X to Y, false = Y to X
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token X`);
    console.log(`Direction: X → Y (A to B)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap (matching contract order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Y_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_X, isSigner: false, isWritable: true },
      { pubkey: VAULT_Y, isSigner: false, isWritable: true },
      { pubkey: USER_TOKEN_X, isSigner: false, isWritable: true },
      { pubkey: USER_TOKEN_Y, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator (3)
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(directionAToB ? 1 : 0, 9); // boolean as u8

    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding Swap instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending swap transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Swap completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after swap
    console.log(`\n📊 Balances AFTER Swap:`);
    const balanceTokenXAfter = await getTokenBalance(USER_TOKEN_X);
    const balanceTokenYAfter = await getTokenBalance(USER_TOKEN_Y);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceTokenYAfter)} (${balanceTokenYAfter} raw)`);

    // Calculate changes
    const tokenXChange = balanceTokenXBefore - balanceTokenXAfter;
    const tokenYChange = balanceTokenYAfter - balanceTokenYBefore;
    
    console.log(`\n📈 Swap Results:`);
    console.log(`Token X Used: ${formatTokenAmount(tokenXChange)} (${tokenXChange} raw)`);
    console.log(`Token Y Received: ${formatTokenAmount(tokenYChange)} (${tokenYChange} raw)`);
    
    if (tokenYChange > 0) {
      const exchangeRate = tokenYChange / tokenXChange;
      console.log(`Exchange Rate: ${exchangeRate.toFixed(6)} Token Y per Token X`);
    }

    // Create swap info file
    const swapInfo = {
      poolPDA: poolInfo.poolPDA,
      tokenX: poolInfo.tokenX,
      tokenY: poolInfo.tokenY,
      swapDirection: "Token X → Token Y",
      amountIn: amountIn,
      amountOut: tokenYChange,
      directionAToB: directionAToB,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      userTokenX: poolInfo.userTokenX,
      userTokenY: poolInfo.userTokenY,
      exchangeRate: tokenYChange > 0 ? `${(tokenYChange / tokenXChange).toFixed(6)} Token Y per Token X` : "N/A"
    };

    fs.writeFileSync("swap-xy-info.json", JSON.stringify(swapInfo, null, 2));
    console.log("\n💾 Swap info saved to swap-xy-info.json");

  } catch (error) {
    console.error("❌ Error swapping in pool X-Y:", error);
    throw error;
  }
}

// Run the script
swapXY()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
