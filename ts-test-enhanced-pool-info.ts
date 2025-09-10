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

// Try to find a regular pool (Token A <-> Token B)
let regularPoolPDA: PublicKey | null = null;
try {
    const regularPoolInfo = JSON.parse(fs.readFileSync('pool-ab-info.json', 'utf8'));
    regularPoolPDA = new PublicKey(regularPoolInfo.poolPDA);
} catch (error) {
    console.log('No regular pool found, will only test native SOL pool');
}

async function testEnhancedPoolInfo() {
    console.log('🔍 Testing Enhanced Pool Info Functions...\n');

    try {
        // Test 1: Get Regular Pool Info (if available)
        if (regularPoolPDA) {
            console.log('📊 Testing Regular Pool Info...');
            await getPoolInfo(regularPoolPDA, 'Regular Pool');
        } else {
            console.log('📊 Skipping Regular Pool Info (no regular pool found)');
        }

        // Test 2: Get Native SOL Pool Info  
        console.log('\n📊 Testing Native SOL Pool Info...');
        await getPoolInfo(nativeSOLPoolPDA, 'Native SOL Pool');

        console.log('\n🎉 All pool info tests completed successfully!');

    } catch (error) {
        console.error('❌ Error testing pool info:', error);
    }
}

async function getPoolInfo(poolAddress: PublicKey, poolType: string) {
    try {
        // Create instruction data for GetPoolInfo (discriminator: 6)
        const instructionData = Buffer.from([6]); // GetPoolInfo discriminator

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

        console.log(`✅ ${poolType} info transaction sent:`, signature);
        
        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        console.log(`✅ ${poolType} info transaction confirmed`);

        // Get transaction logs to see the pool information
        const tx = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (tx?.meta?.logMessages) {
            console.log(`\n📋 ${poolType} Information:`);
            tx.meta.logMessages.forEach(log => {
                if (log.includes('Pool Info:') || log.includes('Native SOL Pool Info:')) {
                    console.log(`  ${log}`);
                } else if (log.includes('Pool PDA:') || log.includes('Token') || log.includes('Reserve') || 
                          log.includes('Total LP') || log.includes('Ratio') || log.includes('Pool Value')) {
                    console.log(`  ${log}`);
                }
            });
        }

    } catch (error) {
        console.error(`❌ Error getting ${poolType} info:`, error);
        throw error;
    }
}

// Run the test
testEnhancedPoolInfo().catch(console.error);
