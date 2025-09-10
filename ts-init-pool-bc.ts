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

console.log('🚀 Initializing Pool B-C');

async function initPoolBC() {
  try {
    const tokenBInfo = JSON.parse(require('fs').readFileSync('token-b-info.json', 'utf8'));
    const tokenCInfo = JSON.parse(require('fs').readFileSync('token-c-info.json', 'utf8'));
    
    const tokenB = new PublicKey(tokenBInfo.mint);
    const tokenC = new PublicKey(tokenCInfo.mint);
    
    const [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), tokenB.toBuffer(), tokenC.toBuffer()],
      PROGRAM_ID
    );

    const [vaultBPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenB.toBuffer()],
      PROGRAM_ID
    );

    const [vaultCPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenC.toBuffer()],
      PROGRAM_ID
    );

    const [lpMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_mint'), poolPDA.toBuffer()],
      PROGRAM_ID
    );

    const payerTokenBAccount = await getAssociatedTokenAddress(tokenB, payer.publicKey);
    const payerTokenCAccount = await getAssociatedTokenAddress(tokenC, payer.publicKey);

    const transaction = new Transaction();

    const vaultRent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultBPDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vaultBPDA, 6, poolPDA, poolPDA)
    );

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultCPDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vaultCPDA, 6, poolPDA, poolPDA)
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
    tokenB.toBuffer().copy(initPoolData, 1);
    tokenC.toBuffer().copy(initPoolData, 33);
    initPoolData.writeBigUInt64LE(BigInt(0), 65);
    initPoolData.writeBigUInt64LE(BigInt(0), 73);
    initPoolData.writeUInt8(poolBump, 81);

    transaction.add({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: tokenB, isSigner: false, isWritable: false },
        { pubkey: tokenC, isSigner: false, isWritable: false },
        { pubkey: vaultBPDA, isSigner: false, isWritable: true },
        { pubkey: vaultCPDA, isSigner: false, isWritable: true },
        { pubkey: lpMintPDA, isSigner: false, isWritable: true },
        { pubkey: payerTokenBAccount, isSigner: false, isWritable: true },
        { pubkey: payerTokenCAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: initPoolData,
    });

    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: 'confirmed' });

    console.log(`✅ Pool B-C initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    const poolInfo = {
      pool: poolPDA.toString(),
      tokenB: tokenB.toString(),
      tokenC: tokenC.toString(),
      vaultB: vaultBPDA.toString(),
      vaultC: vaultCPDA.toString(),
      lpMint: lpMintPDA.toString(),
      bump: poolBump,
      signature: signature
    };

    require('fs').writeFileSync('pool-bc-info.json', JSON.stringify(poolInfo, null, 2));
    console.log('💾 Pool info saved to pool-bc-info.json');

  } catch (error) {
    console.error('❌ Error initializing Pool B-C:', error);
    throw error;
  }
}

initPoolBC().catch(console.error);