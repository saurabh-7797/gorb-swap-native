import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
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

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

// Helper function to get token account balance
async function getTokenBalance(tokenAccount: PublicKey): Promise<number> {
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
    return Number(account.amount);
  } catch (error) {
    return 0;
  }
}

// Helper function to get token mint info
async function getTokenMintInfo(mint: PublicKey) {
  try {
    const mintInfo = await connection.getParsedAccountInfo(mint);
    if (mintInfo.value && mintInfo.value.data && 'parsed' in mintInfo.value.data) {
      return mintInfo.value.data.parsed.info;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Get pool information from on-chain data
async function getPoolInfo(poolPDA: PublicKey) {
  try {
    console.log(`\n🔍 Fetching pool information for: ${poolPDA.toString()}`);
    
    // Get pool account data
    const poolAccount = await connection.getAccountInfo(poolPDA);
    if (!poolAccount) {
      console.log("❌ Pool account not found");
      return null;
    }

    // Parse pool data (89 bytes: 32 + 32 + 1 + 8 + 8 + 8)
    const data = poolAccount.data;
    if (data.length < 89) {
      console.log("❌ Invalid pool data length");
      return null;
    }

    const tokenA = new PublicKey(data.slice(0, 32));
    const tokenB = new PublicKey(data.slice(32, 64));
    const bump = data[64];
    const reserveA = data.readBigUInt64LE(65);
    const reserveB = data.readBigUInt64LE(73);
    const totalLpSupply = data.readBigUInt64LE(81);

    // Get token mint info
    const tokenAInfo = await getTokenMintInfo(tokenA);
    const tokenBInfo = await getTokenMintInfo(tokenB);

    // Get vault balances
    const vaultA = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer(), tokenA.toBuffer()],
      AMM_PROGRAM_ID
    )[0];
    
    const vaultB = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer(), tokenB.toBuffer()],
      AMM_PROGRAM_ID
    )[0];

    const vaultABalance = await getTokenBalance(vaultA);
    const vaultBBalance = await getTokenBalance(vaultB);

    // Calculate ratios
    const reserveANum = Number(reserveA);
    const reserveBNum = Number(reserveB);
    const ratioAB = reserveBNum > 0 ? reserveANum / reserveBNum : 0;
    const ratioBA = reserveANum > 0 ? reserveBNum / reserveANum : 0;

    const poolInfo = {
      poolPDA: poolPDA.toString(),
      tokenA: {
        mint: tokenA.toString(),
        symbol: tokenAInfo?.symbol || "Unknown",
        name: tokenAInfo?.name || "Unknown Token",
        decimals: tokenAInfo?.decimals || 9,
        reserve: reserveANum,
        vaultBalance: vaultABalance,
        vaultAddress: vaultA.toString()
      },
      tokenB: {
        mint: tokenB.toString(),
        symbol: tokenBInfo?.symbol || "Unknown",
        name: tokenBInfo?.name || "Unknown Token",
        decimals: tokenBInfo?.decimals || 9,
        reserve: reserveBNum,
        vaultBalance: vaultBBalance,
        vaultAddress: vaultB.toString()
      },
      totalLpSupply: Number(totalLpSupply),
      bump,
      ratios: {
        aToB: ratioAB,
        bToA: ratioBA
      },
      creationInfo: {
        createdBy: "Unknown", // Would need to track this in production
        createdAt: "Unknown"  // Would need to track this in production
      }
    };

    return poolInfo;
  } catch (error) {
    console.error(`❌ Error fetching pool info:`, error);
    return null;
  }
}

