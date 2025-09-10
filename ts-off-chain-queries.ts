import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import fs from 'fs';

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const connection = new Connection(RPC_ENDPOINT, {
    commitment: "confirmed",
    wsEndpoint: WS_ENDPOINT,
});

// Program ID
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

// Pool structures (simplified for off-chain reading)
interface PoolData {
    token_a: PublicKey;
    token_b: PublicKey;
    reserve_a: bigint;
    reserve_b: bigint;
    total_lp_supply: bigint;
    bump: number;
}

interface NativeSOLPoolData {
    token_mint: PublicKey;
    sol_reserve: bigint;
    token_reserve: bigint;
    total_lp_supply: bigint;
    bump: number;
}

// Helper function to read pool data off-chain
async function getPoolInfoOffChain(poolAddress: PublicKey): Promise<void> {
    try {
        console.log(`\n📊 Off-Chain Pool Info for: ${poolAddress.toString()}`);
        
        // Get account info
        const accountInfo = await connection.getAccountInfo(poolAddress);
        if (!accountInfo) {
            console.log('❌ Pool account not found');
            return;
        }

        console.log(`  Account Owner: ${accountInfo.owner.toString()}`);
        console.log(`  Account Size: ${accountInfo.data.length} bytes`);
        console.log(`  Account Lamports: ${accountInfo.lamports}`);
        console.log(`  Account Executable: ${accountInfo.executable}`);

        // Try to determine pool type by data size
        // Regular Pool: 32 + 32 + 8 + 8 + 8 + 1 = 89 bytes
        // Native SOL Pool: 32 + 8 + 8 + 8 + 1 = 57 bytes
        
        if (accountInfo.data.length >= 89) {
            console.log('  Pool Type: Regular Pool (Token A <-> Token B)');
            // Parse regular pool data (simplified)
            const data = accountInfo.data;
            const tokenA = new PublicKey(data.slice(0, 32));
            const tokenB = new PublicKey(data.slice(32, 64));
            const reserveA = data.readBigUInt64LE(64);
            const reserveB = data.readBigUInt64LE(72);
            const totalLPSupply = data.readBigUInt64LE(80);
            const bump = data[88];

            console.log(`  Token A: ${tokenA.toString()}`);
            console.log(`  Token B: ${tokenB.toString()}`);
            console.log(`  Reserve A: ${reserveA.toString()}`);
            console.log(`  Reserve B: ${reserveB.toString()}`);
            console.log(`  Total LP Supply: ${totalLPSupply.toString()}`);
            console.log(`  Bump: ${bump}`);

            // Calculate ratios
            if (reserveB > 0) {
                const ratio = Number(reserveA) / Number(reserveB);
                console.log(`  Ratio A/B: ${ratio.toFixed(6)}`);
            }
            if (reserveA > 0) {
                const ratio = Number(reserveB) / Number(reserveA);
                console.log(`  Ratio B/A: ${ratio.toFixed(6)}`);
            }

        } else if (accountInfo.data.length >= 57) {
            console.log('  Pool Type: Native SOL Pool (SOL <-> Token)');
            // Parse native SOL pool data (simplified)
            const data = accountInfo.data;
            const tokenMint = new PublicKey(data.slice(0, 32));
            const solReserve = data.readBigUInt64LE(32);
            const tokenReserve = data.readBigUInt64LE(40);
            const totalLPSupply = data.readBigUInt64LE(48);
            const bump = data[56];

            console.log(`  Token Mint: ${tokenMint.toString()}`);
            console.log(`  SOL Reserve: ${solReserve.toString()}`);
            console.log(`  Token Reserve: ${tokenReserve.toString()}`);
            console.log(`  Total LP Supply: ${totalLPSupply.toString()}`);
            console.log(`  Bump: ${bump}`);

            // Calculate ratios
            if (tokenReserve > 0) {
                const ratio = Number(solReserve) / Number(tokenReserve);
                console.log(`  SOL/Token Ratio: ${ratio.toFixed(6)}`);
            }
            if (solReserve > 0) {
                const ratio = Number(tokenReserve) / Number(solReserve);
                console.log(`  Token/SOL Ratio: ${ratio.toFixed(6)}`);
            }
            console.log(`  Pool Value (SOL): ${solReserve.toString()}`);

        } else {
            console.log('  Unknown pool type (data too small)');
        }

    } catch (error) {
        console.error('❌ Error reading pool info:', error);
    }
}

