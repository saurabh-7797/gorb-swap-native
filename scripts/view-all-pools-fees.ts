import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Pool data structures (matching the Rust structs)
interface Pool {
  token_a: PublicKey;
  token_b: PublicKey;
  bump: number;
  reserve_a: bigint;
  reserve_b: bigint;
  total_lp_supply: bigint;
  fee_collected_a: bigint;
  fee_collected_b: bigint;
  fee_treasury: PublicKey;
}

interface NativeSOLPool {
  token_a: PublicKey;
  token_b: PublicKey;
  bump: number;
  reserve_a: bigint;
  reserve_b: bigint;
  total_lp_supply: bigint;
  fee_collected_sol: bigint;
  fee_collected_token: bigint;
  fee_treasury: PublicKey;
}

// Helper function to format token amounts
function formatTokenAmount(amount: bigint, decimals: number = 9): string {
  return (Number(amount) / Math.pow(10, decimals)).toFixed(6);
}

// Helper function to parse pool data
function parsePoolData(data: Buffer): Pool | null {
  try {
    // Pool struct: token_a(32) + token_b(32) + bump(1) + reserve_a(8) + reserve_b(8) + total_lp_supply(8) + fee_collected_a(8) + fee_collected_b(8) + fee_treasury(32) = 137 bytes
    if (data.length < 137) return null;
    
    let offset = 0; // No discriminator for Borsh
    
    const token_a = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const token_b = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const bump = data.readUInt8(offset);
    offset += 1;
    const reserve_a = data.readBigUInt64LE(offset);
    offset += 8;
    const reserve_b = data.readBigUInt64LE(offset);
    offset += 8;
    const total_lp_supply = data.readBigUInt64LE(offset);
    offset += 8;
    const fee_collected_a = data.readBigUInt64LE(offset);
    offset += 8;
    const fee_collected_b = data.readBigUInt64LE(offset);
    offset += 8;
    const fee_treasury = new PublicKey(data.slice(offset, offset + 32));
    
    return {
      token_a,
      token_b,
      bump,
      reserve_a,
      reserve_b,
      total_lp_supply,
      fee_collected_a,
      fee_collected_b,
      fee_treasury,
    };
  } catch (error) {
    return null;
  }
}

// Helper function to parse native SOL pool data
function parseNativeSOLPoolData(data: Buffer): NativeSOLPool | null {
  try {
    // NativeSOLPool struct: token_a(32) + token_b(32) + bump(1) + reserve_a(8) + reserve_b(8) + total_lp_supply(8) + fee_collected_sol(8) + fee_collected_token(8) + fee_treasury(32) = 137 bytes
    if (data.length < 137) return null;
    
    let offset = 0; // No discriminator for Borsh
    
    const token_a = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const token_b = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const bump = data.readUInt8(offset);
    offset += 1;
    const reserve_a = data.readBigUInt64LE(offset);
    offset += 8;
    const reserve_b = data.readBigUInt64LE(offset);
    offset += 8;
    const total_lp_supply = data.readBigUInt64LE(offset);
    offset += 8;
    const fee_collected_sol = data.readBigUInt64LE(offset);
    offset += 8;
    const fee_collected_token = data.readBigUInt64LE(offset);
    offset += 8;
    const fee_treasury = new PublicKey(data.slice(offset, offset + 32));
    
    return {
      token_a,
      token_b,
      bump,
      reserve_a,
      reserve_b,
      total_lp_supply,
      fee_collected_sol,
      fee_collected_token,
      fee_treasury,
    };
  } catch (error) {
    return null;
  }
}

/**
 * TypeScript Script: View All Pool Fees
 * This script displays fee collection status for all pools
 */
