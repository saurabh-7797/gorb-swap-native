import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// Program ID
const PROGRAM_ID = new PublicKey('aBfrRgukSYDMgdyQ8y1XNEk4w5u7Ugtz5fPHFnkStJX');

// Instruction discriminator for GetNativeSOLSwapQuote
const GET_SWAP_QUOTE_DISCRIMINATOR = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]); // Replace with actual discriminator

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
  const airdropSignature = await connection.requestAirdrop(user.publicKey, 1 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSignature);
  
  // Derive PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('native_sol_pool'), tokenMint.toBuffer()],
    PROGRAM_ID
  );
  
  console.log('Pool PDA:', poolPDA.toString());
  
  // Create transaction
  const transaction = new Transaction();
  
  // Create GetNativeSOLSwapQuote instruction for SOL to Token
  const getQuoteIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      GET_SWAP_QUOTE_DISCRIMINATOR,
      Buffer.alloc(8, 0), // amount_in (0.1 SOL)
      Buffer.alloc(1, 1), // is_sol_to_token (true)
    ]),
  };
  
  // Add instruction to transaction
  transaction.add(getQuoteIx);
  
  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = user.publicKey;
  
  // Sign and send transaction
  console.log('Sending get swap quote transaction...');
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [user],
      { commitment: 'confirmed' }
    );
    
    console.log('Get swap quote transaction successful!');
    console.log('Signature:', signature);
    
    // The quote information will be logged by the program
    console.log('Check the program logs for swap quote information');
    
  } catch (error) {
    console.error('Get swap quote transaction failed:', error);
  }
}

main().catch(console.error);
