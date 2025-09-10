import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createMintToInstruction,
  createTransferInstruction,
  createInitializeAccountInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
// Removed unused imports

// Program ID
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

// GorbChain SPL Token Program ID
const GORBCHAIN_SPL_TOKEN_PROGRAM = new PublicKey('G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6');

// ATA Program ID
const ATA_PROGRAM_ID = new PublicKey('GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm');

// Native SOL address on GorbChain
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Instruction discriminator for InitNativeSOLPool (we'll need to get this from the program)
const INIT_NATIVE_SOL_POOL_DISCRIMINATOR = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]); // Replace with actual discriminator

async function main() {
  // Setup connection to GorbChain
  const connection = new Connection('https://rpc.gorbchain.xyz', 'confirmed');
  
  // Create keypairs
  const user = Keypair.generate();
  const tokenMint = Keypair.generate();
  
  console.log('User:', user.publicKey.toString());
  console.log('Token Mint:', tokenMint.publicKey.toString());
  console.log('Native SOL Mint:', NATIVE_SOL_MINT.toString());
  
  // Check user balance
  const userBalance = await connection.getBalance(user.publicKey);
  console.log('User SOL balance:', userBalance / LAMPORTS_PER_SOL);
  
  if (userBalance < 5 * LAMPORTS_PER_SOL) {
    console.log('User needs more SOL. Please fund the account or use a different keypair.');
    return;
  }
  
  // Derive PDAs for native SOL pool (pool between custom token and native SOL)
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('native_sol_pool'), tokenMint.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  const [lpMintPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('native_sol_lp_mint'), poolPDA.toBuffer()],
    PROGRAM_ID
  );
  
  const [poolTokenVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('native_sol_vault'), poolPDA.toBuffer(), tokenMint.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  console.log('Pool PDA:', poolPDA.toString());
  console.log('LP Mint PDA:', lpMintPDA.toString());
  console.log('Pool Token Vault PDA:', poolTokenVaultPDA.toString());
  
  // Get user token account
  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint.publicKey,
    user.publicKey,
    false,
    GORBCHAIN_SPL_TOKEN_PROGRAM
  );
  
  // Get user LP account
  const userLpAccount = await getAssociatedTokenAddress(
    lpMintPDA,
    user.publicKey,
    false,
    GORBCHAIN_SPL_TOKEN_PROGRAM
  );
  
  console.log('User Token Account:', userTokenAccount.toString());
  console.log('User LP Account:', userLpAccount.toString());
  
  // Create transaction
  const transaction = new Transaction();
  
  // 1. Create token mint
  const createMintIx = SystemProgram.createAccount({
    fromPubkey: user.publicKey,
    newAccountPubkey: tokenMint.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
    space: MINT_SIZE,
    programId: GORBCHAIN_SPL_TOKEN_PROGRAM,
  });
  
  const initMintIx = createInitializeMintInstruction(
    tokenMint.publicKey,
    6, // decimals
    user.publicKey, // mint authority
    user.publicKey  // freeze authority
  );
  
  // 2. Create user token account
  const createUserTokenAccountIx = createAssociatedTokenAccountInstruction(
    user.publicKey, // payer
    userTokenAccount, // associated token
    user.publicKey, // owner
    tokenMint.publicKey, // mint
    GORBCHAIN_SPL_TOKEN_PROGRAM,
    ATA_PROGRAM_ID
  );
  
  // 3. Mint tokens to user
  const mintTokensIx = createMintToInstruction(
    tokenMint.publicKey,
    userTokenAccount,
    user.publicKey,
    1000000 * LAMPORTS_PER_SOL, // 1M tokens
    [],
    GORBCHAIN_SPL_TOKEN_PROGRAM
  );
  
  // 4. Create InitNativeSOLPool instruction
  const initPoolIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: tokenMint.publicKey, isSigner: false, isWritable: false },
      { pubkey: user.publicKey, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userLpAccount, isSigner: false, isWritable: true },
      { pubkey: lpMintPDA, isSigner: false, isWritable: true },
      { pubkey: poolTokenVaultPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: GORBCHAIN_SPL_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INIT_NATIVE_SOL_POOL_DISCRIMINATOR,
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(1 * LAMPORTS_PER_SOL)]).buffer)), // amount_sol (1 SOL)
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(1000 * LAMPORTS_PER_SOL)]).buffer)), // amount_token (1000 tokens)
    ]),
  };
  
  // Add instructions to transaction
  transaction.add(createMintIx);
  transaction.add(initMintIx);
  transaction.add(createUserTokenAccountIx);
  transaction.add(mintTokensIx);
  transaction.add(initPoolIx);
  
  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = user.publicKey;
  
  // Sign and send transaction
  console.log('Sending transaction...');
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [user, tokenMint],
      { commitment: 'confirmed' }
    );
    
    console.log('Transaction successful!');
    console.log('Signature:', signature);
    
    // Get pool info
    const poolAccountInfo = await connection.getAccountInfo(poolPDA);
    if (poolAccountInfo) {
      console.log('Pool account created successfully!');
      console.log('Pool data length:', poolAccountInfo.data.length);
    }
    
  } catch (error) {
    console.error('Transaction failed:', error);
  }
}

main().catch(console.error);
