import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
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
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Types - Consistent naming with other managers
interface PoolInfo {
  poolType: 'regular' | 'native';
  tokenA: string;
  tokenB: string;
  poolPDA: string;
  lpMint: string;
  vaultA: string;
  vaultB: string;
  userTokenA: string;
  userTokenB: string;
  userLP: string;
}

interface RegularPoolRemoveLiquidityInfo {
  poolType: 'regular';
  poolInfo: PoolInfo;
  lpAmount: number; // Amount of LP tokens to burn
}

interface NativePoolRemoveLiquidityInfo {
  poolType: 'native';
  poolInfo: PoolInfo;
  lpAmount: number; // Amount of LP tokens to burn
}

type RemoveLiquidityInfo = RegularPoolRemoveLiquidityInfo | NativePoolRemoveLiquidityInfo;

// Helper functions
async function getTokenBalance(tokenAccount: PublicKey): Promise<number> {
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
    return Number(account.amount);
  } catch (error) {
    return 0;
  }
}

function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

function logBalances(balances: any, operation: string, poolType: 'regular' | 'native') {
  console.log(`\n📊 Balances ${operation}:`);
  if (poolType === 'native' && balances.sol !== undefined) {
    console.log(`Native SOL: ${balances.sol / 1e9} SOL (${balances.sol} lamports)`);
  }
  if (balances.tokenA !== undefined) {
    console.log(`Token A: ${formatTokenAmount(balances.tokenA)} (${balances.tokenA} raw)`);
  }
  if (balances.tokenB !== undefined) {
    console.log(`Token B: ${formatTokenAmount(balances.tokenB)} (${balances.tokenB} raw)`);
  }
  if (balances.lp !== undefined) {
    console.log(`LP Tokens: ${formatTokenAmount(balances.lp, 0)} (${balances.lp} raw)`);
  }
}

/**
 * UNIFIED REMOVE LIQUIDITY MANAGER
 * Removes liquidity from either regular pools (Token A ↔ Token B) or native pools (SOL ↔ Token)
 * Uses a single shared function to handle both pool types
 * 
 * @param removeLiquidityInfo - RegularPoolRemoveLiquidityInfo for regular pools or NativePoolRemoveLiquidityInfo for native pools
 * @returns Transaction signature
 */
async function removeLiquidity(removeLiquidityInfo: RemoveLiquidityInfo): Promise<string> {
  try {
    const { poolInfo } = removeLiquidityInfo;
    console.log(`🚀 Removing liquidity from ${poolInfo.poolType} pool...`);
    
    let tokenA: PublicKey;
    let tokenB: PublicKey;
    let lpAmount: number;
    
    if (removeLiquidityInfo.poolType === 'regular') {
      // Regular pool: Token A ↔ Token B
      tokenA = new PublicKey(poolInfo.tokenA);
      tokenB = new PublicKey(poolInfo.tokenB);
      lpAmount = removeLiquidityInfo.lpAmount;
      
      console.log(`Token A: ${tokenA.toString()}`);
      console.log(`Token B: ${tokenB.toString()}`);
      console.log(`LP Amount: ${formatTokenAmount(lpAmount, 0)} LP tokens`);
      
    } else {
      // Native pool: SOL ↔ Token
      tokenA = NATIVE_SOL_MINT; // Native SOL
      tokenB = new PublicKey(poolInfo.tokenB);
      lpAmount = removeLiquidityInfo.lpAmount;
      
      console.log(`Native SOL: ${tokenA.toString()}`);
      console.log(`Token: ${tokenB.toString()}`);
      console.log(`LP Amount: ${formatTokenAmount(lpAmount, 0)} LP tokens`);
    }
    
    // Get pool addresses
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const lpMint = new PublicKey(poolInfo.lpMint);
    const vaultA = new PublicKey(poolInfo.vaultA);
    const vaultB = new PublicKey(poolInfo.vaultB);
    const userTokenA = new PublicKey(poolInfo.userTokenA);
    const userTokenB = new PublicKey(poolInfo.userTokenB);
    const userLP = new PublicKey(poolInfo.userLP);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`LP Mint: ${lpMint.toString()}`);
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault B: ${vaultB.toString()}`);
    console.log(`User Token A: ${userTokenA.toString()}`);
    console.log(`User Token B: ${userTokenB.toString()}`);
    console.log(`User LP: ${userLP.toString()}`);
    
    // Check balances before
    const balancesBefore = {
      tokenA: poolInfo.poolType === 'native' 
        ? await connection.getBalance(userKeypair.publicKey)
        : await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesBefore, "BEFORE Removing Liquidity", poolInfo.poolType);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Prepare accounts based on pool type (matching working script structure)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true }, // pool_info
      { pubkey: tokenA, isSigner: false, isWritable: false }, // token_a_info
      { pubkey: tokenB, isSigner: false, isWritable: false }, // token_b_info
      { pubkey: vaultA, isSigner: false, isWritable: true }, // vault_a
      { pubkey: vaultB, isSigner: false, isWritable: true }, // vault_b
      { pubkey: lpMint, isSigner: false, isWritable: true }, // lp_mint_info
      { pubkey: userLP, isSigner: false, isWritable: true }, // user_lp_info
      { pubkey: userTokenA, isSigner: false, isWritable: true }, // user_token_a_info
      { pubkey: userTokenB, isSigner: false, isWritable: true }, // user_token_b_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false }, // user_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ata_program
    ];
    
    // Instruction data (Borsh: RemoveLiquidity { lp_amount })
    const data = Buffer.alloc(1 + 8);
    data.writeUInt8(2, 0); // RemoveLiquidity discriminator (2)
    data.writeBigUInt64LE(BigInt(lpAmount), 1);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Liquidity removed from ${poolInfo.poolType} pool successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolInfo.poolType === 'native' 
        ? await connection.getBalance(userKeypair.publicKey)
        : await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesAfter, "AFTER Removing Liquidity", poolInfo.poolType);
    
    // Save remove liquidity info
    const removeLiquidityResult = {
      poolType: poolInfo.poolType,
      poolPDA: poolInfo.poolPDA,
      removedLpAmount: lpAmount,
      transactionSignature: signature,
      timestamp: new Date().toISOString()
    };
    
    const fileName = poolInfo.poolType === 'regular' ? '20-regular-remove-liquidity-result.json' : '20-native-remove-liquidity-result.json';
    fs.writeFileSync(fileName, JSON.stringify(removeLiquidityResult, null, 2));
    console.log(`\n💾 Remove liquidity result saved to ${fileName}`);
    
    return signature;
    
  } catch (error) {
    console.error(`❌ Error removing liquidity from ${removeLiquidityInfo.poolInfo.poolType} pool:`, error);
    throw error;
  }
}

// Helper function to load pool info from JSON files
function loadPoolInfo(fileName: string): PoolInfo {
  try {
    const data = fs.readFileSync(fileName, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load pool info from ${fileName}: ${error}`);
  }
}

