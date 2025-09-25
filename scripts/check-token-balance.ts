import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import {
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");

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
    console.log(`Error getting balance for ${tokenAccount.toString()}:`, error);
    return 0;
  }
}

async function checkBalances() {
  try {
    console.log("🔍 Checking Token Balances...");
    
    // Load pool info
    const poolInfo = JSON.parse(fs.readFileSync('pool-x-native-sol-info.json', 'utf-8'));
    
    const TOKEN_X_MINT = new PublicKey(poolInfo.tokenB);
    const USER_TOKEN_X = new PublicKey(poolInfo.userTokenB);
    const USER_LP = new PublicKey(poolInfo.userLP);
    
    console.log(`\nToken X Mint: ${TOKEN_X_MINT.toString()}`);
    console.log(`User Token X ATA: ${USER_TOKEN_X.toString()}`);
    console.log(`User LP ATA: ${USER_LP.toString()}`);
    
    // Check SOL balance
    const solBalance = await connection.getBalance(userKeypair.publicKey);
    console.log(`\n📊 SOL Balance: ${solBalance / 1e9} SOL (${solBalance} lamports)`);
    
    // Check Token X balance
    const tokenXBalance = await getTokenBalance(USER_TOKEN_X);
    console.log(`📊 Token X Balance: ${tokenXBalance / 1e9} Token X (${tokenXBalance} raw)`);
    
    // Check LP balance
    const lpBalance = await getTokenBalance(USER_LP);
    console.log(`📊 LP Balance: ${lpBalance} LP tokens (${lpBalance} raw)`);
    
    // Check if Token X account exists and is valid
    try {
      const tokenAccountInfo = await getAccount(connection, USER_TOKEN_X, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`\n✅ Token X Account Info:`);
      console.log(`   Owner: ${tokenAccountInfo.owner.toString()}`);
      console.log(`   Mint: ${tokenAccountInfo.mint.toString()}`);
      console.log(`   Amount: ${tokenAccountInfo.amount.toString()}`);
      console.log(`   Decimals: ${tokenAccountInfo.mint.toString() === TOKEN_X_MINT.toString() ? 'Mint matches' : 'Mint mismatch!'}`);
    } catch (error) {
      console.log(`❌ Token X Account Error:`, error);
    }
    
  } catch (error) {
    console.error("❌ Error checking balances:", error);
  }
}

checkBalances();

