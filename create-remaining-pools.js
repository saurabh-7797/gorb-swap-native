const fs = require('fs');

const poolPairs = [
  { name: 'ae', token1: 'A', token2: 'E' },
  { name: 'bc', token1: 'B', token2: 'C' },
  { name: 'bd', token1: 'B', token2: 'D' },
  { name: 'be', token1: 'B', token2: 'E' },
  { name: 'cd', token1: 'C', token2: 'D' },
  { name: 'ce', token1: 'C', token2: 'E' },
  { name: 'de', token1: 'D', token2: 'E' }
];

const template = `import {
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

console.log('🚀 Initializing Pool {TOKEN1}-{TOKEN2}');

async function initPool{TOKEN1}{TOKEN2}() {
  try {
    const token{TOKEN1}Info = JSON.parse(require('fs').readFileSync('token-{token1}-info.json', 'utf8'));
    const token{TOKEN2}Info = JSON.parse(require('fs').readFileSync('token-{token2}-info.json', 'utf8'));
    
    const token{TOKEN1} = new PublicKey(token{TOKEN1}Info.mint);
    const token{TOKEN2} = new PublicKey(token{TOKEN2}Info.mint);
    
    const [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), token{TOKEN1}.toBuffer(), token{TOKEN2}.toBuffer()],
      PROGRAM_ID
    );

    const [vault{TOKEN1}PDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), token{TOKEN1}.toBuffer()],
      PROGRAM_ID
    );

    const [vault{TOKEN2}PDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), poolPDA.toBuffer(), token{TOKEN2}.toBuffer()],
      PROGRAM_ID
    );

    const [lpMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_mint'), poolPDA.toBuffer()],
      PROGRAM_ID
    );

    const payerToken{TOKEN1}Account = await getAssociatedTokenAddress(token{TOKEN1}, payer.publicKey);
    const payerToken{TOKEN2}Account = await getAssociatedTokenAddress(token{TOKEN2}, payer.publicKey);

    const transaction = new Transaction();

    const vaultRent = await getMinimumBalanceForRentExemptMint(connection);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vault{TOKEN1}PDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vault{TOKEN1}PDA, 6, poolPDA, poolPDA)
    );

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vault{TOKEN2}PDA,
        space: 165,
        lamports: vaultRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(vault{TOKEN2}PDA, 6, poolPDA, poolPDA)
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
    token{TOKEN1}.toBuffer().copy(initPoolData, 1);
    token{TOKEN2}.toBuffer().copy(initPoolData, 33);
    initPoolData.writeBigUInt64LE(BigInt(0), 65);
    initPoolData.writeBigUInt64LE(BigInt(0), 73);
    initPoolData.writeUInt8(poolBump, 81);

    transaction.add({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: token{TOKEN1}, isSigner: false, isWritable: false },
        { pubkey: token{TOKEN2}, isSigner: false, isWritable: false },
        { pubkey: vault{TOKEN1}PDA, isSigner: false, isWritable: true },
        { pubkey: vault{TOKEN2}PDA, isSigner: false, isWritable: true },
        { pubkey: lpMintPDA, isSigner: false, isWritable: true },
        { pubkey: payerToken{TOKEN1}Account, isSigner: false, isWritable: true },
        { pubkey: payerToken{TOKEN2}Account, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: initPoolData,
    });

    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: 'confirmed' });

    console.log(\`✅ Pool {TOKEN1}-{TOKEN2} initialized successfully!\`);
    console.log(\`Transaction signature: \${signature}\`);

    const poolInfo = {
      pool: poolPDA.toString(),
      token{TOKEN1}: token{TOKEN1}.toString(),
      token{TOKEN2}: token{TOKEN2}.toString(),
      vault{TOKEN1}: vault{TOKEN1}PDA.toString(),
      vault{TOKEN2}: vault{TOKEN2}PDA.toString(),
      lpMint: lpMintPDA.toString(),
      bump: poolBump,
      signature: signature
    };

    require('fs').writeFileSync('pool-{name}-info.json', JSON.stringify(poolInfo, null, 2));
    console.log('💾 Pool info saved to pool-{name}-info.json');

  } catch (error) {
    console.error('❌ Error initializing Pool {TOKEN1}-{TOKEN2}:', error);
    throw error;
  }
}

initPool{TOKEN1}{TOKEN2}().catch(console.error);`;

poolPairs.forEach(pair => {
  let content = template
    .replace(/{TOKEN1}/g, pair.token1)
    .replace(/{TOKEN2}/g, pair.token2)
    .replace(/{token1}/g, pair.token1.toLowerCase())
    .replace(/{token2}/g, pair.token2.toLowerCase())
    .replace(/{name}/g, pair.name);
  
  fs.writeFileSync(`ts-init-pool-${pair.name}.ts`, content);
  console.log(`Created ts-init-pool-${pair.name}.ts`);
});

console.log('All pool files created!');
