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
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Program ID
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

// GorbChain SPL Token Program ID
const GORBCHAIN_SPL_TOKEN_PROGRAM = new PublicKey('G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6');

// Instruction discriminator for SwapNativeSOLToToken
const SWAP_SOL_TO_TOKEN_DISCRIMINATOR = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]); // Replace with actual discriminator

async function main() {
  // Setup connection
  const connection = new Connection('http://localhost:8899', 'confirmed');
  
  // Create keypairs
  const user = Keypair.generate();
  
  // Replace with actual token mint address from pool initialization
  const tokenMint = new PublicKey('YOUR_TOKEN_MINT_ADDRESS_HERE');
  
  console.log('User:', user.publicKey.toString());
  console.log('Token Mint:', tokenMint.toString());
  
  // Airdrop SOL to user
  console.log('Airdropping SOL to user...');
  const airdropSignature = await connection.requestAirdrop(user.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSignature);
  
  // Derive PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('native_sol_pool'), tokenMint.toBuffer()],
    PROGRAM_ID
  );
  
  const [poolTokenVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('native_sol_vault'), poolPDA.toBuffer(), tokenMint.toBuffer()],
    PROGRAM_ID
  );
  
  console.log('Pool PDA:', poolPDA.toString());
  console.log('Pool Token Vault PDA:', poolTokenVaultPDA.toString());
  
  // Get user token account
  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    user.publicKey,
    false,
    GORBCHAIN_SPL_TOKEN_PROGRAM
  );
  
  console.log('User Token Account:', userTokenAccount.toString());
  
  // Create transaction
  const transaction = new Transaction();
  
  // Create SwapNativeSOLToToken instruction
  const swapIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: poolTokenVaultPDA, isSigner: false, isWritable: true },
      { pubkey: user.publicKey, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: GORBCHAIN_SPL_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      SWAP_SOL_TO_TOKEN_DISCRIMINATOR,
      Buffer.alloc(8, 0), // amount_in (0.1 SOL)
      Buffer.alloc(8, 0), // minimum_amount_out (0)
    ]),
  };
  
  // Add instruction to transaction
  transaction.add(swapIx);
  
  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = user.publicKey;
  
  // Sign and send transaction
  console.log('Sending swap transaction...');
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [user],
      { commitment: 'confirmed' }
    );
    
    console.log('Swap transaction successful!');
    console.log('Signature:', signature);
    
    // Check user token balance
    const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
    console.log('User token balance:', tokenBalance.value.uiAmount);
    
  } catch (error) {
    console.error('Swap transaction failed:', error);
  }
}

main().catch(console.error);
