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
 * TypeScript Script: Remove Liquidity from Native SOL Pool
 */
async function removeLiquidityFromNativeSOLPool() {
  try {
    console.log("🔥 Removing Liquidity from Native SOL Pool...");
    
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

    // Check balances before removing liquidity
    console.log("\n📊 Balances BEFORE Removing Liquidity:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const nativeSOLBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    const balanceLPBefore = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceBefore / 1e9} SOL (${nativeSOLBalanceBefore} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Remove liquidity parameters
    const lpAmountToRemove = 100_000_000; // 0.1 LP tokens (10% of current LP)
    
    console.log(`\n🔥 Removing Liquidity Parameters:`);
    console.log(`LP tokens to remove: ${formatTokenAmount(lpAmountToRemove)} LP tokens`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for RemoveLiquidityNativeSOL (matching Rust program order)
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

    // Instruction data (Borsh: RemoveLiquidityNativeSOL { lp_amount })
    const data = Buffer.alloc(1 + 8); // 1 byte discriminator + 1x u64
    data.writeUInt8(15, 0); // RemoveLiquidityNativeSOL discriminator (index 15 in enum)
    data.writeBigUInt64LE(BigInt(lpAmountToRemove), 1); // lp_amount
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add RemoveLiquidityNativeSOL instruction
    console.log("📝 Adding RemoveLiquidityNativeSOL instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending remove liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Liquidity removed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after removing liquidity
    console.log("\n📊 Balances AFTER Removing Liquidity:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const nativeSOLBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Native SOL: ${nativeSOLBalanceAfter / 1e9} SOL (${nativeSOLBalanceAfter} lamports)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const solChange = nativeSOLBalanceAfter - nativeSOLBalanceBefore;
    const lpChange = balanceLPBefore - balanceLPAfter;
    
    console.log(`\n📈 Changes:`);
    console.log(`Token A received: ${formatTokenAmount(tokenAChange)}`);
    console.log(`SOL received: ${solChange / 1e9} SOL`);
    console.log(`LP tokens burned: ${formatTokenAmount(lpChange)}`);

    // Update pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastRemoveLiquiditySignature: signature,
      lastRemoveLiquidityAmount: lpAmountToRemove,
    };

    fs.writeFileSync("pool-a-native-sol-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Pool info updated with remove liquidity details");

  } catch (error) {
    console.error("❌ Error removing liquidity from native SOL pool:", error);
    throw error;
  }
}

// Run the function
removeLiquidityFromNativeSOLPool().catch(console.error);