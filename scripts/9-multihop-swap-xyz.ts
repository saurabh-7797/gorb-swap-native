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
 * TypeScript Script: Multihop Swap X → Y → Z
 * This performs a multihop swap from Token X to Token Z via Token Y in a single transaction
 */
async function multihopSwapXYZ() {
  try {
    console.log("🚀 TypeScript Script: Multihop Swap X → Y → Z...");
    
    // Load token info from existing files
    const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
    const tokenYInfo = JSON.parse(fs.readFileSync('token-y-info.json', 'utf-8'));
    const tokenZInfo = JSON.parse(fs.readFileSync('token-z-info.json', 'utf-8'));
    
    const TOKEN_X_MINT = new PublicKey(tokenXInfo.mint);
    const TOKEN_Y_MINT = new PublicKey(tokenYInfo.mint);
    const TOKEN_Z_MINT = new PublicKey(tokenZInfo.mint);
    
    console.log(`Token X: ${TOKEN_X_MINT.toString()}`);
    console.log(`Token Y: ${TOKEN_Y_MINT.toString()}`);
    console.log(`Token Z: ${TOKEN_Z_MINT.toString()}`);

    // Load pool info
    const poolXYInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
    const poolYZInfo = JSON.parse(fs.readFileSync('pool-yz-info.json', 'utf-8'));
    
    const POOL_XY_PDA = new PublicKey(poolXYInfo.poolPDA);
    const POOL_YZ_PDA = new PublicKey(poolYZInfo.poolPDA);
    const VAULT_X_XY = new PublicKey(poolXYInfo.vaultX);
    const VAULT_Y_XY = new PublicKey(poolXYInfo.vaultY);
    const VAULT_Y_YZ = new PublicKey(poolYZInfo.vaultY);
    const VAULT_Z_YZ = new PublicKey(poolYZInfo.vaultZ);
    
    console.log(`Pool X-Y PDA: ${POOL_XY_PDA.toString()}`);
    console.log(`Pool Y-Z PDA: ${POOL_YZ_PDA.toString()}`);

    // User ATAs
    const userTokenX = getAssociatedTokenAddressSync(TOKEN_X_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenY = getAssociatedTokenAddressSync(TOKEN_Y_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenZ = getAssociatedTokenAddressSync(TOKEN_Z_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token X ATA: ${userTokenX.toString()}`);
    console.log(`User Token Y ATA: ${userTokenY.toString()}`);
    console.log(`User Token Z ATA: ${userTokenZ.toString()}`);

    // Check balances before multihop swap
    console.log("\n📊 Balances BEFORE Multihop Swap:");
    const balanceTokenXBefore = await getTokenBalance(userTokenX);
    const balanceTokenYBefore = await getTokenBalance(userTokenY);
    const balanceTokenZBefore = await getTokenBalance(userTokenZ);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceTokenYBefore)} (${balanceTokenYBefore} raw)`);
    console.log(`Token Z: ${formatTokenAmount(balanceTokenZBefore)} (${balanceTokenZBefore} raw)`);

    // Multihop swap parameters
    const amountIn = 100_000_000; // 0.1 Token X
    const minimumAmountOut = 1; // Minimum 1 unit of Token Z (slippage protection)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} Token X`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} Token Z`);
    console.log(`Path: X → Y → Z`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for MultihopSwap (matching contract order)
    // Based on the Rust code, the multihop swap expects:
    // 1. user_info (signer)
    // 2. token_program
    // 3. user_input_account (initial input token account)
    // 4. For each hop (7 accounts): [pool, token_a, token_b, vault_a, vault_b, intermediate_token_account, next_token_account]
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userTokenX, isSigner: false, isWritable: true }, // Initial input
      
      // Hop 1: X → Y (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      { pubkey: POOL_XY_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Y_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_X_XY, isSigner: false, isWritable: true },
      { pubkey: VAULT_Y_XY, isSigner: false, isWritable: true },
      { pubkey: userTokenY, isSigner: false, isWritable: true }, // Intermediate Y
      { pubkey: userTokenY, isSigner: false, isWritable: true }, // Next token account (same as intermediate for first hop)
      
      // Hop 2: Y → Z (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
      { pubkey: POOL_YZ_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_Y_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Z_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_Y_YZ, isSigner: false, isWritable: true },
      { pubkey: VAULT_Z_YZ, isSigner: false, isWritable: true },
      { pubkey: userTokenY, isSigner: false, isWritable: true }, // Intermediate Y
      { pubkey: userTokenZ, isSigner: false, isWritable: true }, // Final output
    ];

    // Instruction data (Borsh: MultihopSwap { amount_in, minimum_amount_out })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(4, 0); // MultihopSwap discriminator (4)
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeBigUInt64LE(BigInt(minimumAmountOut), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding MultihopSwap instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending multihop swap transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Multihop swap X → Y → Z completed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check final balances
    console.log("\n📊 Balances AFTER Multihop Swap:");
    const balanceTokenXAfter = await getTokenBalance(userTokenX);
    const balanceTokenYAfter = await getTokenBalance(userTokenY);
    const balanceTokenZAfter = await getTokenBalance(userTokenZ);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceTokenYAfter)} (${balanceTokenYAfter} raw)`);
    console.log(`Token Z: ${formatTokenAmount(balanceTokenZAfter)} (${balanceTokenZAfter} raw)`);

    // Calculate final results
    const totalTokenXUsed = balanceTokenXBefore - balanceTokenXAfter;
    const totalTokenZReceived = balanceTokenZAfter - balanceTokenZBefore;
    const tokenYChange = balanceTokenYAfter - balanceTokenYBefore;
    
    console.log(`\n📈 Multihop Swap Results:`);
    console.log(`Total Token X Used: ${formatTokenAmount(totalTokenXUsed)} (${totalTokenXUsed} raw)`);
    console.log(`Token Y Change: ${formatTokenAmount(tokenYChange)} (should be ~0 for multihop)`);
    console.log(`Total Token Z Received: ${formatTokenAmount(totalTokenZReceived)} (${totalTokenZReceived} raw)`);
    
    if (totalTokenXUsed > 0 && totalTokenZReceived > 0) {
      const exchangeRate = totalTokenZReceived / totalTokenXUsed;
      console.log(`Final Exchange Rate: 1 Token X = ${exchangeRate.toFixed(6)} Token Z`);
    }

    // Create multihop swap info file
    const multihopSwapInfo = {
      tokenPath: [TOKEN_X_MINT.toString(), TOKEN_Y_MINT.toString(), TOKEN_Z_MINT.toString()],
      amountIn: amountIn,
      minimumAmountOut: minimumAmountOut,
      totalTokenXUsed: totalTokenXUsed,
      tokenYChange: tokenYChange,
      totalTokenZReceived: totalTokenZReceived,
      finalExchangeRate: totalTokenZReceived / totalTokenXUsed,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      userTokenX: userTokenX.toString(),
      userTokenY: userTokenY.toString(),
      userTokenZ: userTokenZ.toString(),
      poolXYPDA: POOL_XY_PDA.toString(),
      poolYZPDA: POOL_YZ_PDA.toString()
    };

    fs.writeFileSync("multihop-swap-xyz-info.json", JSON.stringify(multihopSwapInfo, null, 2));
    console.log("\n💾 Multihop swap info saved to multihop-swap-xyz-info.json");

  } catch (error) {
    console.error("❌ Error performing multihop swap X → Y → Z:", error);
    throw error;
  }
}

// Run the script
multihopSwapXYZ()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });

