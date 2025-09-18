import {
    Connection,
    PublicKey,
    AccountInfo,
  } from '@solana/web3.js';
  import * as fs from 'fs';
  import * as path from 'path';
  
  // Program ID
  const PROGRAM_ID = new PublicKey('EtGrXaRpEdozMtfd8tbkbrbDN8LqZNba3xWTdT3HtQWq');
  
  // RPC Configuration
  const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
  const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
  
  interface DecodedPoolInfo {
    poolAddress: string;
    poolType: 'Regular' | 'Native SOL';
    dataLength: number;
    rawData: string;
    tokenA?: string;
    tokenB?: string;
    tokenMint?: string;
    bump: number;
    reserveA?: number;
    reserveB?: number;
    solReserve?: number;
    tokenReserve?: number;
    totalLPSupply: number;
    feeBps: number;
    feePercentage: number;
    // Fee-related fields for new pools
    feeCollectedA?: number;
    feeCollectedB?: number;
    feeCollectedSol?: number;
    feeCollectedToken?: number;
    feeTreasury?: string;
  }
  
  function formatTokenAmount(amount: number, decimals: number = 6): string {
    const formatted = amount / Math.pow(10, decimals);
    return formatted.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  }
  
  function decodePoolData(poolAddress: string, data: Buffer): DecodedPoolInfo | null {
    try {
      const dataLength = data.length;
      const rawData = data.toString('hex');
      
      if (dataLength === 89) {
        // Old Regular Pool structure: token_a(32) + token_b(32) + bump(1) + reserve_a(8) + reserve_b(8) + total_lp_supply(8)
        const tokenA = new PublicKey(data.slice(0, 32));
        const tokenB = new PublicKey(data.slice(32, 64));
        const bump = data[64];
        const reserveA = data.readBigUInt64LE(65);
        const reserveB = data.readBigUInt64LE(73);
        const totalLPSupply = data.readBigUInt64LE(81);
        
        return {
          poolAddress,
          poolType: 'Regular',
          dataLength,
          rawData,
          tokenA: tokenA.toString(),
          tokenB: tokenB.toString(),
          bump,
          reserveA: Number(reserveA),
          reserveB: Number(reserveB),
          totalLPSupply: Number(totalLPSupply),
          feeBps: 0, // No fee field in old structure
          feePercentage: 0
        };
        
      } else if (dataLength === 137) {
        // New Regular Pool structure with fees: token_a(32) + token_b(32) + bump(1) + reserve_a(8) + reserve_b(8) + total_lp_supply(8) + fee_collected_a(8) + fee_collected_b(8) + fee_treasury(32)
        const tokenA = new PublicKey(data.slice(0, 32));
        const tokenB = new PublicKey(data.slice(32, 64));
        const bump = data[64];
        const reserveA = data.readBigUInt64LE(65);
        const reserveB = data.readBigUInt64LE(73);
        const totalLPSupply = data.readBigUInt64LE(81);
        const feeCollectedA = data.readBigUInt64LE(89);
        const feeCollectedB = data.readBigUInt64LE(97);
        const feeTreasury = new PublicKey(data.slice(105, 137));
        
        return {
          poolAddress,
          poolType: 'Regular',
          dataLength,
          rawData,
          tokenA: tokenA.toString(),
          tokenB: tokenB.toString(),
          bump,
          reserveA: Number(reserveA),
          reserveB: Number(reserveB),
          totalLPSupply: Number(totalLPSupply),
          feeBps: 30, // 0.3% fee (30 bps)
          feePercentage: 0.3,
          feeCollectedA: Number(feeCollectedA),
          feeCollectedB: Number(feeCollectedB),
          feeTreasury: feeTreasury.toString()
        };
        
      } else if (dataLength === 169) {
        // New Native SOL Pool structure with fees: token_mint(32) + bump(1) + sol_reserve(8) + token_reserve(8) + total_lp_supply(8) + fee_collected_sol(8) + fee_collected_token(8) + fee_treasury(32) + token_mint(32)
        const tokenMint = new PublicKey(data.slice(0, 32));
        const bump = data[32];
        const solReserve = data.readBigUInt64LE(33);
        const tokenReserve = data.readBigUInt64LE(41);
        const totalLPSupply = data.readBigUInt64LE(49);
        const feeCollectedSol = data.readBigUInt64LE(57);
        const feeCollectedToken = data.readBigUInt64LE(65);
        const feeTreasury = new PublicKey(data.slice(73, 105));
        const tokenMint2 = new PublicKey(data.slice(105, 137)); // Duplicate token_mint field
        
        return {
          poolAddress,
          poolType: 'Native SOL',
          dataLength,
          rawData,
          tokenMint: tokenMint.toString(),
          bump,
          solReserve: Number(solReserve),
          tokenReserve: Number(tokenReserve),
          totalLPSupply: Number(totalLPSupply),
          feeBps: 30, // 0.3% fee (30 bps)
          feePercentage: 0.3,
          feeCollectedSol: Number(feeCollectedSol),
          feeCollectedToken: Number(feeCollectedToken),
          feeTreasury: feeTreasury.toString()
        };
        
      } else if (dataLength === 57) {
        // Old Native SOL Pool structure: token_mint(32) + bump(1) + sol_reserve(8) + token_reserve(8) + total_lp_supply(8)
        const tokenMint = new PublicKey(data.slice(0, 32));
        const bump = data[32];
        const solReserve = data.readBigUInt64LE(33);
        const tokenReserve = data.readBigUInt64LE(41);
        const totalLPSupply = data.readBigUInt64LE(49);
        
        return {
          poolAddress,
          poolType: 'Native SOL',
          dataLength,
          rawData,
          tokenMint: tokenMint.toString(),
          bump,
          solReserve: Number(solReserve),
          tokenReserve: Number(tokenReserve),
          totalLPSupply: Number(totalLPSupply),
          feeBps: 0, // No fee field in old structure
          feePercentage: 0
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error decoding pool data for ${poolAddress}:`, error);
      return null;
    }
  }
  
  async function findAndDecodeAllPools(connection: Connection): Promise<DecodedPoolInfo[]> {
    const decodedPools: DecodedPoolInfo[] = [];
    
    try {
      // Get all program accounts with different data sizes
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
      
      console.log(`🔍 Found ${allAccounts.length} total accounts owned by program`);
      
      for (const account of allAccounts) {
        const { pubkey, account: accountInfo } = account;
        const data = accountInfo.data;
        
        console.log(`\n📊 Processing account: ${pubkey.toString()}`);
        console.log(`   Data length: ${data.length} bytes`);
        console.log(`   Raw data: ${data.toString('hex')}`);
        
        const decodedPool = decodePoolData(pubkey.toString(), data);
        if (decodedPool) {
          decodedPools.push(decodedPool);
          console.log(`   ✅ Successfully decoded as ${decodedPool.poolType} pool`);
        } else {
          console.log(`   ❌ Could not decode (unknown data structure)`);
        }
      }
      
    } catch (error) {
      console.error('Error fetching program accounts:', error);
    }
    
    return decodedPools;
  }
  
  function displayPoolInfo(pools: DecodedPoolInfo[]): void {
    console.log('\n' + '='.repeat(100));
    console.log('📋 DECODED POOL INFORMATION');
    console.log('='.repeat(100));
    
    console.log(`\n📊 Total Pools Found: ${pools.length}\n`);
    
    pools.forEach((pool, index) => {
      console.log(`🏊 Pool #${index + 1}`);
      console.log(`   Address: ${pool.poolAddress}`);
      console.log(`   Type: ${pool.poolType}`);
      console.log(`   Data Length: ${pool.dataLength} bytes`);
      console.log(`   Fee: ${pool.feeBps} bps (${pool.feePercentage.toFixed(2)}%)`);
      console.log(`   Total LP Supply: ${pool.totalLPSupply.toLocaleString()}`);
      console.log(`   Bump: ${pool.bump}`);
      
      // Show fee information for new pools
      if (pool.feeBps > 0) {
        if (pool.poolType === 'Regular') {
          console.log(`   Fee Collected A: ${pool.feeCollectedA?.toLocaleString() || 0} (${formatTokenAmount(pool.feeCollectedA || 0)} tokens)`);
          console.log(`   Fee Collected B: ${pool.feeCollectedB?.toLocaleString() || 0} (${formatTokenAmount(pool.feeCollectedB || 0)} tokens)`);
        } else {
          console.log(`   Fee Collected SOL: ${pool.feeCollectedSol?.toLocaleString() || 0} (${formatTokenAmount(pool.feeCollectedSol || 0, 9)} SOL)`);
          console.log(`   Fee Collected Token: ${pool.feeCollectedToken?.toLocaleString() || 0} (${formatTokenAmount(pool.feeCollectedToken || 0)} tokens)`);
        }
        console.log(`   Fee Treasury: ${pool.feeTreasury || 'Not set'}`);
      }
      
      if (pool.poolType === 'Regular') {
        console.log(`   Token A: ${pool.tokenA}`);
        console.log(`   Token B: ${pool.tokenB}`);
        console.log(`   Reserve A: ${pool.reserveA?.toLocaleString()} (${formatTokenAmount(pool.reserveA || 0)} tokens)`);
        console.log(`   Reserve B: ${pool.reserveB?.toLocaleString()} (${formatTokenAmount(pool.reserveB || 0)} tokens)`);
        
        if (pool.reserveA && pool.reserveB) {
          const ratioAB = pool.reserveB > 0 ? pool.reserveA / pool.reserveB : 0;
          const ratioBA = pool.reserveA > 0 ? pool.reserveB / pool.reserveA : 0;
          console.log(`   Ratio A/B: ${ratioAB.toFixed(6)}`);
          console.log(`   Ratio B/A: ${ratioBA.toFixed(6)}`);
        }
      } else {
        console.log(`   Token Mint: ${pool.tokenMint}`);
        console.log(`   SOL Reserve: ${pool.solReserve?.toLocaleString()} lamports (${formatTokenAmount(pool.solReserve || 0, 9)} SOL)`);
        console.log(`   Token Reserve: ${pool.tokenReserve?.toLocaleString()} (${formatTokenAmount(pool.tokenReserve || 0)} tokens)`);
        
        if (pool.solReserve && pool.tokenReserve) {
          const solTokenRatio = pool.tokenReserve > 0 ? pool.solReserve / pool.tokenReserve : 0;
          const tokenSolRatio = pool.solReserve > 0 ? pool.tokenReserve / pool.solReserve : 0;
          console.log(`   SOL/Token Ratio: ${solTokenRatio.toFixed(6)}`);
          console.log(`   Token/SOL Ratio: ${tokenSolRatio.toFixed(6)}`);
        }
      }
      
      console.log(`   Raw Data: ${pool.rawData}`);
      console.log('');
    });
    
    // Summary table
    console.log('='.repeat(120));
    console.log('📊 SUMMARY TABLE');
    console.log('='.repeat(120));
    console.log('Index | Pool Address (first 12 chars) | Type | Data Size | Tokens | Reserves | Fee');
    console.log('-'.repeat(120));
    
    pools.forEach((pool, index) => {
      const addressShort = pool.poolAddress.slice(0, 12) + '...';
      let tokensInfo = '';
      let reservesInfo = '';
      
      if (pool.poolType === 'Regular') {
        tokensInfo = `${pool.tokenA?.slice(0, 8)}.../${pool.tokenB?.slice(0, 8)}...`;
        reservesInfo = `${formatTokenAmount(pool.reserveA || 0)}/${formatTokenAmount(pool.reserveB || 0)}`;
      } else {
        tokensInfo = `SOL/${pool.tokenMint?.slice(0, 8)}...`;
        reservesInfo = `${formatTokenAmount(pool.solReserve || 0, 9)}/${formatTokenAmount(pool.tokenReserve || 0)}`;
      }
      
      console.log(`${(index + 1).toString().padStart(5)} | ${addressShort.padEnd(30)} | ${pool.poolType.padEnd(10)} | ${pool.dataLength.toString().padEnd(9)} | ${tokensInfo.padEnd(20)} | ${reservesInfo.padEnd(20)} | ${pool.feeBps}bps`);
    });
    
    console.log('\n✅ Pool information decoded successfully!');
  }
  
  function exportToJSON(pools: DecodedPoolInfo[]): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(__dirname, '..', 'output');
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Export all pools data
    const allPoolsFile = path.join(outputDir, `all-pools-${timestamp}.json`);
    fs.writeFileSync(allPoolsFile, JSON.stringify(pools, null, 2));
    console.log(`\n💾 Exported all pools data to: ${allPoolsFile}`);
    
    // Export regular pools only
    const regularPools = pools.filter(pool => pool.poolType === 'Regular');
    if (regularPools.length > 0) {
      const regularPoolsFile = path.join(outputDir, `regular-pools-${timestamp}.json`);
      fs.writeFileSync(regularPoolsFile, JSON.stringify(regularPools, null, 2));
      console.log(`💾 Exported regular pools to: ${regularPoolsFile}`);
    }
    
    // Export native SOL pools only
    const nativeSOLPools = pools.filter(pool => pool.poolType === 'Native SOL');
    if (nativeSOLPools.length > 0) {
      const nativeSOLPoolsFile = path.join(outputDir, `native-sol-pools-${timestamp}.json`);
      fs.writeFileSync(nativeSOLPoolsFile, JSON.stringify(nativeSOLPools, null, 2));
      console.log(`💾 Exported native SOL pools to: ${nativeSOLPoolsFile}`);
    }
    
    // Export simplified summary
    const summary = pools.map(pool => ({
      poolAddress: pool.poolAddress,
      poolType: pool.poolType,
      feeBps: pool.feeBps,
      totalLPSupply: pool.totalLPSupply,
      tokens: pool.poolType === 'Regular' 
        ? { tokenA: pool.tokenA, tokenB: pool.tokenB }
        : { tokenMint: pool.tokenMint },
      reserves: pool.poolType === 'Regular'
        ? { 
            reserveA: pool.reserveA, 
            reserveB: pool.reserveB,
            reserveAFormatted: formatTokenAmount(pool.reserveA || 0),
            reserveBFormatted: formatTokenAmount(pool.reserveB || 0)
          }
        : {
            solReserve: pool.solReserve,
            tokenReserve: pool.tokenReserve,
            solReserveFormatted: formatTokenAmount(pool.solReserve || 0, 9),
            tokenReserveFormatted: formatTokenAmount(pool.tokenReserve || 0)
          },
      ratios: pool.poolType === 'Regular'
        ? {
            ratioAB: pool.reserveA && pool.reserveB ? pool.reserveA / pool.reserveB : 0,
            ratioBA: pool.reserveA && pool.reserveB ? pool.reserveB / pool.reserveA : 0
          }
        : {
            solTokenRatio: pool.solReserve && pool.tokenReserve ? pool.solReserve / pool.tokenReserve : 0,
            tokenSolRatio: pool.solReserve && pool.tokenReserve ? pool.tokenReserve / pool.solReserve : 0
          }
    }));
    
    const summaryFile = path.join(outputDir, `pools-summary-${timestamp}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`💾 Exported simplified summary to: ${summaryFile}`);
    
    // Export latest pools (overwrite previous)
    const latestAllPoolsFile = path.join(outputDir, 'latest-all-pools.json');
    const latestSummaryFile = path.join(outputDir, 'latest-pools-summary.json');
    
    fs.writeFileSync(latestAllPoolsFile, JSON.stringify(pools, null, 2));
    fs.writeFileSync(latestSummaryFile, JSON.stringify(summary, null, 2));
    
    console.log(`💾 Exported latest data to: ${latestAllPoolsFile}`);
    console.log(`💾 Exported latest summary to: ${latestSummaryFile}`);
    
    console.log(`\n📁 All JSON files saved to: ${outputDir}`);
  }
  
  async function main() {
    console.log('🔍 Dynamic Pool Decoder - No Hardcoded Addresses\n');
    
    // Create connection
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed',
      wsEndpoint: WS_ENDPOINT,
    });
  
    try {
      // Find and decode all pools
      const decodedPools = await findAndDecodeAllPools(connection);
      
      if (decodedPools.length === 0) {
        console.log('❌ No pools found. Make sure pools have been initialized.');
        return;
      }
      
      // Display the decoded information
      displayPoolInfo(decodedPools);
      
      // Export to JSON files
      exportToJSON(decodedPools);
      
    } catch (error) {
      console.error('❌ Error in main process:', error);
    }
  }
  
  // Run the script
  main().catch(console.error);