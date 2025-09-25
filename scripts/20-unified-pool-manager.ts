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

// Types
interface PoolConfig {
  poolType: 'regular' | 'native';
  tokenA: PublicKey;
  tokenB: PublicKey;
  poolPDA: PublicKey;
  lpMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  userTokenA: PublicKey;
  userTokenB: PublicKey;
  userLP: PublicKey;
}

interface TokenInfo {
  mint: string;
  userATA: string;
  amount: number;
  decimals: number;
}

// Consistent naming with liquidity manager
interface RegularPoolInfo {
  poolType: 'regular';
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

interface NativePoolInfo {
  poolType: 'native';
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

type PoolInfo = RegularPoolInfo | NativePoolInfo;

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
 * UNIFIED POOL MANAGER
 * Creates either a regular pool (Token A ↔ Token B) or native pool (SOL ↔ Token)
 * Uses a single shared function to handle both pool types
 * 
 * @param poolType - 'regular' for Token A ↔ Token B, 'native' for SOL ↔ Token
 * @param tokenAInfo - Token A information (for regular pools) or null (for native pools)
 * @param tokenBInfo - Token B information (for regular pools) or Token information (for native pools)
 * @returns PoolConfig with all pool information
 */
async function createPool(
  poolType: 'regular' | 'native',
  tokenAInfo: TokenInfo | null,
  tokenBInfo: TokenInfo
): Promise<PoolConfig> {
  try {
    console.log(`🚀 Creating ${poolType} pool...`);
    
    let tokenA: PublicKey;
    let tokenB: PublicKey;
    let amountA: number;
    let amountB: number;
    
    if (poolType === 'regular') {
      // Regular pool: Token A ↔ Token B
      if (!tokenAInfo) {
        throw new Error("tokenAInfo is required for regular pools");
      }
      
      tokenA = new PublicKey(tokenAInfo.mint);
      tokenB = new PublicKey(tokenBInfo.mint);
      amountA = tokenAInfo.amount;
      amountB = tokenBInfo.amount;
      
      console.log(`Token A: ${tokenA.toString()}`);
      console.log(`Token B: ${tokenB.toString()}`);
      console.log(`Amount A: ${formatTokenAmount(amountA)}`);
      console.log(`Amount B: ${formatTokenAmount(amountB)}`);
      
    } else {
      // Native pool: SOL ↔ Token
      tokenA = NATIVE_SOL_MINT; // Native SOL
      tokenB = new PublicKey(tokenBInfo.mint);
      amountA = 1_000_000_000; // 1 SOL in lamports
      amountB = tokenBInfo.amount;
      
      console.log(`Native SOL: ${tokenA.toString()}`);
      console.log(`Token: ${tokenB.toString()}`);
      console.log(`SOL Amount: ${formatTokenAmount(amountA, 9)} SOL`);
      console.log(`Token Amount: ${formatTokenAmount(amountB)}`);
    }
    
    // Derive PDAs based on pool type
    let poolPDA: PublicKey;
    let lpMint: PublicKey;
    let vaultA: PublicKey;
    let vaultB: PublicKey;
    
    if (poolType === 'regular') {
      // Regular pool PDAs
      [poolPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
        AMM_PROGRAM_ID
      );
      
      [lpMint] = await PublicKey.findProgramAddress(
        [Buffer.from("mint"), poolPDA.toBuffer()],
        AMM_PROGRAM_ID
      );
      
      [vaultA] = await PublicKey.findProgramAddress(
        [Buffer.from("vault"), poolPDA.toBuffer(), tokenA.toBuffer()],
        AMM_PROGRAM_ID
      );
      
      [vaultB] = await PublicKey.findProgramAddress(
        [Buffer.from("vault"), poolPDA.toBuffer(), tokenB.toBuffer()],
        AMM_PROGRAM_ID
      );
      
    } else {
      // Native pool PDAs
      [poolPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("native_sol_pool"), tokenB.toBuffer()],
        AMM_PROGRAM_ID
      );
      
      [lpMint] = await PublicKey.findProgramAddress(
        [Buffer.from("native_sol_lp_mint"), poolPDA.toBuffer()],
        AMM_PROGRAM_ID
      );
      
      vaultA = poolPDA; // SOL vault is the pool account itself
      
      [vaultB] = await PublicKey.findProgramAddress(
        [Buffer.from("native_sol_vault"), poolPDA.toBuffer(), tokenB.toBuffer()],
        AMM_PROGRAM_ID
      );
    }
    
    // Create user token accounts
    const userTokenA = poolType === 'native' 
      ? userKeypair.publicKey // SOL account
      : new PublicKey(tokenAInfo!.userATA);
    
    const userTokenB = new PublicKey(tokenBInfo.userATA);
    const userLP = getAssociatedTokenAddressSync(lpMint, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`LP Mint: ${lpMint.toString()}`);
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault B: ${vaultB.toString()}`);
    console.log(`User Token A: ${userTokenA.toString()}`);
    console.log(`User Token B: ${userTokenB.toString()}`);
    console.log(`User LP: ${userLP.toString()}`);
    
    // Check balances before
    const balancesBefore = {
      tokenA: poolType === 'native' 
        ? await connection.getBalance(userKeypair.publicKey)
        : await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: 0
    };
    logBalances(balancesBefore, "BEFORE Pool Creation", poolType);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Prepare accounts based on pool type
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: false },
      { pubkey: tokenB, isSigner: false, isWritable: false },
      { pubkey: vaultA, isSigner: false, isWritable: true },
      { pubkey: vaultB, isSigner: false, isWritable: true },
      { pubkey: lpMint, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: poolType === 'native' },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    
    // Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(0, 0); // InitPool discriminator
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
    
    console.log(`✅ ${poolType} pool created successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolType === 'native' 
        ? await connection.getBalance(userKeypair.publicKey)
        : await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesAfter, "AFTER Pool Creation", poolType);
    
