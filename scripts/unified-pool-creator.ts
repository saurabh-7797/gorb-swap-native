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

interface RegularTokenInfo {
  mint: string;
  userATA: string;
  amount: number;
}

interface NativeTokenInfo {
  mint: string;
  userATA: string;
  amount: number;
  solAmount: number; // in lamports
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
 * UNIFIED POOL CREATOR
 * Creates either a regular pool (Token A ↔ Token B) or native pool (SOL ↔ Token)
 * 
 * @param poolType - 'regular' for Token A ↔ Token B, 'native' for SOL ↔ Token
 * @param tokenAInfo - Token A information (for regular pools) or null (for native pools)
 * @param tokenBInfo - Token B information (for regular pools) or Token information (for native pools)
 * @returns PoolConfig with all pool information
 */
async function createPool(
  poolType: 'regular' | 'native',
  tokenAInfo: RegularTokenInfo | null,
  tokenBInfo: RegularTokenInfo | NativeTokenInfo
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
      amountA = (tokenBInfo as NativeTokenInfo).solAmount;
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
    
    const fileName = poolType === 'regular' ? 'unified-regular-pool-info.json' : 'unified-native-pool-info.json';
    fs.writeFileSync(fileName, JSON.stringify(poolInfo, null, 2));
    console.log(`\n💾 Pool info saved to ${fileName}`);
    
    return poolConfig;
    
  } catch (error) {
    console.error(`❌ Error creating ${poolType} pool:`, error);
    throw error;
  }
}

// Helper function to create a new token
async function createNewToken(tokenName: string): Promise<{mint: string, userATA: string}> {
  console.log(`🚀 Creating new ${tokenName}...`);
  
  const { Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, SYSVAR_RENT_PUBKEY } = await import("@solana/web3.js");
  const { 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction, 
    createInitializeMintInstruction, 
    createMintToInstruction, 
    getAccount, 
    MINT_SIZE, 
    getMinimumBalanceForRentExemptMint 
  } = await import("@solana/spl-token");
  
  const tokenKeypair = Keypair.generate();
  console.log(`${tokenName} Mint: ${tokenKeypair.publicKey.toString()}`);
  
  const userToken = getAssociatedTokenAddressSync(
    tokenKeypair.publicKey,
    userKeypair.publicKey,
    false,
    SPL_TOKEN_PROGRAM_ID,
    ATA_PROGRAM_ID
  );
  console.log(`${tokenName} User ATA: ${userToken.toString()}`);

  // Create mint account
  const mintLamports = await getMinimumBalanceForRentExemptMint(connection);
  
  const transaction = new Transaction();
  
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: userKeypair.publicKey,
      newAccountPubkey: tokenKeypair.publicKey,
      lamports: mintLamports,
      space: MINT_SIZE,
      programId: SPL_TOKEN_PROGRAM_ID,
    })
  );

  // Initialize mint
  transaction.add(
    createInitializeMintInstruction(
      tokenKeypair.publicKey,
      9, // decimals
      userKeypair.publicKey, // mint authority
      null, // freeze authority
      SPL_TOKEN_PROGRAM_ID
    )
  );

  // Create user ATA
  transaction.add(
    createAssociatedTokenAccountInstruction(
      userKeypair.publicKey, // payer
      userToken, // ata
      userKeypair.publicKey, // owner
      tokenKeypair.publicKey, // mint
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    )
  );

  // Send transaction
  const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair, tokenKeypair]);
  console.log(`✅ ${tokenName} created successfully! Signature: ${signature}`);

  // Mint tokens to user
  const mintAmount = tokenName === 'TokenA' ? 2_000_000_000_000 : 3_000_000_000_000; // 2B or 3B tokens
  const mintTransaction = new Transaction();
  mintTransaction.add(
    createMintToInstruction(
      tokenKeypair.publicKey, // mint
      userToken, // destination
      userKeypair.publicKey, // authority
      mintAmount, // amount
      [], // multiSigners
      SPL_TOKEN_PROGRAM_ID
    )
  );
  
  await sendAndConfirmTransaction(connection, mintTransaction, [userKeypair]);
  
  const balance = await getTokenBalance(userToken);
  console.log(`📊 ${tokenName} Balance: ${formatTokenAmount(balance)} (${balance} raw)`);

  return {
    mint: tokenKeypair.publicKey.toString(),
    userATA: userToken.toString()
  };
}

// Example usage functions
async function createRegularPoolExample() {
  console.log("\n🔄 Example: Creating Regular Pool (Token A ↔ Token B)");
  
  // Create fresh tokens to avoid conflicts
  const tokenAInfo = await createNewToken('TokenA');
  const tokenBInfo = await createNewToken('TokenB');
  
  const regularTokenAInfo: RegularTokenInfo = {
    mint: tokenAInfo.mint,
    userATA: tokenAInfo.userATA,
    amount: 2_000_000_000 // 2 tokens
  };
  
  const regularTokenBInfo: RegularTokenInfo = {
    mint: tokenBInfo.mint,
    userATA: tokenBInfo.userATA,
    amount: 3_000_000_000 // 3 tokens
  };
  
  return await createPool('regular', regularTokenAInfo, regularTokenBInfo);
}

async function createNativePoolExample() {
  console.log("\n🔄 Example: Creating Native Pool (SOL ↔ Token)");
  
  // Create fresh token to avoid conflicts
  const tokenInfo = await createNewToken('Token');
  
  const nativeTokenInfo: NativeTokenInfo = {
    mint: tokenInfo.mint,
    userATA: tokenInfo.userATA,
    amount: 2_000_000_000, // 2 tokens
    solAmount: 1_000_000_000 // 1 SOL in lamports
  };
  
  return await createPool('native', null, nativeTokenInfo);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Unified Pool Creator

Usage: npx ts-node unified-pool-creator.ts <pool-type>

Pool Types:
  regular  - Create regular pool (Token A ↔ Token B)
  native   - Create native pool (SOL ↔ Token)

Examples:
  npx ts-node unified-pool-creator.ts regular
  npx ts-node unified-pool-creator.ts native

Prerequisites:
  - token-x-info.json must exist (created by token creation scripts)
  - token-y-info.json must exist for regular pools
  - Sufficient SOL balance for transactions
  - User keypair at ${USER_KEYPAIR_PATH}
    `);
    process.exit(1);
  }
  
  const poolType = args[0];
  
  if (poolType === 'regular') {
    await createRegularPoolExample();
  } else if (poolType === 'native') {
    await createNativePoolExample();
  } else {
    console.error("❌ Invalid pool type. Use 'regular' or 'native'");
    process.exit(1);
  }
  
  console.log("\n🎉 Pool creation completed successfully!");
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { createPool, PoolConfig, RegularTokenInfo, NativeTokenInfo };
