import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
  createTransferInstruction,
} from '@solana/spl-token';
import { createHash } from 'crypto';

// Connection to GorbChain
const connection = new Connection('https://rpc.gorbchain.xyz', 'confirmed');

// Load keypair
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(require('fs').readFileSync('/home/saurabh/.config/solana/id.json', 'utf8')))
);

// Program ID
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

console.log('🚀 Initializing Pool A-C');
console.log('========================');
console.log(`Payer: ${payer.publicKey.toString()}`);

async function initPoolAC() {
  try {
    // Load token info
    const tokenAInfo = JSON.parse(require('fs').readFileSync('token-a-info.json', 'utf8'));
    const tokenCInfo = JSON.parse(require('fs').readFileSync('token-c-info.json', 'utf8'));
    
    const tokenA = new PublicKey(tokenAInfo.mint);
    const tokenC = new PublicKey(tokenCInfo.mint);
    
    console.log(`Token A: ${tokenA.toString()}`);
    console.log(`Token C: ${tokenC.toString()}`);

    // Generate pool PDA
    const [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), tokenA.toBuffer(), tokenC.toBuffer()],
      PROGRAM_ID
    );

    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Pool Bump: ${poolBump}`);

    // Generate vault A PDA
    const [vaultAPDA, vaultABump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenA.toBuffer()],
      PROGRAM_ID
    );

    // Generate vault C PDA
    const [vaultCPDA, vaultCBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenC.toBuffer()],
      PROGRAM_ID
    );

    console.log(`Vault A: ${vaultAPDA.toString()}`);
    console.log(`Vault C: ${vaultCPDA.toString()}`);

    // Generate LP mint PDA
    const [lpMintPDA, lpMintBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_mint'), poolPDA.toBuffer()],
      PROGRAM_ID
    );

    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // Get payer's token accounts
    const payerTokenAAccount = await getAssociatedTokenAddress(tokenA, payer.publicKey);
    const payerTokenCAccount = await getAssociatedTokenAddress(tokenC, payer.publicKey);

    // Create transaction
    const transaction = new Transaction();

    // Create vault A account
    const vaultARent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultAPDA,
        space: 165, // Token account size
        lamports: vaultARent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize vault A
    transaction.add(
      createInitializeMintInstruction(
        vaultAPDA,
        6,
        poolPDA,
        poolPDA
      )
    );

    // Create vault C account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultCPDA,
        space: 165,
        lamports: vaultARent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize vault C
    transaction.add(
      createInitializeMintInstruction(
        vaultCPDA,
        6,
        poolPDA,
        poolPDA
      )
    );

    // Create LP mint account
    const lpMintRent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: lpMintPDA,
        space: MINT_SIZE,
        lamports: lpMintRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize LP mint
    transaction.add(
      createInitializeMintInstruction(
        lpMintPDA,
        6,
        poolPDA,
        poolPDA
      )
    );

    // Create pool account
    const poolRent = await connection.getMinimumBalanceForRentExemption(200); // Pool account size
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: poolPDA,
        space: 200,
        lamports: poolRent,
        programId: PROGRAM_ID,
      })
    );

    // Initialize pool instruction
    const initPoolData = Buffer.alloc(1 + 32 + 32 + 8 + 8 + 8 + 1);
    initPoolData.writeUInt8(0, 0); // InitPool instruction discriminator
    tokenA.toBuffer().copy(initPoolData, 1);
    tokenC.toBuffer().copy(initPoolData, 33);
    initPoolData.writeBigUInt64LE(BigInt(0), 65); // initial_liquidity_a
    initPoolData.writeBigUInt64LE(BigInt(0), 73); // initial_liquidity_c
    initPoolData.writeUInt8(poolBump, 81);

    transaction.add({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: tokenA, isSigner: false, isWritable: false },
        { pubkey: tokenC, isSigner: false, isWritable: false },
        { pubkey: vaultAPDA, isSigner: false, isWritable: true },
        { pubkey: vaultCPDA, isSigner: false, isWritable: true },
        { pubkey: lpMintPDA, isSigner: false, isWritable: true },
        { pubkey: payerTokenAAccount, isSigner: false, isWritable: true },
        { pubkey: payerTokenCAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: initPoolData,
    });

    // Send transaction
    console.log('📤 Sending transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      { commitment: 'confirmed' }
    );

    console.log(`✅ Pool A-C initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);
    console.log(`Pool PDA: ${poolPDA.toString()}`);
    console.log(`Vault A: ${vaultAPDA.toString()}`);
    console.log(`Vault C: ${vaultCPDA.toString()}`);
    console.log(`LP Mint: ${lpMintPDA.toString()}`);

    // Save pool info
    const poolInfo = {
      pool: poolPDA.toString(),
      tokenA: tokenA.toString(),
      tokenC: tokenC.toString(),
      vaultA: vaultAPDA.toString(),
      vaultC: vaultCPDA.toString(),
      lpMint: lpMintPDA.toString(),
      bump: poolBump,
      signature: signature
    };

    require('fs').writeFileSync(
      'pool-ac-info.json',
      JSON.stringify(poolInfo, null, 2)
    );

    console.log('💾 Pool info saved to pool-ac-info.json');

  } catch (error) {
    console.error('❌ Error initializing Pool A-C:', error);
    throw error;
  }
}

// Run the function
initPoolAC().catch(console.error);
