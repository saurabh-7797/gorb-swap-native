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
 * TypeScript Script: Remove Liquidity from Pool T-V
 * Based on IDL: RemoveLiquidity (discriminant: 2)
 * Args: lp_amount (u64)
 */
async function removeLiquidityTV() {
  try {
    console.log("🚀 TypeScript Script: Removing Liquidity from Pool T-V...");
    
    // Load pool info from previous steps
    const poolInfo = JSON.parse(fs.readFileSync('pool-tv-info.json', 'utf-8'));
    
    const poolPDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_T_MINT = new PublicKey(poolInfo.tokenT);
    const TOKEN_V_MINT = new PublicKey(poolInfo.tokenV);
    const lpMintPDA = new PublicKey(poolInfo.lpMint);
    const vaultT = new PublicKey(poolInfo.vaultT);
    const vaultV = new PublicKey(poolInfo.vaultV);
    const userTokenT = new PublicKey(poolInfo.userTokenT);
    const userTokenV = new PublicKey(poolInfo.userTokenV);
    const userLP = new PublicKey(poolInfo.userLP);
    
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Token T: ${TOKEN_T_MINT.toString()}`);
    console.log(`Token V: ${TOKEN_V_MINT.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // Check balances before removing liquidity
    console.log("\n📊 Balances BEFORE Removing Liquidity:");
    const balanceTokenTBefore = await getTokenBalance(userTokenT);
    const balanceTokenVBefore = await getTokenBalance(userTokenV);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token T: ${formatTokenAmount(balanceTokenTBefore)} (${balanceTokenTBefore} raw)`);
    console.log(`Token V: ${formatTokenAmount(balanceTokenVBefore)} (${balanceTokenVBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // Liquidity removal parameters
    const lpAmountToRemove = 5_000_000_000; // 5 LP tokens (half of what we have)
    
    console.log(`\n🏊 Liquidity Removal Parameters:`);
    console.log(`LP Tokens to Remove: ${formatTokenAmount(lpAmountToRemove)} LP Tokens`);
    console.log(`Percentage: ${((lpAmountToRemove / balanceLPBefore) * 100).toFixed(2)}% of total LP`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for RemoveLiquidity (matching Rust program order)
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_T_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_V_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultT, isSigner: false, isWritable: true },
      { pubkey: vaultV, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userTokenT, isSigner: false, isWritable: true },
      { pubkey: userTokenV, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: RemoveLiquidity { lp_amount })
    const data = Buffer.alloc(1 + 8); // 1 byte discriminator + u64
    data.writeUInt8(2, 0); // RemoveLiquidity discriminator
    data.writeBigUInt64LE(BigInt(lpAmountToRemove), 1);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // Add RemoveLiquidity instruction
    console.log("📝 Adding RemoveLiquidity instruction...");
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("\n📝 Sending remove liquidity transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ Liquidity removed from Pool T-V successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after removing liquidity
    console.log("\n📊 Balances AFTER Removing Liquidity:");
    const balanceTokenTAfter = await getTokenBalance(userTokenT);
    const balanceTokenVAfter = await getTokenBalance(userTokenV);
    const balanceLPAfter = await getTokenBalance(userLP);
    
    console.log(`Token T: ${formatTokenAmount(balanceTokenTAfter)} (${balanceTokenTAfter} raw)`);
    console.log(`Token V: ${formatTokenAmount(balanceTokenVAfter)} (${balanceTokenVAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenTReceived = balanceTokenTAfter - balanceTokenTBefore;
    const tokenVReceived = balanceTokenVBefore - balanceTokenVAfter;
    const lpTokensBurned = balanceLPBefore - balanceLPAfter;
    
    console.log(`\n📈 Liquidity Removal Results:`);
    console.log(`Token T Received: ${formatTokenAmount(tokenTReceived)}`);
    console.log(`Token V Received: ${formatTokenAmount(tokenVReceived)}`);
    console.log(`LP Tokens Burned: ${formatTokenAmount(lpTokensBurned)}`);

    // Calculate exchange rate
    const tRate = tokenTReceived / lpAmountToRemove;
    const vRate = tokenVReceived / lpAmountToRemove;
    console.log(`\n💱 Exchange Rates:`);
    console.log(`1 LP Token = ${formatTokenAmount(tRate)} Token T`);
    console.log(`1 LP Token = ${formatTokenAmount(vRate)} Token V`);

    // Save updated pool info
    const updatedPoolInfo = {
      ...poolInfo,
      removedLiquidity: lpAmountToRemove,
      tokenTReceived: tokenTReceived,
      tokenVReceived: tokenVReceived,
      remainingLPTokens: balanceLPAfter,
      removeLiquiditySignature: signature,
    };

    fs.writeFileSync("pool-tv-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("\n💾 Updated pool T-V info saved to pool-tv-info.json");

  } catch (error) {
    console.error("❌ Error removing liquidity from pool T-V:", error);
    throw error;
  }
}

// Run the function
removeLiquidityTV().catch(console.error);
