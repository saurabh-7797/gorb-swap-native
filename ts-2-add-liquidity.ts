import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

// Helper function to get token balance
async function getTokenBalance(tokenAccount: PublicKey): Promise<number> {
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
    return Number(account.amount);
  } catch (error) {
    return 0;
  }
}

// Helper function to format token amounts
function formatTokenAmount(amount: number, decimals: number = 9): string {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

/**
 * TypeScript Script 2: Add Liquidity
 * Based on IDL: AddLiquidity (discriminant: 1)
 * Args: amountA (u64), amountB (u64)
 */
async function addLiquidity() {
  try {
    console.log("🚀 TypeScript Script 2: Adding Liquidity...");
    
    // Load pool info from previous step
    const poolInfo = JSON.parse(fs.readFileSync('pool-ab-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_A_MINT = new PublicKey(poolInfo.tokenA);
    const TOKEN_B_MINT = new PublicKey(poolInfo.tokenB);
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const vaultA = new PublicKey(poolInfo.vaultA);
    const vaultB = new PublicKey(poolInfo.vaultB);
    const userTokenA = new PublicKey(poolInfo.userTokenA);
    const userTokenB = new PublicKey(poolInfo.userTokenB);
    const userLP = new PublicKey(poolInfo.userLP);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // 1. Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceLPBefore = await getTokenBalance(userLP);
    const vaultABefore = await getTokenBalance(vaultA);
    const vaultBBefore = await getTokenBalance(vaultB);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`User LP: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);
    console.log(`Vault A: ${formatTokenAmount(vaultABefore)} (${vaultABefore} raw)`);
    console.log(`Vault B: ${formatTokenAmount(vaultBBefore)} (${vaultBBefore} raw)`);

    // 2. Liquidity addition parameters
    const amountA = 2_000_000_000; // 2 tokens
    const amountB = 2_000_000_000; // 2 tokens
    
    console.log(`\n🏊 Liquidity Addition Parameters:`);
    console.log(`Adding Token A: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Adding Token B: ${formatTokenAmount(amountB)} Token B`);

    // 3. Create transaction
    const transaction = new Transaction();

    // 3.1. Add liquidity instruction
    const addLiquidityInstruction = {
      programId: AMM_PROGRAM_ID,
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
        { pubkey: LP_MINT, isSigner: false, isWritable: true },
        { pubkey: vaultA, isSigner: false, isWritable: true },
        { pubkey: vaultB, isSigner: false, isWritable: true },
        { pubkey: userTokenA, isSigner: false, isWritable: true },
        { pubkey: userTokenB, isSigner: false, isWritable: true },
        { pubkey: userLP, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([1]), // AddLiquidity discriminator
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountA)]).buffer)),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(amountB)]).buffer)),
      ]),
    };

    transaction.add(addLiquidityInstruction);

    // 4. Send transaction
    console.log("\n📝 Sending add liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair]);

    console.log(`✅ Liquidity added successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 5. Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceLPAfter = await getTokenBalance(userLP);
    const vaultAAfter = await getTokenBalance(vaultA);
    const vaultBAfter = await getTokenBalance(vaultB);
    
    console.log(`User Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`User Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`User LP: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);
    console.log(`Vault A: ${formatTokenAmount(vaultAAfter)} (${vaultAAfter} raw)`);
    console.log(`Vault B: ${formatTokenAmount(vaultBAfter)} (${vaultBAfter} raw)`);

    // 6. Calculate changes
    const tokenAChange = balanceTokenABefore - balanceTokenAAfter;
    const tokenBChange = balanceTokenBBefore - balanceTokenBAfter;
    const lpChange = balanceLPAfter - balanceLPBefore;
    const vaultAChange = vaultAAfter - vaultABefore;
    const vaultBChange = vaultBAfter - vaultBBefore;

    console.log(`\n📈 Changes:`);
    console.log(`Token A removed from user: ${formatTokenAmount(tokenAChange)}`);
    console.log(`Token B removed from user: ${formatTokenAmount(tokenBChange)}`);
    console.log(`LP tokens received: ${formatTokenAmount(lpChange)}`);
    console.log(`Token A added to vault: ${formatTokenAmount(vaultAChange)}`);
    console.log(`Token B added to vault: ${formatTokenAmount(vaultBChange)}`);

    // 7. Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      lastLiquidityAddition: {
        amountA,
        amountB,
        lpTokensReceived: lpChange,
        transactionSignature: signature,
        timestamp: new Date().toISOString(),
      }
    };

    fs.writeFileSync("pool-ab-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool info saved to pool-ab-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity:", error);
    throw error;
  }
}

// Run the function
addLiquidity().catch(console.error);
