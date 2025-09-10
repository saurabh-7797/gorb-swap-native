const {
  Connection,
  PublicKey,
} = require("@solana/web3.js");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const connection = new Connection(RPC_ENDPOINT, "confirmed");

const ADDRESS_TO_CHECK = "34MT19iZzwZPaw3ysqLoDZHYD31CgzhKJB3UtMve6GhotAYiFtfEKXp3fwhR6cuTEHbmY3FxhTECZEk8AYoGmbLV";

async function checkAddress() {
  try {
    console.log(`🔍 Checking address: ${ADDRESS_TO_CHECK}`);
    
    // Check if it's a valid public key
    let publicKey;
    try {
      publicKey = new PublicKey(ADDRESS_TO_CHECK);
      console.log("✅ Valid Solana public key format");
    } catch (error) {
      console.log("❌ Invalid Solana public key format");
      return;
    }
    
    // Get account info
    console.log("\n📊 Account Information:");
    const accountInfo = await connection.getAccountInfo(publicKey);
    
    if (accountInfo === null) {
      console.log("❌ Account does not exist on the blockchain");
      return;
    }
    
    console.log(`✅ Account exists`);
    console.log(`Owner Program: ${accountInfo.owner.toString()}`);
    console.log(`Executable: ${accountInfo.executable}`);
    console.log(`Lamports: ${accountInfo.lamports}`);
    console.log(`Data Length: ${accountInfo.data.length} bytes`);
    console.log(`Rent Epoch: ${accountInfo.rentEpoch}`);
    
    // Get balance
    const balance = await connection.getBalance(publicKey);
    console.log(`\n💰 Balance: ${balance / 1e9} SOL`);
    
    // Check if it's a token account
    if (accountInfo.data.length > 0) {
      console.log(`\n📄 Account Data (first 32 bytes): ${accountInfo.data.slice(0, 32).toString('hex')}`);
    }
    
    // Get transaction history (recent)
    console.log("\n📜 Recent Transaction History:");
    const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
    
    if (signatures.length === 0) {
      console.log("No recent transactions found");
    } else {
      signatures.forEach((sig, index) => {
        console.log(`${index + 1}. ${sig.signature}`);
        console.log(`   Block Time: ${sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'Unknown'}`);
        console.log(`   Confirmed: ${sig.confirmationStatus}`);
        console.log(`   Error: ${sig.err ? 'Yes' : 'No'}`);
        console.log("");
      });
    }
    
  } catch (error) {
    console.error("❌ Error checking address:", error.message);
  }
}

checkAddress().catch(console.error);


