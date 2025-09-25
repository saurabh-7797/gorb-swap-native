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
  createTransferInstruction,
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

// Types
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

interface RegularPoolLiquidityInfo {
  poolType: 'regular';
  poolInfo: PoolInfo;
  amountA: number;
  amountB: number;
}

interface NativePoolLiquidityInfo {
  poolType: 'native';
  poolInfo: PoolInfo;
  amountA: number; // SOL amount in lamports
  amountB: number; // Token amount
}

type LiquidityInfo = RegularPoolLiquidityInfo | NativePoolLiquidityInfo;

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
 * UNIFIED LIQUIDITY MANAGER
 * Adds liquidity to either a regular pool (Token A ↔ Token B) or native pool (SOL ↔ Token)
 * Uses a single shared function to handle both pool types
 * 
 * @param liquidityInfo - RegularLiquidityInfo for regular pools or NativeLiquidityInfo for native pools
 * @returns Transaction signature
 */
async function addLiquidity(liquidityInfo: LiquidityInfo): Promise<string> {
  try {
    const { poolInfo } = liquidityInfo;
    console.log(`🚀 Adding liquidity to ${poolInfo.poolType} pool...`);
    
    let tokenA: PublicKey;
    let tokenB: PublicKey;
    let amountA: number;
    let amountB: number;
    
    if (liquidityInfo.poolType === 'regular') {
      // Regular pool: Token A ↔ Token B
      tokenA = new PublicKey(poolInfo.tokenA);
      tokenB = new PublicKey(poolInfo.tokenB);
      amountA = liquidityInfo.amountA;
      amountB = liquidityInfo.amountB;
      
      console.log(`Token A: ${tokenA.toString()}`);
      console.log(`Token B: ${tokenB.toString()}`);
      console.log(`Amount A: ${formatTokenAmount(amountA)}`);
      console.log(`Amount B: ${formatTokenAmount(amountB)}`);
      
    } else {
      // Native pool: SOL ↔ Token
      tokenA = NATIVE_SOL_MINT; // Native SOL
      tokenB = new PublicKey(poolInfo.tokenB);
      amountA = liquidityInfo.amountA; // SOL amount in lamports
      amountB = liquidityInfo.amountB; // Token amount
      
      console.log(`Native SOL: ${tokenA.toString()}`);
      console.log(`Token: ${tokenB.toString()}`);
      console.log(`SOL Amount: ${formatTokenAmount(amountA, 9)} SOL`);
      console.log(`Token Amount: ${formatTokenAmount(amountB)}`);
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
    logBalances(balancesBefore, "BEFORE Adding Liquidity", poolInfo.poolType);
    
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
      { pubkey: userTokenA, isSigner: false, isWritable: true }, // user_token_a_info
      { pubkey: userTokenB, isSigner: false, isWritable: true }, // user_token_b_info
      { pubkey: userLP, isSigner: false, isWritable: true }, // user_lp_info
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true }, // user_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ];
    
    // Add SystemProgram for native pools
    if (poolInfo.poolType === 'native') {
      accounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }); // system_program
    }
    
    // Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountB), 9);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Liquidity added to ${poolInfo.poolType} pool successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolInfo.poolType === 'native' 
        ? await connection.getBalance(userKeypair.publicKey)
        : await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesAfter, "AFTER Adding Liquidity", poolInfo.poolType);
    
    // Save liquidity info
    const liquidityResult = {
      poolType: poolInfo.poolType,
      poolPDA: poolInfo.poolPDA,
      addedAmountA: amountA,
      addedAmountB: amountB,
      transactionSignature: signature,
      timestamp: new Date().toISOString()
    };
    
    const fileName = poolInfo.poolType === 'regular' ? '20-regular-liquidity-added.json' : '20-native-liquidity-added.json';
    fs.writeFileSync(fileName, JSON.stringify(liquidityResult, null, 2));
    console.log(`\n💾 Liquidity info saved to ${fileName}`);
    
    return signature;
    
  } catch (error) {
    console.error(`❌ Error adding liquidity to ${liquidityInfo.poolInfo.poolType} pool:`, error);
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
async function addRegularPoolLiquidity() {
  console.log("🔄 Adding Liquidity to Regular Pool (Token A ↔ Token B)");
  
  const poolInfo = loadPoolInfo('20-regular-pool-info.json');
  
  const liquidityInfo: RegularPoolLiquidityInfo = {
    poolType: 'regular',
    poolInfo,
    amountA: 50_000_000, // 0.05 Token A
    amountB: 75_000_000  // 0.075 Token B
  };
  
  return await addLiquidity(liquidityInfo);
}

async function addNativePoolLiquidity() {
  console.log("🔄 Adding Liquidity to Native Pool (SOL ↔ Token)");
  
  const poolInfo = loadPoolInfo('20-native-pool-info.json');
  
  const liquidityInfo: NativePoolLiquidityInfo = {
    poolType: 'native',
    poolInfo,
    amountA: 0.05 * LAMPORTS_PER_SOL, // 0.05 SOL in lamports
    amountB: 100_000_000 // 0.1 Token
  };
  
  return await addLiquidity(liquidityInfo);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Unified Liquidity Manager

Usage: npx ts-node 20-unified-liquidity-manager.ts <operation>

Operations:
  regular    - Add liquidity to regular pool (Token A ↔ Token B)
  native     - Add liquidity to native pool (SOL ↔ Token)
  both       - Add liquidity to both pools

Prerequisites:
  - 20-regular-pool-info.json must exist (created by pool creation scripts)
  - 20-native-pool-info.json must exist (created by pool creation scripts)
  - Sufficient token balances for liquidity
  - User keypair at ${USER_KEYPAIR_PATH}

Examples:
  npx ts-node 20-unified-liquidity-manager.ts regular
  npx ts-node 20-unified-liquidity-manager.ts native
  npx ts-node 20-unified-liquidity-manager.ts both
    `);
    process.exit(1);
  }
  
  const operation = args[0];
  
  try {
    if (operation === 'regular') {
      await addRegularPoolLiquidity();
      
    } else if (operation === 'native') {
      await addNativePoolLiquidity();
      
    } else if (operation === 'both') {
      console.log("🔄 Adding Liquidity to Both Pools");
      
      // Add liquidity to regular pool
      console.log("\n1️⃣ Adding Liquidity to Regular Pool");
      await addRegularPoolLiquidity();
      
      // Add liquidity to native pool
      console.log("\n2️⃣ Adding Liquidity to Native Pool");
      await addNativePoolLiquidity();
      
    } else {
      console.error("❌ Invalid operation. Use 'regular', 'native', or 'both'");
      process.exit(1);
    }
    
    console.log("\n🎉 Liquidity addition completed successfully!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { addLiquidity, RegularPoolLiquidityInfo, NativePoolLiquidityInfo, LiquidityInfo };
