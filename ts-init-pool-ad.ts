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

console.log('🚀 Initializing Pool A-D');

async function initPoolAD() {
  try {
    const tokenAInfo = JSON.parse(require('fs').readFileSync('token-a-info.json', 'utf8'));
    const tokenDInfo = JSON.parse(require('fs').readFileSync('token-d-info.json', 'utf8'));
    
    const tokenA = new PublicKey(tokenAInfo.mint);
    const tokenD = new PublicKey(tokenDInfo.mint);
    
    const [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), tokenA.toBuffer(), tokenD.toBuffer()],
      PROGRAM_ID
    );

    const [vaultAPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenA.toBuffer()],
      PROGRAM_ID
    );

    const [vaultDPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), tokenD.toBuffer()],
      PROGRAM_ID
    );

    const [lpMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_mint'), poolPDA.toBuffer()],
      PROGRAM_ID
    );

    const payerTokenAAccount = await getAssociatedTokenAddress(tokenA, payer.publicKey);
    const payerTokenDAccount = await getAssociatedTokenAddress(tokenD, payer.publicKey);

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
        newAccountPubkey: vaultDPDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vaultDPDA, 6, poolPDA, poolPDA)
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
    tokenD.toBuffer().copy(initPoolData, 33);
    initPoolData.writeBigUInt64LE(BigInt(0), 65);
    initPoolData.writeBigUInt64LE(BigInt(0), 73);
    initPoolData.writeUInt8(poolBump, 81);

    transaction.add({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: tokenA, isSigner: false, isWritable: false },
        { pubkey: tokenD, isSigner: false, isWritable: false },
        { pubkey: vaultAPDA, isSigner: false, isWritable: true },
        { pubkey: vaultDPDA, isSigner: false, isWritable: true },
        { pubkey: lpMintPDA, isSigner: false, isWritable: true },
        { pubkey: payerTokenAAccount, isSigner: false, isWritable: true },
        { pubkey: payerTokenDAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: initPoolData,
    });

    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: 'confirmed' });

    console.log(`✅ Pool A-D initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);

    const poolInfo = {
      pool: poolPDA.toString(),
      tokenA: tokenA.toString(),
      tokenD: tokenD.toString(),
      vaultA: vaultAPDA.toString(),
      vaultD: vaultDPDA.toString(),
      lpMint: lpMintPDA.toString(),
      bump: poolBump,
      signature: signature
    };

    require('fs').writeFileSync('pool-ad-info.json', JSON.stringify(poolInfo, null, 2));
    console.log('💾 Pool info saved to pool-ad-info.json');

  } catch (error) {
    console.error('❌ Error initializing Pool A-D:', error);
    throw error;
  }
}

initPoolAD().catch(console.error);