// Helper function to calculate swap quote off-chain
async function getSwapQuoteOffChain(
    poolAddress: PublicKey, 
    tokenIn: PublicKey, 
    amountIn: number
): Promise<void> {
    try {
        console.log(`\n💰 Off-Chain Swap Quote:`);
        console.log(`  Pool: ${poolAddress.toString()}`);
        console.log(`  Token In: ${tokenIn.toString()}`);
        console.log(`  Amount In: ${amountIn}`);

        // Get pool data
        const accountInfo = await connection.getAccountInfo(poolAddress);
        if (!accountInfo) {
            console.log('❌ Pool account not found');
            return;
        }

        // Parse pool data and calculate quote
        if (accountInfo.data.length >= 89) {
            // Regular pool
            const data = accountInfo.data;
            const tokenA = new PublicKey(data.slice(0, 32));
            const tokenB = new PublicKey(data.slice(32, 64));
            const reserveA = data.readBigUInt64LE(64);
            const reserveB = data.readBigUInt64LE(72);

            const isTokenA = tokenIn.equals(tokenA);
            const isTokenB = tokenIn.equals(tokenB);

            if (!isTokenA && !isTokenB) {
                console.log('❌ Token not found in this pool');
                return;
            }

            const reserveIn = isTokenA ? reserveA : reserveB;
            const reserveOut = isTokenA ? reserveB : reserveA;

            // Calculate output using constant product formula
            const amountOut = reserveIn === 0n || amountIn === 0 ? 0n : 
                (BigInt(amountIn) * reserveOut) / (reserveIn + BigInt(amountIn));

            console.log(`  Pool Type: Regular Pool`);
            console.log(`  Direction: ${isTokenA ? 'A -> B' : 'B -> A'}`);
            console.log(`  Reserve In: ${reserveIn.toString()}`);
            console.log(`  Reserve Out: ${reserveOut.toString()}`);
            console.log(`  Amount Out: ${amountOut.toString()}`);

            // Calculate price impact
            const priceImpact = reserveIn > 0n ? 
                (Number(amountIn) / Number(reserveIn)) * 100 : 0;
            console.log(`  Price Impact: ${priceImpact.toFixed(4)}%`);

            // Calculate exchange rate
            const exchangeRate = amountIn > 0 ? Number(amountOut) / amountIn : 0;
            console.log(`  Exchange Rate: ${exchangeRate.toFixed(6)}`);

        } else if (accountInfo.data.length >= 57) {
            // Native SOL pool
            const data = accountInfo.data;
            const tokenMint = new PublicKey(data.slice(0, 32));
            const solReserve = data.readBigUInt64LE(32);
            const tokenReserve = data.readBigUInt64LE(40);

            const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
            const isSOL = tokenIn.equals(NATIVE_SOL_MINT);
            const isToken = tokenIn.equals(tokenMint);

            if (!isSOL && !isToken) {
                console.log('❌ Token not found in this pool');
                return;
            }

            const reserveIn = isSOL ? solReserve : tokenReserve;
            const reserveOut = isSOL ? tokenReserve : solReserve;

            // Calculate output using constant product formula
            const amountOut = reserveIn === 0n || amountIn === 0 ? 0n : 
                (BigInt(amountIn) * reserveOut) / (reserveIn + BigInt(amountIn));

            console.log(`  Pool Type: Native SOL Pool`);
            console.log(`  Direction: ${isSOL ? 'SOL -> Token' : 'Token -> SOL'}`);
            console.log(`  Reserve In: ${reserveIn.toString()}`);
            console.log(`  Reserve Out: ${reserveOut.toString()}`);
            console.log(`  Amount Out: ${amountOut.toString()}`);

            // Calculate price impact
            const priceImpact = reserveIn > 0n ? 
                (Number(amountIn) / Number(reserveIn)) * 100 : 0;
            console.log(`  Price Impact: ${priceImpact.toFixed(4)}%`);

            // Calculate exchange rate
            const exchangeRate = amountIn > 0 ? Number(amountOut) / amountIn : 0;
            console.log(`  Exchange Rate: ${exchangeRate.toFixed(6)}`);

        } else {
            console.log('❌ Unknown pool type');
        }

    } catch (error) {
        console.error('❌ Error calculating swap quote:', error);
    }
}

// Main test function
async function testOffChainQueries() {
    console.log('🔍 Testing Off-Chain Queries (No Transactions Required!)...\n');

    try {
        // Load pool info
        const nativeSOLPoolInfo = JSON.parse(fs.readFileSync('pool-a-native-sol-info.json', 'utf8'));
        const nativeSOLPoolPDA = new PublicKey(nativeSOLPoolInfo.poolPDA);
        const nativeSOLTokenAMint = new PublicKey(nativeSOLPoolInfo.tokenA);

        // Test regular pool if available
        let regularPoolPDA: PublicKey | null = null;
        let regularTokenAMint: PublicKey | null = null;
        let regularTokenBMint: PublicKey | null = null;
        try {
            const regularPoolInfo = JSON.parse(fs.readFileSync('pool-ab-info.json', 'utf8'));
            regularPoolPDA = new PublicKey(regularPoolInfo.poolPDA);
            regularTokenAMint = new PublicKey(regularPoolInfo.tokenA);
            regularTokenBMint = new PublicKey(regularPoolInfo.tokenB);
        } catch (error) {
            console.log('No regular pool found');
        }

        // Test 1: Pool Info Queries
        if (regularPoolPDA) {
            await getPoolInfoOffChain(regularPoolPDA);
        }
        await getPoolInfoOffChain(nativeSOLPoolPDA);

        // Test 2: Swap Quote Queries
        if (regularPoolPDA && regularTokenAMint && regularTokenBMint) {
            await getSwapQuoteOffChain(regularPoolPDA, regularTokenAMint, 1000000);
            await getSwapQuoteOffChain(regularPoolPDA, regularTokenBMint, 2000000);
        }
        
        const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
        await getSwapQuoteOffChain(nativeSOLPoolPDA, NATIVE_SOL_MINT, 1000000000);
        await getSwapQuoteOffChain(nativeSOLPoolPDA, nativeSOLTokenAMint, 500000000);

        console.log('\n🎉 All off-chain queries completed successfully!');
        console.log('💡 No transactions required - much faster and cheaper!');

    } catch (error) {
        console.error('❌ Error testing off-chain queries:', error);
    }
}

// Run the test
testOffChainQueries().catch(console.error);
