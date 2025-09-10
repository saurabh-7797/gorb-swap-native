import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

// Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const connection = new Connection(RPC_ENDPOINT, {
    commitment: "confirmed",
    wsEndpoint: WS_ENDPOINT,
});

// Program and keypairs
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');
const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// Load keypairs
const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

// Load pool info
const nativeSOLPoolInfo = JSON.parse(fs.readFileSync('pool-a-native-sol-info.json', 'utf8'));
const nativeSOLPoolPDA = new PublicKey(nativeSOLPoolInfo.poolPDA);
const nativeSOLTokenAMint = new PublicKey(nativeSOLPoolInfo.tokenA);

// Try to find a regular pool (Token A <-> Token B)
let regularPoolPDA: PublicKey | null = null;
let regularTokenAMint: PublicKey | null = null;
let regularTokenBMint: PublicKey | null = null;
try {
    const regularPoolInfo = JSON.parse(fs.readFileSync('pool-ab-info.json', 'utf8'));
    regularPoolPDA = new PublicKey(regularPoolInfo.poolPDA);
    regularTokenAMint = new PublicKey(regularPoolInfo.tokenA);
    regularTokenBMint = new PublicKey(regularPoolInfo.tokenB);
} catch (error) {
    console.log('No regular pool found, will only test native SOL pool');
}

// Native SOL mint
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

async function testEnhancedSwapQuotes() {
    console.log('💰 Testing Enhanced Swap Quote Functions...\n');

    try {
        // Test 1: Regular Pool Quotes (if available)
        if (regularPoolPDA && regularTokenAMint && regularTokenBMint) {
            console.log('🔄 Testing Regular Pool Quotes...');
            try {
                await getSwapQuote(regularPoolPDA, regularTokenAMint, 1000000, 'Token A -> Token B');
                await getSwapQuote(regularPoolPDA, regularTokenBMint, 2000000, 'Token B -> Token A');
            } catch (error) {
                console.log('⚠️ Regular pool quotes failed, continuing with native SOL pool...');
            }
        } else {
            console.log('🔄 Skipping Regular Pool Quotes (no regular pool found)');
        }

        // Test 2: Native SOL Pool Quotes
        console.log('\n🔄 Testing Native SOL Pool Quotes...');
        await getSwapQuote(nativeSOLPoolPDA, NATIVE_SOL_MINT, 1000000000, 'SOL -> Token A');
        await getSwapQuote(nativeSOLPoolPDA, nativeSOLTokenAMint, 500000000, 'Token A -> SOL');

        console.log('\n🎉 All swap quote tests completed successfully!');

    } catch (error) {
        console.error('❌ Error testing swap quotes:', error);
    }
}

async function getSwapQuote(poolAddress: PublicKey, tokenIn: PublicKey, amountIn: number, description: string) {
    try {
        // Create instruction data for GetSwapQuote (discriminator: 9)
        // Data: [discriminator: 1] + [amount_in: 8] + [token_in: 32]
        const instructionData = Buffer.alloc(1 + 8 + 32); // 1 byte discriminator + 8 bytes u64 + 32 bytes Pubkey
        instructionData.writeUInt8(9, 0); // GetSwapQuote discriminator
        instructionData.writeBigUInt64LE(BigInt(amountIn), 1);
        instructionData.set(tokenIn.toBytes(), 9);

        // Create instruction
        const instruction = {
            programId: PROGRAM_ID,
            keys: [
                { pubkey: poolAddress, isSigner: false, isWritable: false },
            ],
            data: instructionData,
        };

        // Create transaction
        const transaction = new Transaction().add(instruction);

        // Send transaction
        const signature = await connection.sendTransaction(transaction, [payerKeypair], {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });

        console.log(`✅ ${description} quote transaction sent:`, signature);
        
        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        console.log(`✅ ${description} quote transaction confirmed`);

        // Get transaction logs to see the quote information
        const tx = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (tx?.meta?.logMessages) {
            console.log(`\n📊 ${description} Quote:`);
            tx.meta.logMessages.forEach(log => {
                if (log.includes('Swap Quote:') || log.includes('Native SOL Swap Quote:')) {
                    console.log(`  ${log}`);
                } else if (log.includes('Pool PDA:') || log.includes('Token In:') || log.includes('Amount In:') || 
                          log.includes('Direction') || log.includes('Reserve') || log.includes('Amount Out:') ||
                          log.includes('Price Impact') || log.includes('Exchange Rate')) {
                    console.log(`  ${log}`);
                }
            });
        }

    } catch (error) {
        console.error(`❌ Error getting ${description} quote:`, error);
        throw error;
    }
}

// Run the test
testEnhancedSwapQuotes().catch(console.error);
