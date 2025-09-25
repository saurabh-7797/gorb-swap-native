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
  type PoolType = 'regular' | 'native';
  type Operation = 'init' | 'add-liquidity' | 'swap-a-to-b' | 'swap-b-to-a' | 'remove-liquidity' | 'all';
  
  interface PoolConfig {
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
    if (balances.sol !== undefined) {
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
  
  // Regular token pool operations
  async function initRegularPool(tokenA: PublicKey, tokenB: PublicKey, amountA: number, amountB: number): Promise<PoolConfig> {
    console.log("🚀 Initializing Regular Token Pool...");
    
    // Derive PDAs
    const [poolPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const [lpMint] = await PublicKey.findProgramAddress(
      [Buffer.from("mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const [vaultA] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), tokenA.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const [vaultB] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), poolPDA.toBuffer(), tokenB.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const userTokenA = getAssociatedTokenAddressSync(tokenA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(tokenB, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMint, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    // Check balances before
    const balancesBefore = {
      tokenA: await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: 0
    };
    logBalances(balancesBefore, "BEFORE Pool Initialization");
    
    // Create transaction
    const transaction = new Transaction();
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: tokenA, isSigner: false, isWritable: false },
      { pubkey: tokenB, isSigner: false, isWritable: false },
      { pubkey: vaultA, isSigner: false, isWritable: true },
      { pubkey: vaultB, isSigner: false, isWritable: true },
      { pubkey: lpMint, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountB), 9);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Regular pool initialized! Signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: await getTokenBalance(userTokenA),
      tokenB: await getTokenBalance(userTokenB),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesAfter, "AFTER Pool Initialization");
    
    return {
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
  }
  
  // Native token pool operations
  async function initNativePool(token: PublicKey, amountSOL: number, amountToken: number): Promise<PoolConfig> {
    console.log("🚀 Initializing Native SOL Pool...");
    
    // Derive PDAs
    const [poolPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_pool"), token.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const [lpMint] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_lp_mint"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const [vaultToken] = await PublicKey.findProgramAddress(
      [Buffer.from("native_sol_vault"), poolPDA.toBuffer(), token.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const userToken = getAssociatedTokenAddressSync(token, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMint, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    // Check balances before
    const balancesBefore = {
      sol: await connection.getBalance(userKeypair.publicKey),
      tokenA: await getTokenBalance(userToken),
      lp: 0
    };
    logBalances(balancesBefore, "BEFORE Pool Initialization");
    
    // Create transaction
    const transaction = new Transaction();
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: NATIVE_SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: token, isSigner: false, isWritable: false },
      { pubkey: poolPDA, isSigner: false, isWritable: true }, // SOL vault is pool account
      { pubkey: vaultToken, isSigner: false, isWritable: true },
      { pubkey: lpMint, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: false, isWritable: true }, // SOL account
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountSOL), 1);
    data.writeBigUInt64LE(BigInt(amountToken), 9);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Native SOL pool initialized! Signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      sol: await connection.getBalance(userKeypair.publicKey),
      tokenA: await getTokenBalance(userToken),
      lp: await getTokenBalance(userLP)
    };
    logBalances(balancesAfter, "AFTER Pool Initialization");
    
    return {
      tokenA: NATIVE_SOL_MINT,
      tokenB: token,
      poolPDA,
      lpMint,
      vaultA: poolPDA, // SOL vault is pool account
      vaultB: vaultToken,
      userTokenA: userKeypair.publicKey, // SOL account
      userTokenB: userToken,
      userLP
    };
  }
  
  // Validation functions
  function validatePoolType(poolType: string): poolType is PoolType {
    return ['regular', 'native'].includes(poolType);
  }
  
  function validateOperation(operation: string): operation is Operation {
    return ['init', 'add-liquidity', 'swap-a-to-b', 'swap-b-to-a', 'remove-liquidity', 'all'].includes(operation);
  }
  
  async function validateTokenFiles(poolType: PoolType): Promise<void> {
    if (!fs.existsSync('token-x-info.json')) {
      throw new Error("token-x-info.json not found. Please create token X first.");
    }
    
    if (poolType === 'regular' && !fs.existsSync('token-y-info.json')) {
      throw new Error("token-y-info.json not found. Please create token Y first.");
    }
  }
  
  async function validateUserBalance(poolType: PoolType, operation: Operation): Promise<void> {
    const solBalance = await connection.getBalance(userKeypair.publicKey);
    const minSolBalance = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL minimum
    
    if (solBalance < minSolBalance) {
      throw new Error(`Insufficient SOL balance. Required: ${minSolBalance / LAMPORTS_PER_SOL} SOL, Available: ${solBalance / LAMPORTS_PER_SOL} SOL`);
    }
    
    if (operation === 'init' && poolType === 'native' && solBalance < 2 * LAMPORTS_PER_SOL) {
      throw new Error(`Insufficient SOL balance for native pool initialization. Required: 2 SOL, Available: ${solBalance / LAMPORTS_PER_SOL} SOL`);
    }
  }
  
  // Main execution function
  async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.log(`
  🚀 Unified Pool Operations Script
  
  Usage: npx ts-node unified-pool-operations.ts <pool-type> <operation> [options]
  
  Pool Types:
    regular  - Regular ERC20 token pool (Token A <-> Token B)
    native   - Native SOL pool (SOL <-> Token)
  
  Operations:
    init              - Initialize a new pool
    add-liquidity     - Add liquidity to existing pool
    swap-a-to-b       - Swap Token A to Token B (or SOL to Token for native)
    swap-b-to-a       - Swap Token B to Token A (or Token to SOL for native)
    remove-liquidity  - Remove liquidity from pool
    all              - Run all operations in sequence
  
  Examples:
    npx ts-node unified-pool-operations.ts regular init
    npx ts-node unified-pool-operations.ts native add-liquidity
    npx ts-node unified-pool-operations.ts regular all
    npx ts-node unified-pool-operations.ts native all
  
  Prerequisites:
    - token-x-info.json must exist (created by token creation scripts)
    - token-y-info.json must exist for regular pools (created by token creation scripts)
    - Sufficient SOL balance for transactions
    - User keypair at ${USER_KEYPAIR_PATH}
      `);
      process.exit(1);
    }
    
    const poolType = args[0];
    const operation = args[1];
    
    // Validate arguments
    if (!validatePoolType(poolType)) {
      console.error("❌ Invalid pool type. Use 'regular' or 'native'");
      process.exit(1);
    }
    
    if (!validateOperation(operation)) {
      console.error("❌ Invalid operation. Use 'init', 'add-liquidity', 'swap-a-to-b', 'swap-b-to-a', 'remove-liquidity', or 'all'");
      process.exit(1);
    }
    
    try {
      console.log(`🚀 Starting ${poolType} pool ${operation} operation...`);
      console.log(`📍 RPC Endpoint: ${RPC_ENDPOINT}`);
      console.log(`👤 User: ${userKeypair.publicKey.toString()}`);
      
      // Validate prerequisites
      await validateTokenFiles(poolType);
      await validateUserBalance(poolType, operation);
      
      console.log("✅ Prerequisites validated");
      
      if (operation === 'all') {
        await runAllOperations(poolType);
      } else {
        await runSingleOperation(poolType, operation);
      }
      
      console.log("\n🎉 All operations completed successfully!");
    } catch (error) {
      console.error("💥 Operation failed:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
      }
      process.exit(1);
    }
  }
  
  // Run all operations in sequence
  async function runAllOperations(poolType: PoolType) {
    console.log(`\n🔄 Running all operations for ${poolType} pool...`);
    
    let poolConfig: PoolConfig;
    
    if (poolType === 'regular') {
      // Load token info
      const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
      const tokenYInfo = JSON.parse(fs.readFileSync('token-y-info.json', 'utf-8'));
      
      const tokenX = new PublicKey(tokenXInfo.mint);
      const tokenY = new PublicKey(tokenYInfo.mint);
      
      // Initialize pool
      poolConfig = await initRegularPool(tokenX, tokenY, 2_000_000_000, 3_000_000_000);
      
      // Add liquidity
      await addLiquidity(poolConfig, poolType, 1_000_000_000, 1_500_000_000);
      
      // Swap A to B
      await swap(poolConfig, poolType, 'a-to-b', 100_000_000);
      
      // Swap B to A
      await swap(poolConfig, poolType, 'b-to-a', 100_000_000);
      
      // Remove liquidity
      await removeLiquidity(poolConfig, poolType);
      
    } else {
      // Load token info
      const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
      const tokenX = new PublicKey(tokenXInfo.mint);
      
      // Initialize pool
      poolConfig = await initNativePool(tokenX, 1_000_000_000, 2_000_000_000);
      
      // Add liquidity
      await addLiquidity(poolConfig, poolType, 0.5 * LAMPORTS_PER_SOL, 1_000_000_000);
      
      // Swap SOL to Token
      await swap(poolConfig, poolType, 'a-to-b', 0.1 * LAMPORTS_PER_SOL);
      
      // Swap Token to SOL
      await swap(poolConfig, poolType, 'b-to-a', 0.1 * Math.pow(10, 9));
      
      // Remove liquidity
      await removeLiquidity(poolConfig, poolType);
    }
  }
  
  // Run single operation
  async function runSingleOperation(poolType: PoolType, operation: Operation) {
    console.log(`Running single operation: ${operation} for ${poolType} pool`);
    
    let poolConfig: PoolConfig;
    
    if (operation === 'init') {
      if (poolType === 'regular') {
        // Load token info
        const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
        const tokenYInfo = JSON.parse(fs.readFileSync('token-y-info.json', 'utf-8'));
        
        const tokenX = new PublicKey(tokenXInfo.mint);
        const tokenY = new PublicKey(tokenYInfo.mint);
        
        poolConfig = await initRegularPool(tokenX, tokenY, 2_000_000_000, 3_000_000_000);
        
        // Save pool config for future use
        const poolInfo = {
          poolType: 'regular',
          ...poolConfig,
          tokenA: poolConfig.tokenA.toString(),
          tokenB: poolConfig.tokenB.toString(),
          poolPDA: poolConfig.poolPDA.toString(),
          lpMint: poolConfig.lpMint.toString(),
          vaultA: poolConfig.vaultA.toString(),
          vaultB: poolConfig.vaultB.toString(),
          userTokenA: poolConfig.userTokenA.toString(),
          userTokenB: poolConfig.userTokenB.toString(),
          userLP: poolConfig.userLP.toString(),
        };
        fs.writeFileSync("unified-regular-pool-info.json", JSON.stringify(poolInfo, null, 2));
        
      } else {
        // Load token info
        const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf-8'));
        const tokenX = new PublicKey(tokenXInfo.mint);
        
        poolConfig = await initNativePool(tokenX, 1_000_000_000, 2_000_000_000);
        
        // Save pool config for future use
        const poolInfo = {
          poolType: 'native',
          ...poolConfig,
          tokenA: poolConfig.tokenA.toString(),
          tokenB: poolConfig.tokenB.toString(),
          poolPDA: poolConfig.poolPDA.toString(),
          lpMint: poolConfig.lpMint.toString(),
          vaultA: poolConfig.vaultA.toString(),
          vaultB: poolConfig.vaultB.toString(),
          userTokenA: poolConfig.userTokenA.toString(),
          userTokenB: poolConfig.userTokenB.toString(),
          userLP: poolConfig.userLP.toString(),
        };
        fs.writeFileSync("unified-native-pool-info.json", JSON.stringify(poolInfo, null, 2));
      }
    } else {
      // Load existing pool config
      const poolInfoFile = poolType === 'regular' ? 'unified-regular-pool-info.json' : 'unified-native-pool-info.json';
      
      if (!fs.existsSync(poolInfoFile)) {
        throw new Error(`Pool info file ${poolInfoFile} not found. Please initialize the pool first.`);
      }
      
      const poolInfo = JSON.parse(fs.readFileSync(poolInfoFile, 'utf-8'));
      poolConfig = {
        tokenA: new PublicKey(poolInfo.tokenA),
        tokenB: new PublicKey(poolInfo.tokenB),
        poolPDA: new PublicKey(poolInfo.poolPDA),
        lpMint: new PublicKey(poolInfo.lpMint),
        vaultA: new PublicKey(poolInfo.vaultA),
        vaultB: new PublicKey(poolInfo.vaultB),
        userTokenA: new PublicKey(poolInfo.userTokenA),
        userTokenB: new PublicKey(poolInfo.userTokenB),
        userLP: new PublicKey(poolInfo.userLP),
      };
      
      // Execute the operation
      switch (operation) {
        case 'add-liquidity':
          const amountA = poolType === 'native' ? 0.5 * LAMPORTS_PER_SOL : 1_000_000_000;
          const amountB = poolType === 'native' ? 1_000_000_000 : 1_500_000_000;
          await addLiquidity(poolConfig, poolType, amountA, amountB);
          break;
          
        case 'swap-a-to-b':
          const swapAmountA = poolType === 'native' ? 0.1 * LAMPORTS_PER_SOL : 100_000_000;
          await swap(poolConfig, poolType, 'a-to-b', swapAmountA);
          break;
          
        case 'swap-b-to-a':
          const swapAmountB = poolType === 'native' ? 0.1 * Math.pow(10, 9) : 100_000_000;
          await swap(poolConfig, poolType, 'b-to-a', swapAmountB);
          break;
          
        case 'remove-liquidity':
          await removeLiquidity(poolConfig, poolType);
          break;
          
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    }
  }
  
  // Add liquidity operations
  async function addLiquidity(poolConfig: PoolConfig, poolType: PoolType, amountA: number, amountB: number) {
    console.log(`\n🏊 Adding liquidity to ${poolType} pool...`);
    
    // Check balances before
    const balancesBefore = {
      tokenA: poolType === 'native' ? await connection.getBalance(poolConfig.userTokenA) : await getTokenBalance(poolConfig.userTokenA),
      tokenB: await getTokenBalance(poolConfig.userTokenB),
      lp: await getTokenBalance(poolConfig.userLP)
    };
    logBalances(balancesBefore, "BEFORE Adding Liquidity");
    
    // Create transaction
    const transaction = new Transaction();
    
    let accounts;
    if (poolType === 'regular') {
      accounts = [
        { pubkey: poolConfig.poolPDA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.tokenA, isSigner: false, isWritable: false },
        { pubkey: poolConfig.tokenB, isSigner: false, isWritable: false },
        { pubkey: poolConfig.vaultA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.vaultB, isSigner: false, isWritable: true },
        { pubkey: poolConfig.lpMint, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenB, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userLP, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
    } else {
      accounts = [
        { pubkey: poolConfig.poolPDA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.tokenA, isSigner: false, isWritable: false },
        { pubkey: poolConfig.tokenB, isSigner: false, isWritable: false },
        { pubkey: poolConfig.vaultA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.vaultB, isSigner: false, isWritable: true },
        { pubkey: poolConfig.lpMint, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenB, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userLP, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
    }
    
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountB), 9);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Liquidity added! Signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolType === 'native' ? await connection.getBalance(poolConfig.userTokenA) : await getTokenBalance(poolConfig.userTokenA),
      tokenB: await getTokenBalance(poolConfig.userTokenB),
      lp: await getTokenBalance(poolConfig.userLP)
    };
    logBalances(balancesAfter, "AFTER Adding Liquidity");
  }
  
  // Swap operations
  async function swap(poolConfig: PoolConfig, poolType: PoolType, direction: 'a-to-b' | 'b-to-a', amount: number) {
    console.log(`\n🔄 Swapping ${direction} in ${poolType} pool...`);
    
    // Check balances before
    const balancesBefore = {
      tokenA: poolType === 'native' ? await connection.getBalance(poolConfig.userTokenA) : await getTokenBalance(poolConfig.userTokenA),
      tokenB: await getTokenBalance(poolConfig.userTokenB)
    };
    logBalances(balancesBefore, "BEFORE Swap");
    
    // Create transaction
    const transaction = new Transaction();
    
    let accounts;
    const directionAToB = direction === 'a-to-b';
    
    if (poolType === 'regular') {
      accounts = [
        { pubkey: poolConfig.poolPDA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.tokenA, isSigner: false, isWritable: false },
        { pubkey: poolConfig.tokenB, isSigner: false, isWritable: false },
        { pubkey: poolConfig.vaultA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.vaultB, isSigner: false, isWritable: true },
        { pubkey: directionAToB ? poolConfig.userTokenA : poolConfig.userTokenB, isSigner: false, isWritable: true },
        { pubkey: directionAToB ? poolConfig.userTokenB : poolConfig.userTokenA, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
    } else {
      accounts = [
        { pubkey: poolConfig.poolPDA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.tokenA, isSigner: false, isWritable: false },
        { pubkey: poolConfig.tokenB, isSigner: false, isWritable: false },
        { pubkey: poolConfig.vaultA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.vaultB, isSigner: false, isWritable: true },
        { pubkey: directionAToB ? poolConfig.userTokenA : poolConfig.userTokenB, isSigner: false, isWritable: true },
        { pubkey: directionAToB ? poolConfig.userTokenB : poolConfig.userTokenA, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
    }
    
    const data = Buffer.alloc(1 + 8 + 1);
    data.writeUInt8(3, 0); // Swap discriminator
    data.writeBigUInt64LE(BigInt(amount), 1);
    data.writeUInt8(directionAToB ? 1 : 0, 9);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Swap completed! Signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolType === 'native' ? await connection.getBalance(poolConfig.userTokenA) : await getTokenBalance(poolConfig.userTokenA),
      tokenB: await getTokenBalance(poolConfig.userTokenB)
    };
    logBalances(balancesAfter, "AFTER Swap");
  }
  
  // Remove liquidity operations
  async function removeLiquidity(poolConfig: PoolConfig, poolType: PoolType) {
    console.log(`\n🏊 Removing liquidity from ${poolType} pool...`);
    
    // Get current LP balance
    const lpBalance = await getTokenBalance(poolConfig.userLP);
    const lpAmountToRemove = Math.floor(lpBalance * 0.1); // Remove 10%
    
    if (lpAmountToRemove === 0) {
      console.log("⚠️ No LP tokens to remove");
      return;
    }
    
    // Check balances before
    const balancesBefore = {
      tokenA: poolType === 'native' ? await connection.getBalance(poolConfig.userTokenA) : await getTokenBalance(poolConfig.userTokenA),
      tokenB: await getTokenBalance(poolConfig.userTokenB),
      lp: lpBalance
    };
    logBalances(balancesBefore, "BEFORE Removing Liquidity");
    
    // Create transaction
    const transaction = new Transaction();
    
    let accounts;
    if (poolType === 'regular') {
      accounts = [
        { pubkey: poolConfig.poolPDA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.tokenA, isSigner: false, isWritable: false },
        { pubkey: poolConfig.tokenB, isSigner: false, isWritable: false },
        { pubkey: poolConfig.vaultA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.vaultB, isSigner: false, isWritable: true },
        { pubkey: poolConfig.lpMint, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userLP, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenB, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
    } else {
      accounts = [
        { pubkey: poolConfig.poolPDA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.tokenA, isSigner: false, isWritable: false },
        { pubkey: poolConfig.tokenB, isSigner: false, isWritable: false },
        { pubkey: poolConfig.vaultA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.vaultB, isSigner: false, isWritable: true },
        { pubkey: poolConfig.lpMint, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userLP, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenA, isSigner: false, isWritable: true },
        { pubkey: poolConfig.userTokenB, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
    }
    
    const data = Buffer.alloc(1 + 8);
    data.writeUInt8(2, 0); // RemoveLiquidity discriminator
    data.writeBigUInt64LE(BigInt(lpAmountToRemove), 1);
    
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair], {
      commitment: "confirmed",
    });
    
    console.log(`✅ Liquidity removed! Signature: ${signature}`);
    
    // Check balances after
    const balancesAfter = {
      tokenA: poolType === 'native' ? await connection.getBalance(poolConfig.userTokenA) : await getTokenBalance(poolConfig.userTokenA),
      tokenB: await getTokenBalance(poolConfig.userTokenB),
      lp: await getTokenBalance(poolConfig.userLP)
    };
    logBalances(balancesAfter, "AFTER Removing Liquidity");
  }
  
  // Run the script
  if (require.main === module) {
    main().catch(console.error);
  }
  
  export { main, initRegularPool, initNativePool };
  