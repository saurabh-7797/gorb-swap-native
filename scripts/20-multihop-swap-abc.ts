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

interface MultihopSwapInfo {
  pool1: PoolInfo;
  pool2: PoolInfo;
  amountIn: number;
  direction: 'A-B-C' | 'C-B-A';
}

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

function logBalances(balances: any, operation: string) {
  console.log(`\n📊 Balances ${operation}:`);
  if (balances.tokenA !== undefined) {
    console.log(`Token A: ${formatTokenAmount(balances.tokenA)} (${balances.tokenA} raw)`);
  }
  if (balances.tokenB !== undefined) {
    console.log(`Token B: ${formatTokenAmount(balances.tokenB)} (${balances.tokenB} raw)`);
  }
  if (balances.tokenC !== undefined) {
    console.log(`Token C: ${formatTokenAmount(balances.tokenC)} (${balances.tokenC} raw)`);
  }
  if (balances.sol !== undefined) {
    console.log(`Native SOL: ${balances.sol / 1e9} SOL (${balances.sol} lamports)`);
  }
}

/**
 * MULTIHOP SWAP MANAGER
 * Performs multihop swaps: A → B → C or C → B → A
 * Uses a SINGLE transaction with multiple swap instructions
 * 
 * @param swapInfo - MultihopSwapInfo containing both pools and swap parameters
 * @returns Transaction signature
 */
