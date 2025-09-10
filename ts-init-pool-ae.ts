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
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';

const connection = new Connection('https://rpc.gorbchain.xyz', 'confirmed');
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(require('fs').readFileSync('/home/saurabh/.config/solana/id.json', 'utf8')))
);
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

console.log('🚀 Initializing Pool A-E');

async function initPoolAE() {
  try {
    const tokenAInfo = JSON.parse(require('fs').readFileSync('token-a-info.json', 'utf8'));
    const tokenEInfo = JSON.parse(require('fs').readFileSync('token-e-info.json', 'utf8'));
    
    const tokenA = new PublicKey(tokenAInfo.mint);
    const tokenE = new PublicKey(tokenEInfo.mint);
    
    const [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), tokenA.toBuffer(), tokenE.toBuffer()],
      PROGRAM_ID
    );

    const [vaultAPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenA.toBuffer()],
      PROGRAM_ID
    );

    const [vaultEPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenE.toBuffer()],
      PROGRAM_ID
    );

    const [lpMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_mint'), poolPDA.toBuffer()],
      PROGRAM_ID
    );

    const payerTokenAAccount = await getAssociatedTokenAddress(tokenA, payer.publicKey);
    const payerTokenEAccount = await getAssociatedTokenAddress(tokenE, payer.publicKey);

    const transaction = new Transaction();

    const vaultRent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultAPDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vaultAPDA, 6, poolPDA, poolPDA)
    );

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultEPDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vaultEPDA, 6, poolPDA, poolPDA)
    );

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

    transaction.add(
      createInitializeMintInstruction(lpMintPDA, 6, poolPDA, poolPDA)
    );

    const poolRent = await connection.getMinimumBalanceForRentExemption(200);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: poolPDA,
        space: 200,
        lamports: poolRent,
        programId: PROGRAM_ID,
      })
    );

    const initPoolData = Buffer.alloc(1 + 32 + 32 + 8 + 8 + 8 + 1);
    initPoolData.writeUInt8(0, 0);
    tokenA.toBuffer().copy(initPoolData, 1);
    tokenE.toBuffer().copy(initPoolData, 33);
    initPoolData.writeBigUInt64LE(BigInt(0), 65);
    initPoolData.writeBigUInt64LE(BigInt(0), 73);
    initPoolData.writeUInt8(poolBump, 81);

    transaction.add({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: tokenA, isSigner: false, isWritable: false },
        { pubkey: tokenE, isSigner: false, isWritable: false },
        { pubkey: vaultAPDA, isSigner: false, isWritable: true },
        { pubkey: vaultEPDA, isSigner: false, isWritable: true },
        { pubkey: lpMintPDA, isSigner: false, isWritable: true },
        { pubkey: payerTokenAAccount, isSigner: false, isWritable: true },
        { pubkey: payerTokenEAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: initPoolData,
    });

    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: 'confirmed' });

    console.log(`✅ Pool A-E initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    const poolInfo = {
      pool: poolPDA.toString(),
      tokenA: tokenA.toString(),
      tokenE: tokenE.toString(),
      vaultA: vaultAPDA.toString(),
      vaultE: vaultEPDA.toString(),
      lpMint: lpMintPDA.toString(),
      bump: poolBump,
      signature: signature
    };

    require('fs').writeFileSync('pool-ae-info.json', JSON.stringify(poolInfo, null, 2));
    console.log('💾 Pool info saved to pool-ae-info.json');

  } catch (error) {
    console.error('❌ Error initializing Pool A-E:', error);
    throw error;
  }
}

initPoolAE().catch(console.error);