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
 * TypeScript Script: Swap Y to X in Pool X-Y
 * This swaps Token Y for Token X in the existing X-Y pool
 */
async function swapYX() {
  try {
    console.log("🚀 TypeScript Script: Swapping Y to X in Pool X-Y...");
    
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
    const amountIn = 100_000_000; // 0.1 Token Y
    const directionAToB = false; // false = Y to X, true = X to Y
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token Y`);
    console.log(`Direction: Y → X (B to A)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for Swap (matching contract order)
    // When direction_a_to_b = false (Y to X), we need to swap the user token accounts
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Y_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_X, isSigner: false, isWritable: true },
      { pubkey: VAULT_Y, isSigner: false, isWritable: true },
      { pubkey: USER_TOKEN_Y, isSigner: false, isWritable: true }, // user_in_info (Token Y - input)
      { pubkey: USER_TOKEN_X, isSigner: false, isWritable: true }, // user_out_info (Token X - output)
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
    const tokenXChange = balanceTokenXAfter - balanceTokenXBefore;
    const tokenYChange = balanceTokenYBefore - balanceTokenYAfter;
    
    console.log(`\n📈 Swap Results:`);
    console.log(`Token Y Used: ${formatTokenAmount(tokenYChange)} (${tokenYChange} raw)`);
    console.log(`Token X Received: ${formatTokenAmount(tokenXChange)} (${tokenXChange} raw)`);
    
    if (tokenXChange > 0) {
      const exchangeRate = tokenXChange / tokenYChange;
      console.log(`Exchange Rate: ${exchangeRate.toFixed(6)} Token X per Token Y`);
    }

    // Create swap info file
    const swapInfo = {
      poolPDA: poolInfo.poolPDA,
      tokenX: poolInfo.tokenX,
      tokenY: poolInfo.tokenY,
      swapDirection: "Token Y → Token X",
      amountIn: amountIn,
      amountOut: tokenXChange,
      directionAToB: directionAToB,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      userTokenX: poolInfo.userTokenX,
      userTokenY: poolInfo.userTokenY,
      exchangeRate: tokenXChange > 0 ? `${(tokenXChange / tokenYChange).toFixed(6)} Token X per Token Y` : "N/A"
    };

    fs.writeFileSync("swap-yx-info.json", JSON.stringify(swapInfo, null, 2));
    console.log("\n💾 Swap info saved to swap-yx-info.json");

  } catch (error) {
    console.error("❌ Error swapping in pool X-Y:", error);
    throw error;
  }
}

// Run the script
swapYX()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
