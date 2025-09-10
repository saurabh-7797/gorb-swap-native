import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
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
 * Add Liquidity to A-Wrapped SOL Pool
 * This adds more liquidity to the existing pool
 */
async function addLiquidityAWrappedSOL() {
  try {
    console.log("🚀 Adding Liquidity to A-Wrapped SOL Pool...");
    
    // Load pool info
    const poolInfo = JSON.parse(fs.readFileSync('pool-a-wrapped-sol-final-info.json', 'utf-8'));
    
    const TOKEN_A_MINT = new PublicKey(poolInfo.tokenA);
    const WRAPPED_SOL_MINT = new PublicKey(poolInfo.wrappedSOL);
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const VAULT_A = new PublicKey(poolInfo.vaultA);
    const VAULT_WRAPPED_SOL = new PublicKey(poolInfo.vaultWrappedSOL);
    
    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Wrapped SOL: ${WRAPPED_SOL_MINT.toString()}`);

    // 1. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userWrappedSOLATA = getAssociatedTokenAddressSync(WRAPPED_SOL_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Wrapped SOL ATA: ${userWrappedSOLATA.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 2. Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceWrappedSOLBefore = await getTokenBalance(userWrappedSOLATA);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(balanceWrappedSOLBefore)} (${balanceWrappedSOLBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // 3. Liquidity addition parameters (maintaining 1:1 ratio)
    const amountA = 2_000_000_000; // 2 Token A
    const amountWrappedSOL = 2_000_000_000; // 2 Wrapped SOL
    
    console.log(`\n🏊 Adding Liquidity Parameters:`);
    console.log(`Token A to add: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Wrapped SOL to add: ${formatTokenAmount(amountWrappedSOL)} Wrapped SOL`);
    console.log(`Ratio: 1:1 (maintaining pool ratio)`);

    // 4. Create transaction
    const transaction = new Transaction();

    // 4.1. Prepare accounts for AddLiquidity (matching Rust program order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: WRAPPED_SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_A, isSigner: false, isWritable: true },
      { pubkey: VAULT_WRAPPED_SOL, isSigner: false, isWritable: true },
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userWrappedSOLATA, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 4.2. Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator (1)
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountWrappedSOL), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 4.3. Add AddLiquidity instruction
    console.log("📝 Adding AddLiquidity instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // 5. Send transaction
    console.log("\n📝 Sending add liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Liquidity added successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 6. Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceWrappedSOLAfter = await getTokenBalance(userWrappedSOLATA);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(balanceWrappedSOLAfter)} (${balanceWrappedSOLAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 7. Calculate changes
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const wrappedSOLChange = balanceWrappedSOLAfter - balanceWrappedSOLBefore;
    const lpChange = balanceLPAfter - balanceLPBefore;
    
    console.log(`\n📈 Changes:`);
    console.log(`Token A: ${formatTokenAmount(tokenAChange)} (${tokenAChange} raw)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(wrappedSOLChange)} (${wrappedSOLChange} raw)`);
    console.log(`LP Tokens: +${formatTokenAmount(lpChange)} (${lpChange} raw)`);

    // 8. Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      additionalAmountA: amountA,
      additionalAmountWrappedSOL: amountWrappedSOL,
      addLiquiditySignature: signature,
      totalLPAfter: balanceLPAfter,
    };

    fs.writeFileSync("pool-a-wrapped-sol-final-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool info saved to pool-a-wrapped-sol-final-info.json");

  } catch (error) {
    console.error("❌ Error adding liquidity:", error);
    throw error;
  }
}

// Run the function
addLiquidityAWrappedSOL().catch(console.error);
