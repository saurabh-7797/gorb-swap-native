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
const AMM_PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

// Token addresses
const TOKEN_P_MINT = new PublicKey('AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW');
const TOKEN_Q_MINT = new PublicKey('8W2CSgx45fsxP1WnnYJxJVqqVC7XKB1ARmFbiRXyUBTR');
const TOKEN_R_MINT = new PublicKey('4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq');

// Pool addresses
const POOL_PQ_PDA = new PublicKey('5FUEfonnJmsZE3peqGRjbFBmejGeQUD9o8mXv46dTqGB');
const POOL_QR_PDA = new PublicKey('JDBuxeQ9kT77Co4qyEv7kJY17sTMTyBhDCJNHkZErzFy');

async function workingMultihopPQR() {
  console.log('🚀 Working Multihop P → Q → R (Two Single Swaps)...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load user keypair from system config
  const fs = require('fs');
  const keypairPath = '/home/saurabh/.config/solana/id.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const userKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

  console.log(`Token P: ${TOKEN_P_MINT.toString()}`);
  console.log(`Token Q: ${TOKEN_Q_MINT.toString()}`);
  console.log(`Token R: ${TOKEN_R_MINT.toString()}`);
  console.log(`Pool P-Q PDA: ${POOL_PQ_PDA.toString()}`);
  console.log(`Pool Q-R PDA: ${POOL_QR_PDA.toString()}`);

  // Get user token accounts
  const userTokenP = new PublicKey('B7v3dvNG8SUnaLWXvsbvsLjGdrEhnCA2PQdddUVEPNRu');
  const userTokenQ = new PublicKey('2c3ojTDxpYDJSb3WUGZh5F7rEdYyUCGC3F7NXsUgoAAV');
  const userTokenR = new PublicKey('29oqifVvUn7mPT1QMf1PbrYPMkB6h3LtADZEV99vC2Sb');

  console.log(`User Token P ATA: ${userTokenP.toString()}`);
  console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
  console.log(`User Token R ATA: ${userTokenR.toString()}`);

  // Check balances before
  const balancePBefore = await getAccount(connection, userTokenP);
  const balanceQBefore = await getAccount(connection, userTokenQ);
  const balanceRBefore = await getAccount(connection, userTokenR);

  console.log('\n📊 Balances BEFORE Working Multihop:');
  console.log(`Token P: ${(Number(balancePBefore.amount) / 1e9).toFixed(6)} (${balancePBefore.amount} raw)`);
  console.log(`Token Q: ${(Number(balanceQBefore.amount) / 1e9).toFixed(6)} (${balanceQBefore.amount} raw)`);
  console.log(`Token R: ${(Number(balanceRBefore.amount) / 1e9).toFixed(6)} (${balanceRBefore.amount} raw)`);

  const amountIn = 2.0; // 2.0 Token P
  const amountInRaw = Math.floor(amountIn * 1e9);

  console.log('\n🔄 Working Multihop Parameters:');
  console.log(`Amount In: ${amountIn.toFixed(6)} Token P`);
  console.log(`Path: P → Q → R (Two Single Swaps)`);

  try {
    // Step 1: P → Q (Single Swap)
    console.log('\n🔄 Step 1: P → Q (Single Swap)');
    
    const transaction1 = new Transaction();
    
    // Get vault addresses for P-Q pool
    const vaultPQ = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_PQ_PDA.toBuffer(), TOKEN_P_MINT.toBuffer()],
      AMM_PROGRAM_ID
    )[0];
    
    const vaultQQ = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_PQ_PDA.toBuffer(), TOKEN_Q_MINT.toBuffer()],
      AMM_PROGRAM_ID
    )[0];

    // Single swap P → Q (A → B direction since P is token_a in P-Q pool)
    const accounts1 = [
      { pubkey: POOL_PQ_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_P_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultPQ, isSigner: false, isWritable: true },
      { pubkey: vaultQQ, isSigner: false, isWritable: true },
      { pubkey: userTokenP, isSigner: false, isWritable: true },
      { pubkey: userTokenQ, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const data1 = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data1.writeUInt8(3, 0); // Swap discriminator
    data1.writeBigUInt64LE(BigInt(amountInRaw), 1);
    data1.writeUInt8(1, 9); // direction_a_to_b = true (P → Q)

    const instruction1 = {
      programId: AMM_PROGRAM_ID,
      keys: accounts1,
      data: data1,
    };

    transaction1.add(instruction1);

    console.log('📝 Sending P → Q swap transaction...');
    const signature1 = await sendAndConfirmTransaction(connection, transaction1, [userKeypair]);
    console.log(`✅ P → Q swap completed! Signature: ${signature1}`);

    // Check intermediate balance
    const balanceQAfterStep1 = await getAccount(connection, userTokenQ);
    const qReceived = Number(balanceQAfterStep1.amount) - Number(balanceQBefore.amount);
    console.log(`📈 Q received from P → Q: ${(qReceived / 1e9).toFixed(6)}`);

    // Step 2: Q → R (Single Swap)
    console.log('\n🔄 Step 2: Q → R (Single Swap)');
    
    const transaction2 = new Transaction();
    
    // Get vault addresses for Q-R pool
    const vaultQR = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_QR_PDA.toBuffer(), TOKEN_Q_MINT.toBuffer()],
      AMM_PROGRAM_ID
    )[0];
    
    const vaultRR = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), POOL_QR_PDA.toBuffer(), TOKEN_R_MINT.toBuffer()],
      AMM_PROGRAM_ID
    )[0];

    // Single swap Q → R (A → B direction since Q is token_a in Q-R pool)
    const accounts2 = [
      { pubkey: POOL_QR_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_Q_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_R_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultQR, isSigner: false, isWritable: true },
      { pubkey: vaultRR, isSigner: false, isWritable: true },
      { pubkey: userTokenQ, isSigner: false, isWritable: true },
      { pubkey: userTokenR, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const data2 = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data2.writeUInt8(3, 0); // Swap discriminator
    data2.writeBigUInt64LE(BigInt(qReceived), 2); // Use all Q received from step 1
    data2.writeUInt8(1, 9); // direction_a_to_b = true (Q → R)

    const instruction2 = {
      programId: AMM_PROGRAM_ID,
      keys: accounts2,
      data: data2,
    };

    transaction2.add(instruction2);

    console.log('📝 Sending Q → R swap transaction...');
    const signature2 = await sendAndConfirmTransaction(connection, transaction2, [userKeypair]);
    console.log(`✅ Q → R swap completed! Signature: ${signature2}`);

    // Check final balances
    const balancePAfter = await getAccount(connection, userTokenP);
    const balanceQAfter = await getAccount(connection, userTokenQ);
    const balanceRAfter = await getAccount(connection, userTokenR);

    console.log('\n📊 Balances AFTER Working Multihop:');
    console.log(`Token P: ${(Number(balancePAfter.amount) / 1e9).toFixed(6)} (${balancePAfter.amount} raw)`);
    console.log(`Token Q: ${(Number(balanceQAfter.amount) / 1e9).toFixed(6)} (${balanceQAfter.amount} raw)`);
    console.log(`Token R: ${(Number(balanceRAfter.amount) / 1e9).toFixed(6)} (${balanceRAfter.amount} raw)`);

    const pUsed = Number(balancePBefore.amount) - Number(balancePAfter.amount);
    const qChange = Number(balanceQAfter.amount) - Number(balanceQBefore.amount);
    const rReceived = Number(balanceRAfter.amount) - Number(balanceRBefore.amount);

    console.log('\n📈 Working Multihop Results:');
    console.log(`Token P Used: ${(pUsed / 1e9).toFixed(6)}`);
    console.log(`Token Q Change: ${(qChange / 1e9).toFixed(6)} (should be ~0 for multihop)`);
    console.log(`Token R Received: ${(rReceived / 1e9).toFixed(6)}`);

    const effectiveRate = rReceived / pUsed;
    console.log(`\n💱 Effective Exchange Rate: 1 Token P = ${effectiveRate.toFixed(6)} Token R`);

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      swapType: 'Working Multihop P → Q → R (Two Single Swaps)',
      amountIn: amountIn,
      amountInRaw: amountInRaw,
      pUsed: pUsed,
      qChange: qChange,
      rReceived: rReceived,
      effectiveRate: effectiveRate,
      signatures: [signature1, signature2],
      balancesBefore: {
        p: Number(balancePBefore.amount),
        q: Number(balanceQBefore.amount),
        r: Number(balanceRBefore.amount),
      },
      balancesAfter: {
        p: Number(balancePAfter.amount),
        q: Number(balanceQAfter.amount),
        r: Number(balanceRAfter.amount),
      },
    };

    fs.writeFileSync('working-multihop-pqr-results.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Working multihop results saved to working-multihop-pqr-results.json');

  } catch (error) {
    console.error('❌ Error in working multihop P → Q → R:', error);
    throw error;
  }
}

// Run the working multihop
workingMultihopPQR().catch(console.error);

