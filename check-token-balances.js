// 🔍 Check Token Balances and Fix Issues
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
const fs = require('fs');

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Load user keypair (same as token creation scripts)
const userKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('/home/saurabh/.config/solana/id.json', 'utf8')))
);
const USER_PUBLIC_KEY = userKeypair.publicKey;

async function getTokenBalance(connection, tokenAccount) {
    try {
        const accountInfo = await connection.getAccountInfo(tokenAccount);
        if (!accountInfo) return 0;
        return accountInfo.data.readUInt64LE(64);
    } catch (error) {
        return 0;
    }
}

function formatTokenAmount(amount) {
    return (amount / 1_000_000_000).toFixed(6);
}

async function checkTokenBalances() {
    console.log("🔍 Checking Token Balances and Identifying Issues");
    console.log("================================================");
    console.log(`User Address: ${USER_PUBLIC_KEY.toString()}`);

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    // Load token and pool info
    const tokenXInfo = JSON.parse(fs.readFileSync('token-x-info.json', 'utf8'));
    const tokenYInfo = JSON.parse(fs.readFileSync('token-y-info.json', 'utf8'));
    const tokenZInfo = JSON.parse(fs.readFileSync('token-z-info.json', 'utf8'));

    const TOKEN_X_MINT = new PublicKey(tokenXInfo.mint);
    const TOKEN_Y_MINT = new PublicKey(tokenYInfo.mint);
    const TOKEN_Z_MINT = new PublicKey(tokenZInfo.mint);

    console.log(`\nToken Addresses:`);
    console.log(`Token X: ${TOKEN_X_MINT.toString()}`);
    console.log(`Token Y: ${TOKEN_Y_MINT.toString()}`);
    console.log(`Token Z: ${TOKEN_Z_MINT.toString()}`);

    // User ATAs (use the actual ATAs from the JSON files)
    const userTokenX = new PublicKey(tokenXInfo.userATA);
    const userTokenY = new PublicKey(tokenYInfo.userATA);
    const userTokenZ = new PublicKey(tokenZInfo.userATA);

    console.log(`\nUser Token Accounts:`);
    console.log(`Token X ATA: ${userTokenX.toString()}`);
    console.log(`Token Y ATA: ${userTokenY.toString()}`);
    console.log(`Token Z ATA: ${userTokenZ.toString()}`);

    // Check balances
    console.log(`\n📊 Current Token Balances:`);
    const balanceX = await getTokenBalance(connection, userTokenX);
    const balanceY = await getTokenBalance(connection, userTokenY);
    const balanceZ = await getTokenBalance(connection, userTokenZ);

    console.log(`Token X: ${formatTokenAmount(balanceX)} (${balanceX} raw)`);
    console.log(`Token Y: ${formatTokenAmount(balanceY)} (${balanceY} raw)`);
    console.log(`Token Z: ${formatTokenAmount(balanceZ)} (${balanceZ} raw)`);

    // Identify the issue
    console.log(`\n🔍 Issue Analysis:`);
    
    if (balanceX === 0 && balanceY === 0 && balanceZ === 0) {
        console.log(`❌ PROBLEM: User has 0 tokens in all accounts!`);
        console.log(`💡 SOLUTION: Need to create new tokens or mint more tokens`);
        console.log(`📝 ACTION: Run token creation scripts again`);
    } else if (balanceX < 1_000_000_000 || balanceY < 1_000_000_000 || balanceZ < 1_000_000_000) {
        console.log(`⚠️  WARNING: User has very low token balances`);
        console.log(`💡 SOLUTION: Need to mint more tokens for testing`);
        console.log(`📝 ACTION: Run token creation scripts or create new tokens`);
    } else {
        console.log(`✅ GOOD: User has sufficient token balances for testing`);
    }

    // Check if token accounts exist
    console.log(`\n🔍 Token Account Existence Check:`);
    
    const accountXExists = await connection.getAccountInfo(userTokenX);
    const accountYExists = await connection.getAccountInfo(userTokenY);
    const accountZExists = await connection.getAccountInfo(userTokenZ);

    console.log(`Token X Account: ${accountXExists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`Token Y Account: ${accountYExists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`Token Z Account: ${accountZExists ? '✅ EXISTS' : '❌ MISSING'}`);

    if (!accountXExists || !accountYExists || !accountZExists) {
        console.log(`\n❌ PROBLEM: Some token accounts don't exist!`);
        console.log(`💡 SOLUTION: Need to create token accounts first`);
        console.log(`📝 ACTION: Run token creation scripts to create ATAs`);
    }

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    
    if (balanceX === 0 && balanceY === 0 && balanceZ === 0) {
        console.log(`1. Run: node 1-create-token-x.js`);
        console.log(`2. Run: node 2-create-token-y.js`);
        console.log(`3. Run: node 3-create-token-z.js`);
        console.log(`4. Then run your swap tests`);
    } else if (balanceX < 10_000_000_000 || balanceY < 10_000_000_000 || balanceZ < 10_000_000_000) {
        console.log(`1. Create new tokens with larger initial supply`);
        console.log(`2. Or modify existing token creation scripts`);
        console.log(`3. Ensure at least 10+ tokens for testing`);
    } else {
        console.log(`1. Your tokens are sufficient for testing`);
        console.log(`2. The error might be in the swap script logic`);
        console.log(`3. Check account ordering in swap instructions`);
    }

    return {
        balanceX,
        balanceY,
        balanceZ,
        accountXExists: !!accountXExists,
        accountYExists: !!accountYExists,
        accountZExists: !!accountZExists
    };
}

// Run the check
checkTokenBalances().catch(console.error);
