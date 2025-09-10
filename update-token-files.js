const fs = require('fs');

const tokens = ['b', 'c', 'd', 'e'];

const template = `import {
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
 * TypeScript Script: Create Token {TOKEN}
 */
async function createToken{TOKEN}() {
  try {
    console.log("🚀 Creating Token {TOKEN}...");
    
    const token{TOKEN}Keypair = Keypair.generate();
    console.log(\`Token {TOKEN} Mint: \${token{TOKEN}Keypair.publicKey.toString()}\`);
    
    const userToken{TOKEN} = getAssociatedTokenAddressSync(
      token{TOKEN}Keypair.publicKey,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );
    console.log(\`User Token {TOKEN} ATA: \${userToken{TOKEN}.toString()}\`);

    // 1. Create mint account
    console.log("\\n📝 Creating Token {TOKEN} mint account...");
    const mintLamports = await getMinimumBalanceForRentExemptMint(connection);
    
    const transaction = new Transaction();
    
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: token{TOKEN}Keypair.publicKey,
        lamports: mintLamports,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // 2. Initialize mint
    console.log("📝 Initializing Token {TOKEN} mint...");
    transaction.add(
      createInitializeMintInstruction(
        token{TOKEN}Keypair.publicKey,
        9, // decimals
        userKeypair.publicKey, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // 3. Create user ATA
    console.log("📝 Creating user Token {TOKEN} ATA...");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey, // payer
        userToken{TOKEN}, // ata
        userKeypair.publicKey, // owner
        token{TOKEN}Keypair.publicKey, // mint
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // 4. Send transaction
    console.log("📝 Minting large amount of Token {TOKEN} to user...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair, token{TOKEN}Keypair]);

    console.log(\`✅ Token {TOKEN} created successfully!\`);
    console.log(\`Transaction signature: \${signature}\`);

    // 5. Mint tokens to user
    console.log("📝 Minting tokens to user...");
    const mintAmount = 1_000_000_000_000; // 1 million tokens
    const mintTransaction = new Transaction();
    mintTransaction.add(
      createMintToInstruction(
        token{TOKEN}Keypair.publicKey, // mint
        userToken{TOKEN}, // destination
        userKeypair.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        SPL_TOKEN_PROGRAM_ID
      )
    );
    
    await sendAndConfirmTransaction(connection, mintTransaction, [userKeypair]);
    
    const balance = await getTokenBalance(userToken{TOKEN});
    console.log(\`\\n📊 Token {TOKEN} Balance: \${formatTokenAmount(balance)} Token {TOKEN} (\${balance} raw)\`);

    // 6. Save token info
    const tokenInfo = {
      mint: token{TOKEN}Keypair.publicKey.toString(),
      userATA: userToken{TOKEN}.toString(),
      supply: mintAmount,
      decimals: 9,
      transactionSignature: signature,
    };

    fs.writeFileSync("token-{token}-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log("\\n💾 Token {TOKEN} info saved to token-{token}-info.json");

  } catch (error) {
    console.error("❌ Error creating Token {TOKEN}:", error);
    throw error;
  }
}

// Run the function
createToken{TOKEN}().catch(console.error);`;

tokens.forEach(token => {
  let content = template
    .replace(/{TOKEN}/g, token.toUpperCase())
    .replace(/{token}/g, token.toLowerCase());
  
  fs.writeFileSync(`ts-create-token-${token}.ts`, content);
  console.log(`Updated ts-create-token-${token}.ts`);
});

console.log('All token files updated!');
