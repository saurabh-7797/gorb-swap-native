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
 * TypeScript Script: Add Liquidity to Native SOL Pool
 * This adds liquidity to the existing native SOL pool
 */
async function addLiquidityToNativeSOLPool() {
  try {
    console.log("🚀 Adding Liquidity to Native SOL Pool...");
    
    // Load pool info
    const poolInfo = JSON.parse(fs.readFileSync('pool-a-native-sol-info.json', 'utf-8'));
    
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_A_MINT = new PublicKey(poolInfo.tokenA);
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const POOL_TOKEN_VAULT = new PublicKey(poolInfo.poolTokenVault);
    
    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);
    console.log(`Pool Token Vault: ${POOL_TOKEN_VAULT.toString()}`);

    // User ATAs
    const userTokenA = new PublicKey(poolInfo.userTokenA);
    const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const nativeSOLBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    const balanceLPBefore = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceBefore / 1e9} SOL (${nativeSOLBalanceBefore} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Add liquidity parameters (maintaining 1:1 ratio) - using minimal amounts for testing
    const amountSOL = 1_000_000; // 0.001 SOL  
    const amountTokenA = 1_000_000; // 0.001 Token A
    
    console.log(`\n🏊 Adding Liquidity Parameters:`);
    console.log(`SOL to add: ${amountSOL / 1e9} SOL`);
    console.log(`Token A to add: ${formatTokenAmount(amountTokenA)} Token A`);
    console.log(`Ratio: 1:1 (maintaining pool ratio)`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for AddLiquidityNativeSOL (matching Rust program order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },                    // pool_info
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },             // token_mint_info
      { pubkey: POOL_TOKEN_VAULT, isSigner: false, isWritable: true },          // pool_token_vault
      { pubkey: LP_MINT, isSigner: false, isWritable: true },                   // lp_mint_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },      // user_info
      { pubkey: userTokenA, isSigner: false, isWritable: true },                // user_token_account
      { pubkey: userLP, isSigner: false, isWritable: true },                    // user_lp_account
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },     // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
    ];

    // Instruction data (Borsh: AddLiquidityNativeSOL { amount_sol, amount_token })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(14, 0); // AddLiquidityNativeSOL discriminator (index 14 in enum)
    data.writeBigUInt64LE(BigInt(amountSOL), 1); // amount_sol
    data.writeBigUInt64LE(BigInt(amountTokenA), 9); // amount_token
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add AddLiquidityNativeSOL instruction
    console.log("📝 Adding AddLiquidityNativeSOL instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending add liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Liquidity added successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const nativeSOLBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceAfter / 1e9} SOL (${nativeSOLBalanceAfter} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenAChange = balanceTokenABefore - balanceTokenAAfter;
    const solChange = nativeSOLBalanceBefore - nativeSOLBalanceAfter;
    const lpChange = balanceLPAfter - balanceLPBefore;
    
    console.log(`\n📈 Changes:`);
    console.log(`Token A spent: ${formatTokenAmount(tokenAChange)}`);
    console.log(`SOL spent: ${solChange / 1e9} SOL`);
    console.log(`LP tokens received: ${formatTokenAmount(lpChange)}`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastAddLiquiditySignature: signature,
      lastAddLiquidityAmountSOL: amountSOL,
      lastAddLiquidityAmountTokenA: amountTokenA,
    };

    fs.writeFileSync("pool-a-native-sol-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Pool info updated with add liquidity details");

  } catch (error) {
    console.error("❌ Error adding liquidity to native SOL pool:", error);
    throw error;
  }
}

// Run the function
addLiquidityToNativeSOLPool().catch(console.error);