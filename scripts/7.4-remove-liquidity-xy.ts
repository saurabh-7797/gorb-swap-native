import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
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
 * TypeScript Script: Remove Liquidity from Pool X-Y
 * This removes liquidity from the existing X-Y pool
 */
async function removeLiquidityXY() {
  try {
    console.log("🚀 TypeScript Script: Removing Liquidity from Pool X-Y...");
    
    // Load pool info from existing file
    const poolInfo = JSON.parse(fs.readFileSync('pool-xy-info.json', 'utf-8'));
    
    const POOL_PDA = new PublicKey(poolInfo.poolPDA);
    const TOKEN_X_MINT = new PublicKey(poolInfo.tokenX);
    const TOKEN_Y_MINT = new PublicKey(poolInfo.tokenY);
    const LP_MINT_PDA = new PublicKey(poolInfo.lpMint);
    const VAULT_X = new PublicKey(poolInfo.vaultX);
    const VAULT_Y = new PublicKey(poolInfo.vaultY);
    const USER_TOKEN_X = new PublicKey(poolInfo.userTokenX);
    const USER_TOKEN_Y = new PublicKey(poolInfo.userTokenY);
    const USER_LP = new PublicKey(poolInfo.userLP);

    console.log(`Pool PDA: ${POOL_PDA.toString()}`);
    console.log(`Token X Mint: ${TOKEN_X_MINT.toString()}`);
    console.log(`Token Y Mint: ${TOKEN_Y_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT_PDA.toString()}`);
    console.log(`Vault X: ${VAULT_X.toString()}`);
    console.log(`Vault Y: ${VAULT_Y.toString()}`);
    console.log(`User Token X ATA: ${USER_TOKEN_X.toString()}`);
    console.log(`User Token Y ATA: ${USER_TOKEN_Y.toString()}`);
    console.log(`User LP ATA: ${USER_LP.toString()}`);

    // Check balances before removing liquidity
    console.log("\n📊 Balances BEFORE Removing Liquidity:");
    const balanceTokenXBefore = await getTokenBalance(USER_TOKEN_X);
    const balanceTokenYBefore = await getTokenBalance(USER_TOKEN_Y);
    const lpBalanceBefore = await getTokenBalance(USER_LP);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXBefore)} (${balanceTokenXBefore} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceTokenYBefore)} (${balanceTokenYBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(lpBalanceBefore, 0)} (${lpBalanceBefore} raw)`);

    // Remove liquidity parameters
    const lpAmountToRemove = Math.floor(lpBalanceBefore * 0.1); // Remove 10% of LP tokens
    console.log(`\n🏊 Removing Liquidity Parameters:`);
    console.log(`LP Tokens to Remove: ${formatTokenAmount(lpAmountToRemove, 0)} (${lpAmountToRemove} raw)`);
    console.log(`Percentage: 10% of total LP tokens`);

    // Create transaction
    const transaction = new Transaction();

    // Prepare accounts for RemoveLiquidity (matching contract order)
    const accounts = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_X_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Y_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_X, isSigner: false, isWritable: true },
      { pubkey: VAULT_Y, isSigner: false, isWritable: true },
      { pubkey: LP_MINT_PDA, isSigner: false, isWritable: true },
      { pubkey: USER_LP, isSigner: false, isWritable: true },
      { pubkey: USER_TOKEN_X, isSigner: false, isWritable: true },
      { pubkey: USER_TOKEN_Y, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data (Borsh: RemoveLiquidity { lp_amount })
    const data = Buffer.alloc(1 + 8); // 1 byte discriminator + u64
    data.writeUInt8(2, 0); // RemoveLiquidity discriminator (2)
    data.writeBigUInt64LE(BigInt(lpAmountToRemove), 1);

    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);
    console.log(`📝 Adding RemoveLiquidity instruction...`);

    // Add instruction to transaction
    transaction.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data: data,
    });

    // Send transaction
    console.log(`\n📝 Sending remove liquidity transaction...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      { commitment: "confirmed" }
    );

    console.log(`✅ Liquidity removed successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // Check balances after removing liquidity
    console.log(`\n📊 Balances AFTER Removing Liquidity:`);
    const balanceTokenXAfter = await getTokenBalance(USER_TOKEN_X);
    const balanceTokenYAfter = await getTokenBalance(USER_TOKEN_Y);
    const lpBalanceAfter = await getTokenBalance(USER_LP);
    console.log(`Token X: ${formatTokenAmount(balanceTokenXAfter)} (${balanceTokenXAfter} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceTokenYAfter)} (${balanceTokenYAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(lpBalanceAfter, 0)} (${lpBalanceAfter} raw)`);

    // Calculate changes
    const tokenXReceived = balanceTokenXAfter - balanceTokenXBefore;
    const tokenYReceived = balanceTokenYAfter - balanceTokenYBefore;
    const lpTokensRemoved = lpBalanceBefore - lpBalanceAfter;
    
    console.log(`\n📈 Remove Liquidity Results:`);
    console.log(`LP Tokens Removed: ${formatTokenAmount(lpTokensRemoved, 0)} (${lpTokensRemoved} raw)`);
    console.log(`Token X Received: ${formatTokenAmount(tokenXReceived)} (${tokenXReceived} raw)`);
    console.log(`Token Y Received: ${formatTokenAmount(tokenYReceived)} (${tokenYReceived} raw)`);

    // Create remove liquidity info file
    const removeLiquidityInfo = {
      poolPDA: poolInfo.poolPDA,
      tokenX: poolInfo.tokenX,
      tokenY: poolInfo.tokenY,
      lpTokensRemoved: lpTokensRemoved,
      tokenXReceived: tokenXReceived,
      tokenYReceived: tokenYReceived,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      userTokenX: poolInfo.userTokenX,
      userTokenY: poolInfo.userTokenY,
      userLP: poolInfo.userLP
    };

    fs.writeFileSync("remove-liquidity-xy-info.json", JSON.stringify(removeLiquidityInfo, null, 2));
    console.log("\n💾 Remove liquidity info saved to remove-liquidity-xy-info.json");

    // Update pool info file
    const updatedPoolInfo = {
      ...poolInfo,
      lastLiquidityRemove: {
        lpTokensRemoved: lpTokensRemoved,
        tokenXReceived: tokenXReceived,
        tokenYReceived: tokenYReceived,
        transactionSignature: signature,
        timestamp: new Date().toISOString()
      }
    };

    fs.writeFileSync("pool-xy-info.json", JSON.stringify(updatedPoolInfo, null, 2));
    console.log("💾 Pool info updated with liquidity removal details");

  } catch (error) {
    console.error("❌ Error removing liquidity from pool X-Y:", error);
    throw error;
  }
}

// Run the script
removeLiquidityXY()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