    // Create pool config
    const poolConfig: PoolConfig = {
      poolType,
      tokenA,
      tokenB,
      poolPDA,
      lpMint,
      vaultA,
      vaultB,
      userTokenA,
      userTokenB,
      userLP
    };
    
    // Save pool info
    const poolInfo = {
      ...poolConfig,
      poolType,
      tokenA: poolConfig.tokenA.toString(),
      tokenB: poolConfig.tokenB.toString(),
      poolPDA: poolConfig.poolPDA.toString(),
      lpMint: poolConfig.lpMint.toString(),
      vaultA: poolConfig.vaultA.toString(),
      vaultB: poolConfig.vaultB.toString(),
      userTokenA: poolConfig.userTokenA.toString(),
      userTokenB: poolConfig.userTokenB.toString(),
      userLP: poolConfig.userLP.toString(),
      transactionSignature: signature,
      timestamp: new Date().toISOString()
    };
    
    const fileName = poolType === 'regular' ? '20-regular-pool-info.json' : '20-native-pool-info.json';
    fs.writeFileSync(fileName, JSON.stringify(poolInfo, null, 2));
    console.log(`\n💾 Pool info saved to ${fileName}`);
    
    return poolConfig;
    
  } catch (error) {
    console.error(`❌ Error creating ${poolType} pool:`, error);
    throw error;
  }
}

