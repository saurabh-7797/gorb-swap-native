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

// Get all known pools from existing files
async function getAllKnownPools() {
  const knownPools = [];
  
  // Pool files to check
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
        const poolPDA = new PublicKey(poolInfo.poolPDA);
        
        // Extract token addresses based on file name
        let tokenA, tokenB;
        if (file.includes('pq')) {
          tokenA = poolInfo.tokenP;
          tokenB = poolInfo.tokenQ;
        } else if (file.includes('qr')) {
          tokenA = poolInfo.tokenQ;
          tokenB = poolInfo.tokenR;
        } else if (file.includes('pr')) {
          tokenA = poolInfo.tokenP;
          tokenB = poolInfo.tokenR;
        } else if (file.includes('pm')) {
          tokenA = poolInfo.tokenP;
          tokenB = poolInfo.tokenM;
        } else if (file.includes('qm')) {
          tokenA = poolInfo.tokenQ;
          tokenB = poolInfo.tokenM;
        } else if (file.includes('rm')) {
          tokenA = poolInfo.tokenR;
          tokenB = poolInfo.tokenM;
        } else if (file.includes('sv')) {
          tokenA = poolInfo.tokenS;
          tokenB = poolInfo.tokenV;
        } else if (file.includes('tv')) {
          tokenA = poolInfo.tokenT;
          tokenB = poolInfo.tokenV;
        } else if (file.includes('uv')) {
          tokenA = poolInfo.tokenU;
          tokenB = poolInfo.tokenV;
        } else if (file.includes('st')) {
          tokenA = poolInfo.tokenS;
          tokenB = poolInfo.tokenT;
        } else if (file.includes('tu')) {
          tokenA = poolInfo.tokenT;
          tokenB = poolInfo.tokenU;
        } else {
          // Generic fallback
          tokenA = poolInfo.tokenA || poolInfo.tokenP;
          tokenB = poolInfo.tokenB || poolInfo.tokenQ || poolInfo.tokenR;
        }
        
        knownPools.push({
          name: file.replace('pool-', '').replace('-info.json', '').toUpperCase(),
          poolPDA,
          tokenA: new PublicKey(tokenA),
          tokenB: new PublicKey(tokenB),
          file: file
        });
      }
    } catch (error) {
      console.log(`⚠️  Could not load ${file}: ${error}`);
    }
  }
  
  return knownPools;
}

// Get detailed pool information
async function getPoolDetails(poolPDA: PublicKey, tokenA: PublicKey, tokenB: PublicKey) {
  try {
    // Get pool account data
    const poolAccount = await connection.getAccountInfo(poolPDA);
    if (!poolAccount) {
      return null;
    }

    // Parse pool data (89 bytes: 32 + 32 + 1 + 8 + 8 + 8)
    const data = poolAccount.data;
    if (data.length < 89) {
      return null;
    }

    const poolTokenA = new PublicKey(data.slice(0, 32));
    const poolTokenB = new PublicKey(data.slice(32, 64));
    const bump = data[64];
    const reserveA = data.readBigUInt64LE(65);
    const reserveB = data.readBigUInt64LE(73);
    const totalLpSupply = data.readBigUInt64LE(81);

    // Get token mint info
    const tokenAInfo = await getTokenMintInfo(poolTokenA);
    const tokenBInfo = await getTokenMintInfo(poolTokenB);

    // Get vault balances
    const vaultA = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer(), poolTokenA.toBuffer()],
      AMM_PROGRAM_ID
    )[0];
    
    const vaultB = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer(), poolTokenB.toBuffer()],
      AMM_PROGRAM_ID
    )[0];

    const vaultABalance = await getTokenBalance(vaultA);
    const vaultBBalance = await getTokenBalance(vaultB);

    // Calculate ratios
    const reserveANum = Number(reserveA);
    const reserveBNum = Number(reserveB);
    const ratioAB = reserveBNum > 0 ? reserveANum / reserveBNum : 0;
    const ratioBA = reserveANum > 0 ? reserveBNum / reserveANum : 0;

    return {
      poolPDA: poolPDA.toString(),
      tokenA: {
        mint: poolTokenA.toString(),
        symbol: tokenAInfo?.symbol || "Unknown",
        name: tokenAInfo?.name || "Unknown Token",
        decimals: tokenAInfo?.decimals || 9,
        reserve: reserveANum,
        vaultBalance: vaultABalance,
        vaultAddress: vaultA.toString()
      },
      tokenB: {
        mint: poolTokenB.toString(),
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
      }
    };
  } catch (error) {
    console.error(`❌ Error fetching pool details:`, error);
    return null;
  }
}

