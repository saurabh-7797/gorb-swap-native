import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import {
  getAccount,
  getMint,
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

async function checkLPToken() {
  try {
    console.log("🔍 Checking LP Token Details...");
    
    // Load pool info
    const poolInfo = JSON.parse(fs.readFileSync('pool-x-native-sol-info.json', 'utf-8'));
    
    const LP_MINT = new PublicKey(poolInfo.lpMint);
    const USER_LP = new PublicKey(poolInfo.userLP);
    
    console.log(`\nLP Mint: ${LP_MINT.toString()}`);
    console.log(`User LP ATA: ${USER_LP.toString()}`);
    
    // Check LP mint info
    try {
      const mintInfo = await getMint(connection, LP_MINT, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`\n📊 LP Mint Info:`);
      console.log(`   Supply: ${mintInfo.supply.toString()}`);
      console.log(`   Decimals: ${mintInfo.decimals}`);
      console.log(`   Mint Authority: ${mintInfo.mintAuthority?.toString() || 'None'}`);
      console.log(`   Freeze Authority: ${mintInfo.freezeAuthority?.toString() || 'None'}`);
    } catch (error) {
      console.log(`❌ LP Mint Error:`, error);
    }
    
    // Check user LP balance
    const userLpBalance = await getTokenBalance(USER_LP);
    console.log(`\n📊 User LP Balance: ${userLpBalance} LP tokens`);
    
    // Check if user LP account exists and is valid
    try {
      const lpAccountInfo = await getAccount(connection, USER_LP, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`\n✅ User LP Account Info:`);
      console.log(`   Owner: ${lpAccountInfo.owner.toString()}`);
      console.log(`   Mint: ${lpAccountInfo.mint.toString()}`);
      console.log(`   Amount: ${lpAccountInfo.amount.toString()}`);
      console.log(`   Mint matches: ${lpAccountInfo.mint.toString() === LP_MINT.toString() ? 'Yes' : 'No'}`);
    } catch (error) {
      console.log(`❌ User LP Account Error:`, error);
    }
    
    // Check if the LP mint has any supply
    try {
      const mintInfo = await getMint(connection, LP_MINT, "confirmed", SPL_TOKEN_PROGRAM_ID);
      if (Number(mintInfo.supply) === 0) {
        console.log(`\n⚠️  WARNING: LP Mint has zero supply! This might be the issue.`);
      } else {
        console.log(`\n✅ LP Mint has supply: ${mintInfo.supply.toString()}`);
      }
    } catch (error) {
      console.log(`❌ Error checking LP mint supply:`, error);
    }
    
  } catch (error) {
    console.error("❌ Error checking LP token:", error);
  }
}

checkLPToken();

