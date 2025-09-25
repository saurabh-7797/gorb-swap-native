import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
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
 * TypeScript Script: Add Liquidity to Pool X-Native SOL
 * This adds more liquidity to the existing X-Native SOL pool
 */
async function addLiquidityXNativeSOL() {
  try {
    console.log("🚀 TypeScript Script: Adding Liquidity to Pool X-Native SOL...");
    
    // Load pool info from existing file
    const poolInfo = JSON.parse(fs.readFileSync('pool-x-native-sol-info.json', 'utf-8'));
    
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Native SOL
    const TOKEN_X_MINT = new PublicKey(poolInfo.tokenB);
    const LP_MINT_PDA = new PublicKey(poolInfo.lpMint);
    const VAULT_SOL = POOL_PDA; // SOL vault is the pool account itself for native SOL pools
    const VAULT_X = new PublicKey(poolInfo.vaultB);
    const USER_TOKEN_SOL = userKeypair.publicKey; // User's main account for SOL
    const USER_TOKEN_X = new PublicKey(poolInfo.userTokenB);
    const USER_LP = new PublicKey(poolInfo.userLP);

    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token SOL Mint: ${TOKEN_SOL_MINT.toString()}`);
    console.log(`Token X Mint: ${TOKEN_X_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT_PDA.toString()}`);
    console.log(`Vault SOL: ${VAULT_SOL.toString()}`);
    console.log(`Vault X: ${VAULT_X.toString()}`);
    console.log(`User Token SOL: ${USER_TOKEN_SOL.toString()}`);
    console.log(`User Token X ATA: ${USER_TOKEN_X.toString()}`);
    console.log(`User LP ATA: ${USER_LP.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenSOLBefore = await connection.getBalance(userKeypair.publicKey);
    const balanceTokenXBefore = await getTokenBalance(USER_TOKEN_X);
    const lpBalanceBefore = await getTokenBalance(USER_LP);
    console.log(`Token SOL: ${balanceTokenSOLBefore / 1e9} SOL (${balanceTokenSOLBefore} lamports)`);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(lpBalanceBefore, 0)} (${lpBalanceBefore} raw)`);

    // Liquidity parameters
    const amountSOL = 0.05 * LAMPORTS_PER_SOL; // 0.05 SOL
    const amountX = 100_000_000; // 0.1 Token X (maintaining 1:2 ratio)
    
    console.log(`\n🏊 Adding Liquidity Parameters:`);
    console.log(`SOL Amount: ${formatTokenAmount(amountSOL, 9)} SOL`);
    console.log(`Token X Amount: ${formatTokenAmount(amountX)} Token X`);
    console.log(`Ratio: 1:2 (maintaining pool ratio)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidity (matching contract order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true }, // pool_info
      { pubkey: TOKEN_SOL_MINT, isSigner: false, isWritable: false }, // token_a_info (SOL)
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false }, // token_b_info (Token X)
      { pubkey: VAULT_SOL, isSigner: false, isWritable: true }, // vault_a (SOL vault - pool account itself)
      { pubkey: VAULT_X, isSigner: false, isWritable: true }, // vault_b (Token X vault)
      { pubkey: LP_MINT_PDA, isSigner: false, isWritable: true }, // lp_mint_info
      { pubkey: USER_TOKEN_SOL, isSigner: false, isWritable: true }, // user_token_a_info (SOL - user's main account)
      { pubkey: USER_TOKEN_X, isSigner: false, isWritable: true }, // user_token_b_info (Token X)
      { pubkey: USER_LP, isSigner: false, isWritable: true }, // user_lp_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true }, // user_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program (required for SOL transfers)
    ];

    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator (1)
    data.writeBigUInt64LE(BigInt(amountSOL), 1);
    data.writeBigUInt64LE(BigInt(amountX), 9);

    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding AddLiquidity instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending add liquidity transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Liquidity added successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log(`\n📊 Balances AFTER Adding Liquidity:`);
    const balanceTokenSOLAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceTokenXAfter = await getTokenBalance(USER_TOKEN_X);
    const lpBalanceAfter = await getTokenBalance(USER_LP);
    console.log(`Token SOL: ${balanceTokenSOLAfter / 1e9} SOL (${balanceTokenSOLAfter} lamports)`);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(lpBalanceAfter, 0)} (${lpBalanceAfter} raw)`);

    // Calculate changes
    const tokenSOLChange = balanceTokenSOLBefore - balanceTokenSOLAfter;
    const tokenXChange = balanceTokenXBefore - balanceTokenXAfter;
    const lpChange = lpBalanceAfter - lpBalanceBefore;
    
    console.log(`\n📈 Changes:`);
    console.log(`SOL Used: ${tokenSOLChange / 1e9} SOL (${tokenSOLChange} lamports)`);
    console.log(`Token X Used: ${formatTokenAmount(tokenXChange)} (${tokenXChange} raw)`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpChange, 0)} (${lpChange} raw)`);

    // Create add liquidity info file
    const addLiquidityInfo = {
      poolPDA: poolInfo.poolPDA,
      tokenSOL: TOKEN_SOL_MINT.toString(),
      tokenX: poolInfo.tokenB,
      amountSOL: amountSOL,
      amountX: amountX,
      lpTokensReceived: lpChange,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      userTokenSOL: USER_TOKEN_SOL.toString(),
      userTokenX: poolInfo.userTokenB,
      userLP: poolInfo.userLP
    };

    fs.writeFileSync("add-liquidity-x-native-sol-info.json", JSON.stringify(addLiquidityInfo, null, 2));
    console.log("\n💾 Add liquidity info saved to add-liquidity-x-native-sol-info.json");

    // Update pool info file
    const updatedPoolInfo = {
      ...poolInfo,
      lastLiquidityAdd: {
        amountSOL: amountSOL,
        amountX: amountX,
        lpTokensReceived: lpChange,
        transactionSignature: signature,
        timestamp: new Date().toISOString()
      }
    };

    fs.writeFileSync("pool-x-native-sol-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("💾 Pool info updated with liquidity addition details");

  } catch (error) {
    console.error("❌ Error adding liquidity to pool X-Native SOL:", error);
    throw error;
  }
}

// Run the script
addLiquidityXNativeSOL()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });

