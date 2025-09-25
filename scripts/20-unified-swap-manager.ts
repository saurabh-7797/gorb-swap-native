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

interface RegularPoolSwapInfo {
  poolType: 'regular';
  poolInfo: PoolInfo;
  amountIn: number;
  minAmountOut: number;
  swapDirection: 'A-to-B' | 'B-to-A';
}

interface NativePoolSwapInfo {
  poolType: 'native';
  poolInfo: PoolInfo;
  amountIn: number;
  minAmountOut: number;
  swapDirection: 'SOL-to-Token' | 'Token-to-SOL';
}

type SwapInfo = RegularPoolSwapInfo | NativePoolSwapInfo;

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
 * UNIFIED SWAP MANAGER
 * Performs swaps in either regular pools (Token A ↔ Token B) or native pools (SOL ↔ Token)
 * Uses a single shared function to handle both pool types and both swap directions
 * 
 * @param swapInfo - RegularPoolSwapInfo for regular pools or NativePoolSwapInfo for native pools
 * @returns Transaction signature
 */
async function performSwap(swapInfo: SwapInfo): Promise<string> {
  try {
    const { poolInfo } = swapInfo;
    console.log(`🚀 Performing ${swapInfo.swapDirection} swap in ${poolInfo.poolType} pool...`);
    
    let tokenA: PublicKey;
    let tokenB: PublicKey;
    let amountIn: number;
    let minAmountOut: number;
    let swapDirection: string;
    
    if (swapInfo.poolType === 'regular') {
      // Regular pool: Token A ↔ Token B
      tokenA = new PublicKey(poolInfo.tokenA);
      tokenB = new PublicKey(poolInfo.tokenB);
      amountIn = swapInfo.amountIn;
      minAmountOut = swapInfo.minAmountOut;
      swapDirection = swapInfo.swapDirection;
      
      console.log(`Token A: ${tokenA.toString()}`);
      console.log(`Token B: ${tokenB.toString()}`);
      console.log(`Amount In: ${formatTokenAmount(amountIn)}`);
      console.log(`Min Amount Out: ${formatTokenAmount(minAmountOut)}`);
      console.log(`Direction: ${swapDirection}`);
      
    } else {
      // Native pool: SOL ↔ Token
      tokenA = NATIVE_SOL_MINT; // Native SOL
      tokenB = new PublicKey(poolInfo.tokenB);
      amountIn = swapInfo.amountIn;
      minAmountOut = swapInfo.minAmountOut;
      swapDirection = swapInfo.swapDirection;
      
      console.log(`Native SOL: ${tokenA.toString()}`);
      console.log(`Token: ${tokenB.toString()}`);
      console.log(`Amount In: ${swapDirection.includes('SOL') ? formatTokenAmount(amountIn, 9) + ' SOL' : formatTokenAmount(amountIn)}`);
      console.log(`Min Amount Out: ${swapDirection.includes('SOL') ? formatTokenAmount(minAmountOut) : formatTokenAmount(minAmountOut, 9) + ' SOL'}`);
      console.log(`Direction: ${swapDirection}`);
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
    logBalances(balancesBefore, "BEFORE Swap", poolInfo.poolType);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Determine swap direction and prepare accounts accordingly
    let directionAToB: boolean;
    if (swapInfo.poolType === 'regular') {
      directionAToB = swapInfo.swapDirection === 'A-to-B';
    } else {
      directionAToB = swapInfo.swapDirection === 'SOL-to-Token';
    }
    
    // Prepare accounts based on pool type and swap direction
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true }, // pool_info
      { pubkey: tokenA, isSigner: false, isWritable: false }, // token_a_info
      { pubkey: tokenB, isSigner: false, isWritable: false }, // token_b_info
      { pubkey: vaultA, isSigner: false, isWritable: true }, // vault_a
      { pubkey: vaultB, isSigner: false, isWritable: true }, // vault_b
      // For B-to-A swaps, swap the user token accounts
      directionAToB 
        ? { pubkey: userTokenA, isSigner: false, isWritable: true } // user_in_info (Token A - input)
        : { pubkey: userTokenB, isSigner: false, isWritable: true }, // user_in_info (Token B - input)
      directionAToB 
        ? { pubkey: userTokenB, isSigner: false, isWritable: true } // user_out_info (Token B - output)
        : { pubkey: userTokenA, isSigner: false, isWritable: true }, // user_out_info (Token A - output)
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false }, // user_info
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false }, // ata_program
    ];
    
    // Instruction data (Borsh: Swap { amount_in, direction })
    const data = Buffer.alloc(1 + 8 + 1);
    data.writeUInt8(3, 0); // Swap discriminator (3)
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(directionAToB ? 1 : 0, 9); // boolean as u8
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ ${swapDirection} swap in ${poolInfo.poolType} pool completed successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolInfo.poolType === 'native' 
        ? await connection.getBalance(userKeypair.publicKey)
        : await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesAfter, "AFTER Swap", poolInfo.poolType);
    
    // Save swap info
    const swapResult = {
      poolType: poolInfo.poolType,
      poolPDA: poolInfo.poolPDA,
      swapDirection: swapDirection,
      amountIn: amountIn,
      minAmountOut: minAmountOut,
      transactionSignature: signature,
      timestamp: new Date().toISOString()
    };
    
    const fileName = poolInfo.poolType === 'regular' ? '20-regular-swap-result.json' : '20-native-swap-result.json';
    fs.writeFileSync(fileName, JSON.stringify(swapResult, null, 2));
    console.log(`\n💾 Swap result saved to ${fileName}`);
    
    return signature;
    
  } catch (error) {
    console.error(`❌ Error performing ${swapInfo.swapDirection} swap in ${swapInfo.poolInfo.poolType} pool:`, error);
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
async function performRegularPoolSwapAtoB() {
  console.log("🔄 Performing Regular Pool Swap (Token A → Token B)");
  
  const poolInfo = loadPoolInfo('20-regular-pool-info.json');
  
  const swapInfo: RegularPoolSwapInfo = {
    poolType: 'regular',
    poolInfo,
    amountIn: 10_000_000, // 0.01 Token A
    minAmountOut: 5_000_000, // 0.005 Token B (minimum expected)
    swapDirection: 'A-to-B'
  };
  
  return await performSwap(swapInfo);
}

async function performRegularPoolSwapBtoA() {
  console.log("🔄 Performing Regular Pool Swap (Token B → Token A)");
  
  const poolInfo = loadPoolInfo('20-regular-pool-info.json');
  
  const swapInfo: RegularPoolSwapInfo = {
    poolType: 'regular',
    poolInfo,
    amountIn: 15_000_000, // 0.015 Token B
    minAmountOut: 8_000_000, // 0.008 Token A (minimum expected)
    swapDirection: 'B-to-A'
  };
  
  return await performSwap(swapInfo);
}

async function performNativePoolSwapSOLtoToken() {
  console.log("🔄 Performing Native Pool Swap (SOL → Token)");
  
  const poolInfo = loadPoolInfo('20-native-pool-info.json');
  
  const swapInfo: NativePoolSwapInfo = {
    poolType: 'native',
    poolInfo,
    amountIn: 0.01 * LAMPORTS_PER_SOL, // 0.01 SOL in lamports
    minAmountOut: 20_000_000, // 0.02 Token (minimum expected)
    swapDirection: 'SOL-to-Token'
  };
  
  return await performSwap(swapInfo);
}

async function performNativePoolSwapTokentoSOL() {
  console.log("🔄 Performing Native Pool Swap (Token → SOL)");
  
  const poolInfo = loadPoolInfo('20-native-pool-info.json');
  
  const swapInfo: NativePoolSwapInfo = {
    poolType: 'native',
    poolInfo,
    amountIn: 30_000_000, // 0.03 Token
    minAmountOut: 0.005 * LAMPORTS_PER_SOL, // 0.005 SOL in lamports (minimum expected)
    swapDirection: 'Token-to-SOL'
  };
  
  return await performSwap(swapInfo);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Unified Swap Manager

Usage: npx ts-node 20-unified-swap-manager.ts <operation>

Operations:
  regular-a-to-b    - Swap Token A → Token B in regular pool
  regular-b-to-a    - Swap Token B → Token A in regular pool
  native-sol-to-token - Swap SOL → Token in native pool
  native-token-to-sol - Swap Token → SOL in native pool
  all-regular       - Perform both directions in regular pool
  all-native        - Perform both directions in native pool
  all-swaps         - Perform all swap directions

Prerequisites:
  - 20-regular-pool-info.json must exist (created by pool creation scripts)
  - 20-native-pool-info.json must exist (created by pool creation scripts)
  - Sufficient token balances for swaps
  - User keypair at ${USER_KEYPAIR_PATH}

Examples:
  npx ts-node 20-unified-swap-manager.ts regular-a-to-b
  npx ts-node 20-unified-swap-manager.ts native-sol-to-token
  npx ts-node 20-unified-swap-manager.ts all-swaps
    `);
    process.exit(1);
  }
  
  const operation = args[0];
  
  try {
    if (operation === 'regular-a-to-b') {
      await performRegularPoolSwapAtoB();
      
    } else if (operation === 'regular-b-to-a') {
      await performRegularPoolSwapBtoA();
      
    } else if (operation === 'native-sol-to-token') {
      await performNativePoolSwapSOLtoToken();
      
    } else if (operation === 'native-token-to-sol') {
      await performNativePoolSwapTokentoSOL();
      
    } else if (operation === 'all-regular') {
      console.log("🔄 Performing All Regular Pool Swaps");
      
      // Swap A → B
      console.log("\n1️⃣ Swapping Token A → Token B");
      await performRegularPoolSwapAtoB();
      
      // Swap B → A
      console.log("\n2️⃣ Swapping Token B → Token A");
      await performRegularPoolSwapBtoA();
      
    } else if (operation === 'all-native') {
      console.log("🔄 Performing All Native Pool Swaps");
      
      // Swap SOL → Token
      console.log("\n1️⃣ Swapping SOL → Token");
      await performNativePoolSwapSOLtoToken();
      
      // Swap Token → SOL
      console.log("\n2️⃣ Swapping Token → SOL");
      await performNativePoolSwapTokentoSOL();
      
    } else if (operation === 'all-swaps') {
      console.log("🔄 Performing All Swaps");
      
      // Regular pool swaps
      console.log("\n1️⃣ Regular Pool Swaps");
      console.log("Swapping Token A → Token B");
      await performRegularPoolSwapAtoB();
      
      console.log("\nSwapping Token B → Token A");
      await performRegularPoolSwapBtoA();
      
      // Native pool swaps
      console.log("\n2️⃣ Native Pool Swaps");
      console.log("Swapping SOL → Token");
      await performNativePoolSwapSOLtoToken();
      
      console.log("\nSwapping Token → SOL");
      await performNativePoolSwapTokentoSOL();
      
    } else {
      console.error("❌ Invalid operation. Use 'regular-a-to-b', 'regular-b-to-a', 'native-sol-to-token', 'native-token-to-sol', 'all-regular', 'all-native', or 'all-swaps'");
      process.exit(1);
    }
    
    console.log("\n🎉 Swap operation completed successfully!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { performSwap, RegularPoolSwapInfo, NativePoolSwapInfo, SwapInfo };