// Example usage functions
async function removeRegularPoolLiquidity() {
  console.log("🔄 Removing Liquidity from Regular Pool (Token A ↔ Token B)");
  
  const poolInfo = loadPoolInfo('20-regular-pool-info.json');
  
  const removeLiquidityInfo: RegularPoolRemoveLiquidityInfo = {
    poolType: 'regular',
    poolInfo,
    lpAmount: 10_000_000 // 10M LP tokens (small amount for testing)
  };
  
  return await removeLiquidity(removeLiquidityInfo);
}

async function removeNativePoolLiquidity() {
  console.log("🔄 Removing Liquidity from Native Pool (SOL ↔ Token)");
  
  const poolInfo = loadPoolInfo('20-native-pool-info.json');
  
  const removeLiquidityInfo: NativePoolRemoveLiquidityInfo = {
    poolType: 'native',
    poolInfo,
    lpAmount: 5_000_000 // 5M LP tokens (small amount for testing)
  };
  
  return await removeLiquidity(removeLiquidityInfo);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Unified Remove Liquidity Manager

Usage: npx ts-node 20-unified-remove-liquidity-manager.ts <operation>

Operations:
  regular    - Remove liquidity from regular pool (Token A ↔ Token B)
  native     - Remove liquidity from native pool (SOL ↔ Token)
  both       - Remove liquidity from both pools

Prerequisites:
  - 20-regular-pool-info.json must exist (created by pool creation scripts)
  - 20-native-pool-info.json must exist (created by pool creation scripts)
  - Sufficient LP token balances for removal
  - User keypair at ${USER_KEYPAIR_PATH}

Examples:
  npx ts-node 20-unified-remove-liquidity-manager.ts regular
  npx ts-node 20-unified-remove-liquidity-manager.ts native
  npx ts-node 20-unified-remove-liquidity-manager.ts both
    `);
    process.exit(1);
  }
  
  const operation = args[0];
  
  try {
    if (operation === 'regular') {
      await removeRegularPoolLiquidity();
      
    } else if (operation === 'native') {
      await removeNativePoolLiquidity();
      
    } else if (operation === 'both') {
      console.log("🔄 Removing Liquidity from Both Pools");
      
      // Remove liquidity from regular pool
      console.log("\n1️⃣ Removing Liquidity from Regular Pool");
      await removeRegularPoolLiquidity();
      
      // Remove liquidity from native pool
      console.log("\n2️⃣ Removing Liquidity from Native Pool");
      await removeNativePoolLiquidity();
      
    } else {
      console.error("❌ Invalid operation. Use 'regular', 'native', or 'both'");
      process.exit(1);
    }
    
    console.log("\n🎉 Remove liquidity operation completed successfully!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { removeLiquidity, RegularPoolRemoveLiquidityInfo, NativePoolRemoveLiquidityInfo, RemoveLiquidityInfo };
