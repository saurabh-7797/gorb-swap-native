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
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID as ATA_PROGRAM_ID,
} from '@solana/spl-token';

// Token addresses
const TOKEN_R_MINT = new PublicKey('4piSpQW5unjCX8rAxjVAfPBB6ZahUxRvK8cG9qB1UzGq');
const TOKEN_Q_MINT = new PublicKey('8W2CSgx45fsxP1WnnYJxJVqqVC7XKB1ARmFbiRXyUBTR');
const TOKEN_P_MINT = new PublicKey('AdoKnyzjB3JZM3jxAb75VkpgdXS8XBY8kLFoYXjyfhLW');

async function createTokenAccounts() {
  console.log('🚀 Creating Token Accounts...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load user keypair from system config
  const fs = require('fs');
  const keypairPath = '/home/saurabh/.config/solana/id.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const userKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

  console.log(`Main account: ${userKeypair.publicKey.toString()}`);

  // Get user token accounts
  const userTokenR = getAssociatedTokenAddressSync(TOKEN_R_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenQ = getAssociatedTokenAddressSync(TOKEN_Q_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenP = getAssociatedTokenAddressSync(TOKEN_P_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  console.log(`User Token R ATA: ${userTokenR.toString()}`);
  console.log(`User Token Q ATA: ${userTokenQ.toString()}`);
  console.log(`User Token P ATA: ${userTokenP.toString()}`);

  const transaction = new Transaction();

  // Create Token R account
  transaction.add(
    createAssociatedTokenAccountInstruction(
      userKeypair.publicKey, // payer
      userTokenR, // ata
      userKeypair.publicKey, // owner
      TOKEN_R_MINT, // mint
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    )
  );

  // Create Token Q account
  transaction.add(
    createAssociatedTokenAccountInstruction(
      userKeypair.publicKey, // payer
      userTokenQ, // ata
      userKeypair.publicKey, // owner
      TOKEN_Q_MINT, // mint
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    )
  );

  // Create Token P account
  transaction.add(
    createAssociatedTokenAccountInstruction(
      userKeypair.publicKey, // payer
      userTokenP, // ata
      userKeypair.publicKey, // owner
      TOKEN_P_MINT, // mint
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    )
  );

  try {
    console.log('📝 Creating token accounts...');
    const signature = await sendAndConfirmTransaction(connection, transaction, [userKeypair]);
    console.log(`✅ Token accounts created! Signature: ${signature}`);
  } catch (error) {
    console.error('❌ Error creating token accounts:', error);
    throw error;
  }
}

// Run the script
createTokenAccounts().catch(console.error);