// Helper function to load token info from JSON files
function loadTokenInfo(fileName: string): TokenInfo {
  try {
    const data = fs.readFileSync(fileName, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load token info from ${fileName}: ${error}`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Unified Pool Manager

Usage: npx ts-node 20-unified-pool-manager.ts <operation>

Operations:
  regular-pool      - Create regular pool (Token A ↔ Token B)
  regular-pool-bc   - Create regular pool (Token B ↔ Token C)
  native-pool-a     - Create native pool (SOL ↔ Token A)
  native-pool-b     - Create native pool (SOL ↔ Token B)
  native-pool-c     - Create native pool (SOL ↔ Token C)
  all-pools         - Create all pools (regular A-B, regular B-C, and all native pools)

Prerequisites:
  - 20-token-a-info.json must exist (created by 20-create-token-a.ts)
  - 20-token-b-info.json must exist (created by 20-create-token-b.ts)
  - 20-token-c-info.json must exist (created by 20-create-token-c.ts)
  - Sufficient SOL balance for transactions
  - User keypair at ${USER_KEYPAIR_PATH}

Examples:
  npx ts-node 20-unified-pool-manager.ts regular-pool
  npx ts-node 20-unified-pool-manager.ts regular-pool-bc
  npx ts-node 20-unified-pool-manager.ts native-pool-c
  npx ts-node 20-unified-pool-manager.ts all-pools
    `);
    process.exit(1);
  }
  
  const operation = args[0];
  
  try {
    if (operation === 'regular-pool') {
      console.log("🔄 Creating Regular Pool (Token A ↔ Token B)");
      const tokenAInfo = loadTokenInfo('20-token-a-info.json');
      const tokenBInfo = loadTokenInfo('20-token-b-info.json');
      
      // Use only small amounts for initial liquidity, keep rest for future use
      const regularTokenAInfo = { ...tokenAInfo, amount: 100_000_000 }; // 0.1 tokens
      const regularTokenBInfo = { ...tokenBInfo, amount: 150_000_000 }; // 0.15 tokens
      
      await createPool('regular', regularTokenAInfo, regularTokenBInfo);
      
    } else if (operation === 'native-pool-a') {
      console.log("🔄 Creating Native Pool (SOL ↔ Token A)");
      const tokenAInfo = loadTokenInfo('20-token-a-info.json');
      
      // Use only small amount for initial liquidity, keep rest for future use
      const nativeTokenAInfo = { ...tokenAInfo, amount: 200_000_000 }; // 0.2 tokens
      
      await createPool('native', null, nativeTokenAInfo);
      
    } else if (operation === 'native-pool-b') {
      console.log("🔄 Creating Native Pool (SOL ↔ Token B)");
      const tokenBInfo = loadTokenInfo('20-token-b-info.json');
      
      // Use only small amount for initial liquidity, keep rest for future use
      const nativeTokenBInfo = { ...tokenBInfo, amount: 300_000_000 }; // 0.3 tokens
      
      await createPool('native', null, nativeTokenBInfo);
      
    } else if (operation === 'regular-pool-bc') {
      console.log("🔄 Creating Regular Pool (Token B ↔ Token C)");
      
      // Load token info
      const tokenBInfo = loadTokenInfo('20-token-b-info.json');
      const tokenCInfo = loadTokenInfo('20-token-c-info.json');
      
      // Use only small amount for initial liquidity, keep rest for future use
      const regularTokenBInfo = { ...tokenBInfo, amount: 100_000_000 }; // 0.1 tokens
      const regularTokenCInfo = { ...tokenCInfo, amount: 150_000_000 }; // 0.15 tokens
      
      await createPool('regular', regularTokenBInfo, regularTokenCInfo);
      
    } else if (operation === 'native-pool-c') {
      console.log("🔄 Creating Native Pool (SOL ↔ Token C)");
      
      // Load token info
      const tokenCInfo = loadTokenInfo('20-token-c-info.json');
      
      // Use only small amount for initial liquidity, keep rest for future use
      const nativeTokenCInfo = { ...tokenCInfo, amount: 200_000_000 }; // 0.2 tokens
      
      await createPool('native', null, nativeTokenCInfo);
      
    } else if (operation === 'all-pools') {
      console.log("🔄 Creating All Pools");
      
      // Load token info
      const tokenAInfo = loadTokenInfo('20-token-a-info.json');
      const tokenBInfo = loadTokenInfo('20-token-b-info.json');
      const tokenCInfo = loadTokenInfo('20-token-c-info.json');
      
      // Create regular pool A-B
      console.log("\n1️⃣ Creating Regular Pool (Token A ↔ Token B)");
      const regularTokenAInfo = { ...tokenAInfo, amount: 100_000_000 }; // 0.1 tokens
      const regularTokenBInfo = { ...tokenBInfo, amount: 150_000_000 }; // 0.15 tokens
      await createPool('regular', regularTokenAInfo, regularTokenBInfo);
      
      // Create regular pool B-C
      console.log("\n2️⃣ Creating Regular Pool (Token B ↔ Token C)");
      const regularTokenBInfo2 = { ...tokenBInfo, amount: 100_000_000 }; // 0.1 tokens
      const regularTokenCInfo = { ...tokenCInfo, amount: 150_000_000 }; // 0.15 tokens
      await createPool('regular', regularTokenBInfo2, regularTokenCInfo);
      
      // Create native pool A
      console.log("\n3️⃣ Creating Native Pool (SOL ↔ Token A)");
      const nativeTokenAInfo = { ...tokenAInfo, amount: 200_000_000 }; // 0.2 tokens
      await createPool('native', null, nativeTokenAInfo);
      
      // Create native pool B
      console.log("\n4️⃣ Creating Native Pool (SOL ↔ Token B)");
      const nativeTokenBInfo = { ...tokenBInfo, amount: 300_000_000 }; // 0.3 tokens
      await createPool('native', null, nativeTokenBInfo);
      
      // Create native pool C
      console.log("\n5️⃣ Creating Native Pool (SOL ↔ Token C)");
      const nativeTokenCInfo = { ...tokenCInfo, amount: 200_000_000 }; // 0.2 tokens
      await createPool('native', null, nativeTokenCInfo);
      
    } else {
      console.error("❌ Invalid operation. Use 'regular-pool', 'regular-pool-bc', 'native-pool-a', 'native-pool-b', 'native-pool-c', or 'all-pools'");
      process.exit(1);
    }
    
    console.log("\n🎉 Operation completed successfully!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { createPool, PoolConfig, TokenInfo, RegularPoolInfo, NativePoolInfo, PoolInfo };