async function performMultihopSwap(swapInfo: MultihopSwapInfo): Promise<string> {
  try {
    console.log(`🚀 Performing multihop swap: ${swapInfo.direction}`);
    
    const { pool1, pool2, amountIn, direction } = swapInfo;
    
    // Get correct token addresses (from token info files)
    const tokenA = new PublicKey("J2hZQv8rZxSG4QRcpnhTCZUb47gEp1uVLXvk7wf2LHkM"); // Token A
    const tokenB = new PublicKey("2kvrnSKnK7fF7ruJkwYHQ8JoFmvVxjmA8z9QTh54XpQZ"); // Token B
    const tokenC = new PublicKey("9wnh4egqb2phCo6PS9BPTbcFv7ex45Q9qAvkrrnqykuP"); // Token C
    
    console.log(`Token A: ${tokenA.toString()}`);
    console.log(`Token B: ${tokenB.toString()}`);
    console.log(`Token C: ${tokenC.toString()}`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)}`);
    
    // Get user token accounts
    const userTokenA = getAssociatedTokenAddressSync(
      tokenA,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    const userTokenB = getAssociatedTokenAddressSync(
      tokenB,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    const userTokenC = getAssociatedTokenAddressSync(
      tokenC,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    
    console.log(`User Token A: ${userTokenA.toString()}`);
    console.log(`User Token B: ${userTokenB.toString()}`);
    console.log(`User Token C: ${userTokenC.toString()}`);
    
    // Check balances before
    const balancesBefore = {
      tokenA: await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      tokenC: await getTokenBalance(userTokenC),
      sol: await connection.getBalance(userKeypair.publicKey)
    };
    logBalances(balancesBefore, "BEFORE Multihop Swap");
    
    // Create single transaction with MultihopSwap instruction (like 9-multihop-swap-xyz.ts)
    const transaction = new Transaction();
    
    // Multihop swap parameters
    const minimumAmountOut = 1; // Minimum 1 unit of output token (slippage protection)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} ${direction === 'A-B-C' ? 'Token A' : 'Token C'}`);
    console.log(`Minimum Amount Out: ${formatTokenAmount(minimumAmountOut)} ${direction === 'A-B-C' ? 'Token C' : 'Token A'}`);
    console.log(`Path: ${direction === 'A-B-C' ? 'A → B → C' : 'C → B → A'}`);

    let accounts: any[];

    if (direction === 'A-B-C') {
      console.log("\n🔄 Adding MultihopSwap instruction (A → B → C)");
      
      // Prepare accounts for MultihopSwap (matching 9-multihop-swap-xyz.ts structure)
      // Based on the Rust code, the multihop swap expects:
      // 1. user_info (signer)
      // 2. token_program
      // 3. user_input_account (initial input token account)
      // 4. For each hop (7 accounts): [pool, token_a, token_b, vault_a, vault_b, intermediate_token_account, next_token_account]
      accounts = [
        // User and program accounts
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: userTokenA, isSigner: false, isWritable: true }, // Initial input (Token A)
        
        // Hop 1: A → B (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
        { pubkey: new PublicKey("87pPUYxe8W1ExxksQJNFJyJTzGNy37RCjuu1v2ocQ9JJ"), isSigner: false, isWritable: true }, // A-B pool PDA
        { pubkey: tokenA, isSigner: false, isWritable: false }, // Token A
        { pubkey: tokenB, isSigner: false, isWritable: false }, // Token B
        { pubkey: new PublicKey("Dv4RzWgcxQi9EiDzTmY3HBfLdwaUBWcSyA7PGGqzgYqT"), isSigner: false, isWritable: true }, // A-B vault A
        { pubkey: new PublicKey("GHJduy4wxzcZNRRBVuXebcd2RTwqs7qGwtZVyZ4AezcV"), isSigner: false, isWritable: true }, // A-B vault B
        { pubkey: userTokenB, isSigner: false, isWritable: true }, // Intermediate B
        { pubkey: userTokenB, isSigner: false, isWritable: true }, // Next token account (same as intermediate for first hop)
        
        // Hop 2: B → C (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
        { pubkey: new PublicKey("6qYwxHep4Svdz6Xf3xPYcqS62BYjRRCmVTUqQUVgZp45"), isSigner: false, isWritable: true }, // B-C pool PDA
        { pubkey: tokenB, isSigner: false, isWritable: false }, // Token B
        { pubkey: tokenC, isSigner: false, isWritable: false }, // Token C
        { pubkey: new PublicKey("2diUYyFqoDvtS9mfUso1Z4Mo5ikdLGrDNKK74jwd2xgw"), isSigner: false, isWritable: true }, // B-C vault A
        { pubkey: new PublicKey("EkJ7o1ZsDPceE76Xoj61qgTRpPrkBzTHXsipLSjDVrwr"), isSigner: false, isWritable: true }, // B-C vault B
        { pubkey: userTokenB, isSigner: false, isWritable: true }, // Intermediate B
        { pubkey: userTokenC, isSigner: false, isWritable: true }, // Final output (Token C)
      ];
      
    } else {
      console.log("\n🔄 Adding MultihopSwap instruction (C → B → A)");
      
      // Prepare accounts for MultihopSwap (C → B → A)
      accounts = [
        // User and program accounts
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: userTokenC, isSigner: false, isWritable: true }, // Initial input (Token C)
        
        // Hop 1: C → B (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
        { pubkey: new PublicKey("6qYwxHep4Svdz6Xf3xPYcqS62BYjRRCmVTUqQUVgZp45"), isSigner: false, isWritable: true }, // B-C pool PDA
        { pubkey: tokenB, isSigner: false, isWritable: false }, // Token B
        { pubkey: tokenC, isSigner: false, isWritable: false }, // Token C
        { pubkey: new PublicKey("2diUYyFqoDvtS9mfUso1Z4Mo5ikdLGrDNKK74jwd2xgw"), isSigner: false, isWritable: true }, // B-C vault A
        { pubkey: new PublicKey("EkJ7o1ZsDPceE76Xoj61qgTRpPrkBzTHXsipLSjDVrwr"), isSigner: false, isWritable: true }, // B-C vault B
        { pubkey: userTokenB, isSigner: false, isWritable: true }, // Intermediate B
        { pubkey: userTokenB, isSigner: false, isWritable: true }, // Next token account (same as intermediate for first hop)
        
        // Hop 2: B → A (7 accounts: pool, token_a, token_b, vault_a, vault_b, intermediate, next)
        { pubkey: new PublicKey("87pPUYxe8W1ExxksQJNFJyJTzGNy37RCjuu1v2ocQ9JJ"), isSigner: false, isWritable: true }, // A-B pool PDA
        { pubkey: tokenA, isSigner: false, isWritable: false }, // Token A
        { pubkey: tokenB, isSigner: false, isWritable: false }, // Token B
        { pubkey: new PublicKey("Dv4RzWgcxQi9EiDzTmY3HBfLdwaUBWcSyA7PGGqzgYqT"), isSigner: false, isWritable: true }, // A-B vault A
        { pubkey: new PublicKey("GHJduy4wxzcZNRRBVuXebcd2RTwqs7qGwtZVyZ4AezcV"), isSigner: false, isWritable: true }, // A-B vault B
        { pubkey: userTokenB, isSigner: false, isWritable: true }, // Intermediate B
        { pubkey: userTokenA, isSigner: false, isWritable: true }, // Final output (Token A)
      ];
    }

    // Instruction data (Borsh: MultihopSwap { amount_in, minimum_amount_out })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(4, 0); // MultihopSwap discriminator (4)
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeBigUInt64LE(BigInt(minimumAmountOut), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding MultihopSwap instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });
    
    // Send single transaction
    console.log("\n🚀 Sending multihop swap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`Transaction signature: ${signature}`);
    
    // Wait a moment for balances to update
    console.log("⏳ Waiting for balances to update...");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    // Check balances after
    const balancesAfter = {
      tokenA: await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      tokenC: await getTokenBalance(userTokenC),
      sol: await connection.getBalance(userKeypair.publicKey)
    };
    logBalances(balancesAfter, "AFTER Multihop Swap");
    
    // Calculate changes
    const tokenAChange = balancesAfter.tokenA - balancesBefore.tokenA;
    const tokenBChange = balancesAfter.tokenB - balancesBefore.tokenB;
    const tokenCChange = balancesAfter.tokenC - balancesBefore.tokenC;
    const solChange = balancesAfter.sol - balancesBefore.sol;
    
    console.log(`\n📈 Balance Changes:`);
    console.log(`Token A Change: ${formatTokenAmount(tokenAChange)} (${tokenAChange} raw)`);
    console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange} raw) - Should be ~0 for multihop`);
    console.log(`Token C Change: ${formatTokenAmount(tokenCChange)} (${tokenCChange} raw)`);
    console.log(`SOL Change: ${solChange / 1e9} SOL (${solChange} lamports) - Transaction fees`);
    
    console.log(`✅ Multihop swap ${direction} completed successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    return signature;
    
  } catch (error) {
    console.error(`❌ Error performing multihop swap:`, error);
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
async function performABCSwap() {
  console.log("🔄 Performing A → B → C Multihop Swap");
  
  // Load pool info
  const poolAB = loadPoolInfo('20-regular-pool-info.json'); // A-B pool
  const poolBC = loadPoolInfo('20-regular-pool-bc-info.json'); // B-C pool
  
  const swapInfo: MultihopSwapInfo = {
    pool1: poolAB, // A-B pool
    pool2: poolBC, // B-C pool
    amountIn: 10_000_000, // 0.01 tokens
    direction: 'A-B-C'
  };
  
  return await performMultihopSwap(swapInfo);
}

async function performCBASwap() {
  console.log("🔄 Performing C → B → A Multihop Swap");
  
  // Load pool info
  const poolAB = loadPoolInfo('20-regular-pool-info.json'); // A-B pool
  const poolBC = loadPoolInfo('20-regular-pool-bc-info.json'); // B-C pool
  
  const swapInfo: MultihopSwapInfo = {
    pool1: poolAB, // A-B pool
    pool2: poolBC, // B-C pool
    amountIn: 10_000_000, // 0.01 tokens
    direction: 'C-B-A'
  };
  
  return await performMultihopSwap(swapInfo);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Multihop Swap Manager (A-B-C)

Usage: npx ts-node 20-multihop-swap-abc.ts <operation>

Operations:
  a-b-c    - Perform multihop swap: Token A → Token B → Token C
  c-b-a    - Perform multihop swap: Token C → Token B → Token A
  both     - Perform both directions

Prerequisites:
  - 20-regular-pool-info.json must exist (A-B pool)
  - B-C pool must exist (created by pool manager)
  - Sufficient token balances
  - User keypair at ${USER_KEYPAIR_PATH}

Examples:
  npx ts-node 20-multihop-swap-abc.ts a-b-c
  npx ts-node 20-multihop-swap-abc.ts c-b-a
  npx ts-node 20-multihop-swap-abc.ts both
    `);
    process.exit(1);
  }
  
  const operation = args[0];
  
  try {
    if (operation === 'a-b-c') {
      await performABCSwap();
      
    } else if (operation === 'c-b-a') {
      await performCBASwap();
      
    } else if (operation === 'both') {
      console.log("🔄 Performing Both Multihop Swaps");
      
      // A → B → C
      console.log("\n1️⃣ A → B → C Multihop Swap");
      await performABCSwap();
      
      // C → B → A
      console.log("\n2️⃣ C → B → A Multihop Swap");
      await performCBASwap();
      
    } else {
      console.error("❌ Invalid operation. Use 'a-b-c', 'c-b-a', or 'both'");
      process.exit(1);
    }
    
    console.log("\n🎉 Multihop swap operation completed successfully!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { performMultihopSwap, MultihopSwapInfo };
