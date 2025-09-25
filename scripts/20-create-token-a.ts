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
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAccount,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import * as fs from "fs";

// Configuration
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

async function createTokenA() {
  console.log("🚀 Creating Token A...");
  
  // Generate fresh keypair for Token A
  const tokenKeypair = Keypair.generate();
  console.log(`Token A Mint: ${tokenKeypair.publicKey.toString()}`);
  
  // Create user ATA
  const userToken = getAssociatedTokenAddressSync(
    tokenKeypair.publicKey,
    userKeypair.publicKey,
    false,
    SPL_TOKEN_PROGRAM_ID,
    ATA_PROGRAM_ID
  );
  console.log(`Token A User ATA: ${userToken.toString()}`);

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
  console.log(`✅ Token A created successfully! Signature: ${signature}`);

  // Mint tokens to user
  const mintAmount = 2_000_000_000_000; // 2 billion tokens
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
  
  const balance = await getAccount(connection, userToken, "confirmed", SPL_TOKEN_PROGRAM_ID);
  console.log(`📊 Token A Balance: ${(Number(balance.amount) / 1e9).toFixed(6)} (${balance.amount} raw)`);

  // Save token info
  const tokenInfo = {
    mint: tokenKeypair.publicKey.toString(),
    userATA: userToken.toString(),
    amount: mintAmount,
    decimals: 9,
    signature: signature,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync("20-token-a-info.json", JSON.stringify(tokenInfo, null, 2));
  console.log("💾 Token A info saved to 20-token-a-info.json");

  return tokenInfo;
}

// Run the script
if (require.main === module) {
  createTokenA().catch(console.error);
}

export { createTokenA };