// Call the GetPoolInfo instruction on-chain
async function callGetPoolInfo(poolPDA: PublicKey) {
  try {
    console.log(`\n📡 Calling GetPoolInfo instruction for: ${poolPDA.toString()}`);
    
    const transaction = new Transaction();
    
    // Instruction data (Borsh: GetPoolInfo - no args, just discriminator)
    const data = Buffer.alloc(1);
    data.writeUInt8(6, 0); // GetPoolInfo discriminator
    
    // Add GetPoolInfo instruction
    transaction.add({
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: false },
      ],
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ GetPoolInfo instruction completed! Signature: ${signature}`);
    
    // Get transaction logs
    const logs = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });
    
    if (logs?.meta?.logMessages) {
      console.log("\n📋 Pool Info from on-chain logs:");
      logs.meta.logMessages.forEach(log => {
        if (log.includes("Pool Info:") || log.includes("Token A:") || log.includes("Token B:") || 
            log.includes("Reserve") || log.includes("Ratio") || log.includes("Total LP")) {
          console.log(`  ${log}`);
        }
      });
    }
    
    return signature;
  } catch (error) {
    console.error("❌ Error calling GetPoolInfo instruction:", error);
    throw error;
  }
}

// Get all known pools
async function getAllPools() {
  console.log("🔍 Discovering all pools...");
  
  // Known pools from your existing files
  const knownPools = [];
  
  // Try to load from existing pool info files
  const poolFiles = [
    'pool-pq-info.json',
    'pool-qr-info.json',
    'pool-pr-info.json',
    'pool-pm-info.json',
    'pool-qm-info.json',
    'pool-rm-info.json',
    'pool-sv-info.json',
    'pool-tv-info.json',
    'pool-uv-info.json',
    'pool-st-info.json',
    'pool-tu-info.json'
  ];
  
  for (const file of poolFiles) {
    try {
      if (fs.existsSync(file)) {
        const poolInfo = JSON.parse(fs.readFileSync(file, 'utf-8'));
        knownPools.push({
          name: file.replace('pool-', '').replace('-info.json', '').toUpperCase(),
          poolPDA: new PublicKey(poolInfo.poolPDA),
          tokenA: poolInfo.tokenA || poolInfo.tokenP,
          tokenB: poolInfo.tokenB || poolInfo.tokenQ || poolInfo.tokenR,
          file: file
        });
      }
    } catch (error) {
      console.log(`⚠️  Could not load ${file}: ${error}`);
    }
  }
  
  console.log(`\n📊 Found ${knownPools.length} known pools:`);
  knownPools.forEach((pool, index) => {
    console.log(`  ${index + 1}. ${pool.name}: ${pool.poolPDA.toString()}`);
  });
  
  return knownPools;
}

// Main function to get comprehensive pool information
async function getComprehensivePoolInfo() {
  try {
    console.log("🚀 Comprehensive Pool Information Tool");
    console.log("=====================================");
    
    // Get all known pools
    const knownPools = await getAllPools();
    
    if (knownPools.length === 0) {
      console.log("❌ No known pools found. Please run pool initialization scripts first.");
      return;
    }
    
    console.log(`\n📈 Analyzing ${knownPools.length} pools...`);
    
    const poolAnalysis = [];
    
    for (let i = 0; i < knownPools.length; i++) {
      const pool = knownPools[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Pool ${i + 1}/${knownPools.length}: ${pool.name}`);
      console.log(`${'='.repeat(60)}`);
      
      // Get pool info from on-chain data
      const poolInfo = await getPoolInfo(pool.poolPDA);
      
      if (poolInfo) {
        // Display pool information
        console.log(`\n📋 Pool Details:`);
        console.log(`  Pool PDA: ${poolInfo.poolPDA}`);
        console.log(`  Token A: ${poolInfo.tokenA.symbol} (${poolInfo.tokenA.name})`);
        console.log(`    Mint: ${poolInfo.tokenA.mint}`);
        console.log(`    Reserve: ${formatTokenAmount(poolInfo.tokenA.reserve, poolInfo.tokenA.decimals)}`);
        console.log(`    Vault Balance: ${formatTokenAmount(poolInfo.tokenA.vaultBalance, poolInfo.tokenA.decimals)}`);
        console.log(`    Vault Address: ${poolInfo.tokenA.vaultAddress}`);
        
        console.log(`  Token B: ${poolInfo.tokenB.symbol} (${poolInfo.tokenB.name})`);
        console.log(`    Mint: ${poolInfo.tokenB.mint}`);
        console.log(`    Reserve: ${formatTokenAmount(poolInfo.tokenB.reserve, poolInfo.tokenB.decimals)}`);
        console.log(`    Vault Balance: ${formatTokenAmount(poolInfo.tokenB.vaultBalance, poolInfo.tokenB.decimals)}`);
        console.log(`    Vault Address: ${poolInfo.tokenB.vaultAddress}`);
        
        console.log(`\n📊 Pool Statistics:`);
        console.log(`  Total LP Supply: ${formatTokenAmount(poolInfo.totalLpSupply)}`);
        console.log(`  Bump: ${poolInfo.bump}`);
        console.log(`  Ratio A/B: ${poolInfo.ratios.aToB.toFixed(6)}`);
        console.log(`  Ratio B/A: ${poolInfo.ratios.bToA.toFixed(6)}`);
        
        // Call on-chain GetPoolInfo instruction
        await callGetPoolInfo(pool.poolPDA);
        
        poolAnalysis.push({
          name: pool.name,
          ...poolInfo
        });
      } else {
        console.log(`❌ Could not fetch information for ${pool.name}`);
      }
    }
    
    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log("📊 SUMMARY");
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Pools Found: ${poolAnalysis.length}`);
    console.log(`Total Pools Analyzed: ${poolAnalysis.filter(p => p).length}`);
    
    // Save comprehensive analysis
    const analysisData = {
      timestamp: new Date().toISOString(),
      totalPools: poolAnalysis.length,
      pools: poolAnalysis,
      summary: {
        totalLiquidity: poolAnalysis.reduce((sum, pool) => sum + pool.tokenA.reserve + pool.tokenB.reserve, 0),
        totalLPTokens: poolAnalysis.reduce((sum, pool) => sum + pool.totalLpSupply, 0),
        averageRatio: poolAnalysis.length > 0 ? 
          poolAnalysis.reduce((sum, pool) => sum + pool.ratios.aToB, 0) / poolAnalysis.length : 0
      }
    };
    
    fs.writeFileSync("comprehensive-pool-analysis.json", JSON.stringify(analysisData, null, 2));
    console.log(`\n💾 Comprehensive analysis saved to comprehensive-pool-analysis.json`);
    
  } catch (error) {
    console.error("❌ Error in comprehensive pool analysis:", error);
    throw error;
  }
}

// Run the comprehensive pool analysis
getComprehensivePoolInfo().catch(console.error);