async function viewAllPoolsFees() {
  try {
    console.log("🚀 TypeScript Script: View All Pool Fees...");
    console.log("=".repeat(80));
    
    // Load all pool info files
    const pools = [];
    
    // 1. X-Y Pool (Regular Token Pool)
    if (fs.existsSync('pool-xy-info.json')) {
      const poolXYInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
      pools.push({
        name: "X-Y Pool (Regular)",
        pda: new PublicKey(poolXYInfo.poolPDA),
        type: "regular"
      });
    }
    
    // 2. Y-Z Pool (Regular Token Pool)
    if (fs.existsSync('pool-yz-info.json')) {
      const poolYZInfo = JSON.parse(fs.readFileSync('pool-yz-info.json', 'utf-8'));
      pools.push({
        name: "Y-Z Pool (Regular)",
        pda: new PublicKey(poolYZInfo.poolPDA),
        type: "regular"
      });
    }
    
    // 3. X-Native SOL Pool
    if (fs.existsSync('pool-x-native-sol-info.json')) {
      const poolXSOLInfo = JSON.parse(fs.readFileSync('pool-x-native-sol-info.json', 'utf-8'));
      pools.push({
        name: "X-Native SOL Pool",
        pda: new PublicKey(poolXSOLInfo.poolPDA),
        type: "native_sol"
      });
    }
    
    console.log(`\n📊 Found ${pools.length} pools to check...\n`);
    
    // Check each pool
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      console.log(`🏊 Pool ${i + 1}: ${pool.name}`);
      console.log(`📍 PDA: ${pool.pda.toString()}`);
      
      try {
        // Fetch pool account data
        const accountInfo = await connection.getAccountInfo(pool.pda);
        
        if (!accountInfo) {
          console.log("❌ Pool account not found");
          console.log("-".repeat(80));
          continue;
        }
        
        if (pool.type === "regular") {
          // Parse regular pool data
          const poolData = parsePoolData(accountInfo.data);
          
          if (!poolData) {
            console.log("❌ Failed to parse pool data");
            console.log("-".repeat(80));
            continue;
          }

          // Get token addresses from blockchain data
          console.log(`🪙 Token A: ${poolData.token_a.toString()}`);
          console.log(`🪙 Token B: ${poolData.token_b.toString()}`);
          
          console.log(`💰 Fee Collection Status:`);
          console.log(`  Token A fees: ${formatTokenAmount(poolData.fee_collected_a)} (${poolData.fee_collected_a.toString()} raw)`);
          console.log(`  Token B fees: ${formatTokenAmount(poolData.fee_collected_b)} (${poolData.fee_collected_b.toString()} raw)`);
          console.log(`  Total fees collected: ${Number(poolData.fee_collected_a) + Number(poolData.fee_collected_b)} raw units`);
          
          console.log(`🏦 Pool Reserves:`);
          console.log(`  Token A: ${formatTokenAmount(poolData.reserve_a)}`);
          console.log(`  Token B: ${formatTokenAmount(poolData.reserve_b)}`);
          console.log(`  Total LP Supply: ${formatTokenAmount(poolData.total_lp_supply)}`);
          
          console.log(`🏛️ Fee Treasury: ${poolData.fee_treasury.toString()}`);
          
        } else if (pool.type === "native_sol") {
          // Parse native SOL pool data
          const poolData = parseNativeSOLPoolData(accountInfo.data);
          
          if (!poolData) {
            console.log("❌ Failed to parse native SOL pool data");
            console.log("-".repeat(80));
            continue;
          }

          // Get token addresses from blockchain data
          console.log(`🪙 Token A (SOL): ${poolData.token_a.toString()}`);
          console.log(`🪙 Token B: ${poolData.token_b.toString()}`);
          
          console.log(`💰 Fee Collection Status:`);
          console.log(`  SOL fees: ${formatTokenAmount(poolData.fee_collected_sol)} SOL (${poolData.fee_collected_sol.toString()} raw)`);
          console.log(`  Token fees: ${formatTokenAmount(poolData.fee_collected_token)} (${poolData.fee_collected_token.toString()} raw)`);
          console.log(`  Total fees collected: ${Number(poolData.fee_collected_sol) + Number(poolData.fee_collected_token)} raw units`);
          
          console.log(`🏦 Pool Reserves:`);
          console.log(`  SOL: ${formatTokenAmount(poolData.reserve_a)} SOL`);
          console.log(`  Token: ${formatTokenAmount(poolData.reserve_b)}`);
          console.log(`  Total LP Supply: ${formatTokenAmount(poolData.total_lp_supply)}`);
          
          console.log(`🏛️ Fee Treasury: ${poolData.fee_treasury.toString()}`);
        }
        
      } catch (error) {
        console.log(`❌ Error fetching pool data: ${error}`);
      }
      
      console.log("-".repeat(80));
    }
    
    // Summary
    console.log(`\n📈 Fee Collection Summary:`);
    console.log(`✅ Regular Token Pools: Fee accumulation on every swap (0.3% per trade)`);
    console.log(`✅ Native SOL Pools: Fee accumulation on SOL↔Token swaps`);
    console.log(`✅ Multihop Swaps: Fee accumulation per hop (0.3% per pool)`);
    console.log(`✅ Fee Management: Collect, withdraw, and treasury management available`);
    
    console.log(`\n🔧 Fee Management Functions:`);
    console.log(`📝 Collect Fees: npx ts-node scripts/fee-1-collect-fees.ts`);
    console.log(`⚙️ Set Treasury: npx ts-node scripts/fee-2-set-treasury.ts`);
    console.log(`💸 Withdraw Fees: npx ts-node scripts/fee-3-withdraw-fees.ts`);

  } catch (error) {
    console.error("❌ Error viewing pool fees:", error);
    throw error;
  }
}

// Run the script
viewAllPoolsFees()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