// Find pools by token address
async function findPoolsByToken(tokenAddress: string) {
  try {
    console.log(`🔍 Finding pools for token: ${tokenAddress}`);
    console.log("=".repeat(60));
    
    const tokenPubkey = new PublicKey(tokenAddress);
    const allPools = await getAllKnownPools();
    
    console.log(`\n📊 Searching through ${allPools.length} known pools...`);
    
    const matchingPools = [];
    
    for (const pool of allPools) {
      const isTokenA = pool.tokenA.equals(tokenPubkey);
      const isTokenB = pool.tokenB.equals(tokenPubkey);
      
      if (isTokenA || isTokenB) {
        console.log(`\n✅ Found pool: ${pool.name}`);
        console.log(`   Pool PDA: ${pool.poolPDA.toString()}`);
        console.log(`   Token A: ${pool.tokenA.toString()}`);
        console.log(`   Token B: ${pool.tokenB.toString()}`);
        console.log(`   Token Position: ${isTokenA ? 'Token A' : 'Token B'}`);
        
        // Get detailed pool information
        const poolDetails = await getPoolDetails(pool.poolPDA, pool.tokenA, pool.tokenB);
        
        if (poolDetails) {
          console.log(`\n📋 Pool Details:`);
          console.log(`   Token A: ${poolDetails.tokenA.symbol} (${poolDetails.tokenA.name})`);
          console.log(`     Reserve: ${formatTokenAmount(poolDetails.tokenA.reserve, poolDetails.tokenA.decimals)}`);
          console.log(`     Vault Balance: ${formatTokenAmount(poolDetails.tokenA.vaultBalance, poolDetails.tokenA.decimals)}`);
          
          console.log(`   Token B: ${poolDetails.tokenB.symbol} (${poolDetails.tokenB.name})`);
          console.log(`     Reserve: ${formatTokenAmount(poolDetails.tokenB.reserve, poolDetails.tokenB.decimals)}`);
          console.log(`     Vault Balance: ${formatTokenAmount(poolDetails.tokenB.vaultBalance, poolDetails.tokenB.decimals)}`);
          
          console.log(`\n📊 Liquidity Ratios:`);
          console.log(`   Ratio A/B: ${poolDetails.ratios.aToB.toFixed(6)}`);
          console.log(`   Ratio B/A: ${poolDetails.ratios.bToA.toFixed(6)}`);
          console.log(`   Total LP Supply: ${formatTokenAmount(poolDetails.totalLpSupply)}`);
          
          // Calculate liquidity for the specific token
          const tokenLiquidity = isTokenA ? poolDetails.tokenA.reserve : poolDetails.tokenB.reserve;
          const otherTokenLiquidity = isTokenA ? poolDetails.tokenB.reserve : poolDetails.tokenA.reserve;
          const tokenSymbol = isTokenA ? poolDetails.tokenA.symbol : poolDetails.tokenB.symbol;
          const otherTokenSymbol = isTokenA ? poolDetails.tokenB.symbol : poolDetails.tokenA.symbol;
          
          console.log(`\n💰 Token Liquidity:`);
          console.log(`   ${tokenSymbol} Liquidity: ${formatTokenAmount(tokenLiquidity, isTokenA ? poolDetails.tokenA.decimals : poolDetails.tokenB.decimals)}`);
          console.log(`   ${otherTokenSymbol} Liquidity: ${formatTokenAmount(otherTokenLiquidity, isTokenA ? poolDetails.tokenB.decimals : poolDetails.tokenA.decimals)}`);
          
          matchingPools.push({
            poolName: pool.name,
            poolPDA: pool.poolPDA.toString(),
            tokenPosition: isTokenA ? 'A' : 'B',
            poolDetails
          });
        }
      }
    }
    
    if (matchingPools.length === 0) {
      console.log(`\n❌ No pools found containing token: ${tokenAddress}`);
      return [];
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total pools found: ${matchingPools.length}`);
    console.log(`   Token appears as Token A in: ${matchingPools.filter(p => p.tokenPosition === 'A').length} pools`);
    console.log(`   Token appears as Token B in: ${matchingPools.filter(p => p.tokenPosition === 'B').length} pools`);
    
    // Save results
    const results = {
      searchToken: tokenAddress,
      timestamp: new Date().toISOString(),
      totalPoolsFound: matchingPools.length,
      pools: matchingPools
    };
    
    fs.writeFileSync(`pools-for-token-${tokenAddress.slice(0, 8)}.json`, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to pools-for-token-${tokenAddress.slice(0, 8)}.json`);
    
    return matchingPools;
    
  } catch (error) {
    console.error("❌ Error finding pools by token:", error);
    throw error;
  }
}

// Call the FindPoolsByToken instruction on-chain
async function callFindPoolsByToken(tokenAddress: string) {
  try {
    console.log(`\n📡 Calling FindPoolsByToken instruction for: ${tokenAddress}`);
    
    const tokenPubkey = new PublicKey(tokenAddress);
    const transaction = new Transaction();
    
    // Instruction data (Borsh: FindPoolsByToken { token_address: Pubkey })
    const data = Buffer.alloc(1 + 32); // 1 byte discriminator + 32 bytes Pubkey
    data.writeUInt8(8, 0); // FindPoolsByToken discriminator
    data.set(tokenPubkey.toBytes(), 1);
    
    // Add FindPoolsByToken instruction
    transaction.add({
      keys: [
        // No accounts needed for this instruction in current implementation
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

    console.log(`✅ FindPoolsByToken instruction completed! Signature: ${signature}`);
    
    // Get transaction logs
    const logs = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });
    
    if (logs?.meta?.logMessages) {
      console.log("\n📋 On-chain logs:");
      logs.meta.logMessages.forEach(log => {
        if (log.includes("FindPoolsByToken") || log.includes("token:")) {
          console.log(`  ${log}`);
        }
      });
    }
    
    return signature;
  } catch (error) {
    console.error("❌ Error calling FindPoolsByToken instruction:", error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Get token address from command line argument or use default
    const tokenAddress = process.argv[2] || "4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq"; // Default to Token R
    
    console.log("🚀 Find Pools by Token Address Tool");
    console.log("===================================");
    
    // Find pools by token address
    const pools = await findPoolsByToken(tokenAddress);
    
    // Call on-chain instruction
    await callFindPoolsByToken(tokenAddress);
    
    console.log("\n✅ Pool search completed!");
    
  } catch (error) {
    console.error("❌ Error in main function:", error);
    throw error;
  }
}

// Run the main function
main().catch(console.error);
