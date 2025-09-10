import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID as ATA_PROGRAM_ID,
  getAccount,
  createTransferInstruction,
} from '@solana/spl-token';

// Program ID
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w1u7Ugtz5fPHFnkStJX');

// Token addresses
const TOKEN_R_MINT = new PublicKey('4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq');
const TOKEN_Q_MINT = new PublicKey('8W2CSgx45fsxP1WnnYJxJVqqVC7XKB1ARmFbiRXyUBTR');
const TOKEN_P_MINT = new PublicKey('AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW');

// Pool addresses
const POOL_QR_PDA = new PublicKey('JDBuxeQ9kT77Co4qyEv7kJY17sTMTyBhDCJNHkZErzFy');
const POOL_PQ_PDA = new PublicKey('5FUEfonnJmsZE3peqGRjbFBmejGeQUD9o8mXv46dTqGB');

async function doubleSwapRQP() {
  console.log('🚀 TypeScript Script: Double Swap R → Q → P (Two Single Swaps)...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load user keypair from system config
  const fs = require('fs');
  const keypairPath = '/home/saurabh/.config/solana/id.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const userKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

  console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
  console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
  console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
  console.log(`Pool Q-R PDA: ${POOL_QR_PDA.toString()}`);
  console.log(`Pool P-Q PDA: ${POOL_PQ_PDA.toString()}`);

  // Get user token accounts (using the correct addresses from working multihop)
  const userTokenR = new PublicKey('29oqifVvUn7mPT1QMf1PbrYPMkB6h3LtADZEV99vC2Sb');
  const userTokenQ = new PublicKey('2c3ojTDxpYDJSb3WUGZh5F7rEdYyUCGC3F7NXsUgoAAV');
  const userTokenP = new PublicKey('B7v3dvNG8SUnaLWXvsbvsLjGdrEhnCA2PQdddUVEPNRu');

  console.log(`User Token R ATA: ${userTokenR.toString()}`);
  console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
  console.log(`User Token P ATA: ${userTokenP.toString()}`);

  // Check balances before
  const balanceRBefore = await getAccount(connection, userTokenR);
  const balanceQBefore = await getAccount(connection, userTokenQ);
  const balancePBefore = await getAccount(connection, userTokenP);

  console.log('\n📊 Balances BEFORE Double Swap:');
  console.log(`Token R: ${(Number(balanceRBefore.amount) / 1e9).toFixed(6)} (${balanceRBefore.amount} raw)`);
  console.log(`Token Q: ${(Number(balanceQBefore.amount) / 1e9).toFixed(6)} (${balanceQBefore.amount} raw)`);
  console.log(`Token P: ${(Number(balancePBefore.amount) / 1e9).toFixed(6)} (${balancePBefore.amount} raw)`);

  const amountIn = 1.5; // 1.5 Token R
  const amountInRaw = Math.floor(amountIn * 1e9);

  console.log('\n🔄 Double Swap Parameters:');
  console.log(`Amount In: ${amountIn.toFixed(6)} Token R`);
  console.log(`Path: R → Q → P (Two Single Swaps)`);

  try {
    // Step 1: R → Q (Single Swap)
    console.log('\n🔄 Step 1: R → Q (Single Swap)');
    
    const transaction1 = new Transaction();
    
    // Get vault addresses
    const vaultQR = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_QR_PDA.toBuffer(), TOKEN_Q_MINT.toBuffer()],
      PROGRAM_ID
    )[0];
    
    const vaultRR = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_QR_PDA.toBuffer(), TOKEN_R_MINT.toBuffer()],
      PROGRAM_ID
    )[0];

    // Single swap R → Q (B → A direction since R is token_b in Q-R pool)
    const accounts1 = [
      { pubkey: POOL_QR_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultQR, isSigner: false, isWritable: true },
      { pubkey: vaultRR, isSigner: false, isWritable: true },
      { pubkey: userTokenR, isSigner: false, isWritable: true },
      { pubkey: userTokenQ, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const data1 = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data1.writeUInt8(3, 0); // Swap discriminator
    data1.writeBigUInt64LE(BigInt(amountInRaw), 1);
    data1.writeUInt8(0, 9); // direction_a_to_b = false (R → Q)

    const instruction1 = {
      programId: PROGRAM_ID,
      keys: accounts1,
      data: data1,
    };

    transaction1.add(instruction1);

    console.log('📝 Sending R → Q swap transaction...');
    const signature1 = await sendAndConfirmTransaction(connection, transaction1, [userKeypair]);
    console.log(`✅ R → Q swap completed! Signature: ${signature1}`);

    // Check intermediate balance
    const balanceQAfterStep1 = await getAccount(connection, userTokenQ);
    const qReceived = Number(balanceQAfterStep1.amount) - Number(balanceQBefore.amount);
    console.log(`📈 Q received from R → Q: ${(qReceived / 1e9).toFixed(6)}`);

    // Step 2: Q → P (Single Swap)
    console.log('\n🔄 Step 2: Q → P (Single Swap)');
    
    const transaction2 = new Transaction();
    
    // Get vault addresses for P-Q pool
    const vaultPQ = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_PQ_PDA.toBuffer(), TOKEN_P_MINT.toBuffer()],
      PROGRAM_ID
    )[0];
    
    const vaultQQ = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_PQ_PDA.toBuffer(), TOKEN_Q_MINT.toBuffer()],
      PROGRAM_ID
    )[0];

    // Single swap Q → P (A → B direction since Q is token_a in P-Q pool)
    const accounts2 = [
      { pubkey: POOL_PQ_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultPQ, isSigner: false, isWritable: true },
      { pubkey: vaultQQ, isSigner: false, isWritable: true },
      { pubkey: userTokenQ, isSigner: false, isWritable: true },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const data2 = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data2.writeUInt8(3, 0); // Swap discriminator
    data2.writeBigUInt64LE(BigInt(qReceived), 2); // Use all Q received from step 1
    data2.writeUInt8(1, 9); // direction_a_to_b = true (Q → P)

    const instruction2 = {
      programId: PROGRAM_ID,
      keys: accounts2,
      data: data2,
    };

    transaction2.add(instruction2);

    console.log('📝 Sending Q → P swap transaction...');
    const signature2 = await sendAndConfirmTransaction(connection, transaction2, [userKeypair]);
    console.log(`✅ Q → P swap completed! Signature: ${signature2}`);

    // Check final balances
    const balanceRAfter = await getAccount(connection, userTokenR);
    const balanceQAfter = await getAccount(connection, userTokenQ);
    const balancePAfter = await getAccount(connection, userTokenP);

    console.log('\n📊 Balances AFTER Double Swap:');
    console.log(`Token R: ${(Number(balanceRAfter.amount) / 1e9).toFixed(6)} (${balanceRAfter.amount} raw)`);
    console.log(`Token Q: ${(Number(balanceQAfter.amount) / 1e9).toFixed(6)} (${balanceQAfter.amount} raw)`);
    console.log(`Token P: ${(Number(balancePAfter.amount) / 1e9).toFixed(6)} (${balancePAfter.amount} raw)`);

    const rUsed = Number(balanceRBefore.amount) - Number(balanceRAfter.amount);
    const qChange = Number(balanceQAfter.amount) - Number(balanceQBefore.amount);
    const pReceived = Number(balancePAfter.amount) - Number(balancePBefore.amount);

    console.log('\n📈 Double Swap Results:');
    console.log(`Token R Used: ${(rUsed / 1e9).toFixed(6)}`);
    console.log(`Token Q Change: ${(qChange / 1e9).toFixed(6)} (should be ~0 for double swap)`);
    console.log(`Token P Received: ${(pReceived / 1e9).toFixed(6)}`);

    const effectiveRate = pReceived / rUsed;
    console.log(`\n💱 Effective Exchange Rate: 1 Token R = ${effectiveRate.toFixed(6)} Token P`);

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      swapType: 'Double Swap R → Q → P',
      amountIn: amountIn,
      amountInRaw: amountInRaw,
      rUsed: rUsed,
      qChange: qChange,
      pReceived: pReceived,
      effectiveRate: effectiveRate,
      signatures: [signature1, signature2],
      balancesBefore: {
        r: Number(balanceRBefore.amount),
        q: Number(balanceQBefore.amount),
        p: Number(balancePBefore.amount),
      },
      balancesAfter: {
        r: Number(balanceRAfter.amount),
        q: Number(balanceQAfter.amount),
        p: Number(balancePAfter.amount),
      },
    };

    const fs = require('fs');
    fs.writeFileSync('double-swap-rqp-results.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Double swap results saved to double-swap-rqp-results.json');

  } catch (error) {
    console.error('❌ Error in double swap R → Q → P:', error);
    throw error;
  }
}

// Run the double swap
doubleSwapRQP().catch(console.error);