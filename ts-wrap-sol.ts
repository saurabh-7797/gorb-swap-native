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
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAccount,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createSyncNativeInstruction,
} from "@solana/spl-token";
import * as fs from "fs";

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
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
 * Wrap Native SOL to Wrapped SOL
 * This creates a Wrapped SOL token and wraps native SOL into it
 */
async function wrapSOL() {
  try {
    console.log("🚀 Wrapping Native SOL to Wrapped SOL...");
    
    // 1. Create Wrapped SOL mint
    const wrappedSOLKeypair = Keypair.generate();
    console.log(`Wrapped SOL Mint: ${wrappedSOLKeypair.publicKey.toString()}`);
    
    // 2. Create user's Wrapped SOL ATA
    const userWrappedSOLATA = getAssociatedTokenAddressSync(
      wrappedSOLKeypair.publicKey,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    console.log(`User Wrapped SOL ATA: ${userWrappedSOLATA.toString()}`);

    // 3. Check balances before
    console.log("\n📊 Balances BEFORE Wrapping:");
    const solBalanceBefore = await connection.getBalance(userKeypair.publicKey);
    console.log(`Native SOL: ${solBalanceBefore / 1e9} SOL (${solBalanceBefore} lamports)`);

    // 4. Amount to wrap
    const wrapAmount = 2_000_000_000; // 2 SOL
    console.log(`\n🔄 Wrapping ${wrapAmount / 1e9} SOL to Wrapped SOL...`);

    // 5. Create transaction
    const transaction = new Transaction();

    // 5.1. Create mint account
    const mintRent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: wrappedSOLKeypair.publicKey,
        lamports: mintRent,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 5.2. Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        wrappedSOLKeypair.publicKey,
        9, // decimals
        userKeypair.publicKey, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 5.3. Create user ATA
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey, // payer
        userWrappedSOLATA, // ata
        userKeypair.publicKey, // owner
        wrappedSOLKeypair.publicKey, // mint
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // 5.4. Mint wrapped SOL tokens
    transaction.add(
      createMintToInstruction(
        wrappedSOLKeypair.publicKey, // mint
        userWrappedSOLATA, // destination
        userKeypair.publicKey, // authority
        wrapAmount, // amount
        [], // multiSigners
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 6. Send transaction
    console.log("📝 Sending wrap transaction...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      userKeypair,
      wrappedSOLKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log(`✅ SOL wrapped successfully!`);
    console.log(`Transaction signature: ${signature}`);

    // 7. Check balances after
    console.log("\n📊 Balances AFTER Wrapping:");
    const solBalanceAfter = await connection.getBalance(userKeypair.publicKey);
    const wrappedSOLBalance = await getTokenBalance(userWrappedSOLATA);
    console.log(`Native SOL: ${solBalanceAfter / 1e9} SOL (${solBalanceAfter} lamports)`);
    console.log(`Wrapped SOL: ${formatTokenAmount(wrappedSOLBalance)} (${wrappedSOLBalance} raw)`);

    // 8. Save wrapped SOL info
    const wrappedSOLInfo = {
      mint: wrappedSOLKeypair.publicKey.toString(),
      userATA: userWrappedSOLATA.toString(),
      supply: wrapAmount,
      decimals: 9,
      transactionSignature: signature,
    };

    fs.writeFileSync("wrapped-sol-info.json", JSON.stringify(wrappedSOLInfo, null, 2));
    console.log("\n💾 Wrapped SOL info saved to wrapped-sol-info.json");

  } catch (error) {
    console.error("❌ Error wrapping SOL:", error);
    throw error;
  }
}

// Run the function
wrapSOL().catch(console.error);

