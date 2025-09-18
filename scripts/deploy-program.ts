import {
  Connection,
  PublicKey,
  Keypair,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Program Configuration
const PROGRAM_ID = new PublicKey('2Vc2V3BifdCT4njfUKJDGexJmMFmjiTiX2ET4RGo4twZ');
const PROGRAM_NAME = 'cargo_swap';

// RPC Configuration
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";

// File paths
const KEYPAIR_PATH = path.join(__dirname, '..', 'target', 'deploy', 'cargo_swap-keypair.json');
const SO_PATH = path.join(__dirname, '..', 'target', 'deploy', 'cargo_swap.so');
const DEPLOY_INFO_PATH = path.join(__dirname, 'deploy-info.json');

interface DeployInfo {
  programId: string;
  deployer: string;
  deployedAt: string;
  transactionSignature: string;
  programSize: number;
  rpcEndpoint: string;
  status: 'success' | 'failed';
  error?: string;
}

async function checkProgramExists(connection: Connection, programId: PublicKey): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(programId);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

async function checkDeployerBalance(connection: Connection, deployer: Keypair): Promise<number> {
  try {
    const balance = await connection.getBalance(deployer.publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('❌ Error checking deployer balance:', error);
    return 0;
  }
}

async function loadDeployerKeypair(): Promise<Keypair> {
  try {
    if (!fs.existsSync(KEYPAIR_PATH)) {
      throw new Error(`Keypair file not found at: ${KEYPAIR_PATH}`);
    }
    
    const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  } catch (error) {
    console.error('❌ Error loading deployer keypair:', error);
    throw error;
  }
}

async function checkProgramFile(): Promise<number> {
  try {
    if (!fs.existsSync(SO_PATH)) {
      throw new Error(`Program file not found at: ${SO_PATH}`);
    }
    
    const stats = fs.statSync(SO_PATH);
    return stats.size;
  } catch (error) {
    console.error('❌ Error checking program file:', error);
    throw error;
  }
}

async function deployProgram(connection: Connection, deployer: Keypair): Promise<string> {
  try {
    console.log('🚀 Starting program deployment...');
    
    // Read the program binary
    const programData = fs.readFileSync(SO_PATH);
    console.log(`📦 Program binary size: ${programData.length} bytes`);
    
    // Create the deployment transaction
    const transaction = new Transaction();
    
    // Add the program deployment instruction
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: deployer.publicKey,
        newAccountPubkey: PROGRAM_ID,
        lamports: await connection.getMinimumBalanceForRentExemption(programData.length),
        space: programData.length,
        programId: SystemProgram.programId,
      })
    );
    
    // Add the program data instruction
    transaction.add(
      SystemProgram.assign({
        accountPubkey: PROGRAM_ID,
        programId: SystemProgram.programId,
      })
    );
    
    // Set the program as the transaction's program
    transaction.setProgramId(PROGRAM_ID);
    
    console.log('📝 Transaction created, sending...');
    
    // Send and confirm the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      }
    );
    
    console.log(`✅ Program deployed successfully!`);
    console.log(`📋 Transaction signature: ${signature}`);
    
    return signature;
  } catch (error) {
    console.error('❌ Error deploying program:', error);
    throw error;
  }
}

async function verifyDeployment(connection: Connection): Promise<boolean> {
  try {
    console.log('🔍 Verifying deployment...');
    
    const accountInfo = await connection.getAccountInfo(PROGRAM_ID);
    
    if (accountInfo === null) {
      console.log('❌ Program account not found');
      return false;
    }
    
    if (!accountInfo.executable) {
      console.log('❌ Program account is not executable');
      return false;
    }
    
    if (accountInfo.owner.toString() !== SystemProgram.programId.toString()) {
      console.log('❌ Program account owner is not System Program');
      return false;
    }
    
    console.log('✅ Program deployment verified successfully!');
    console.log(`   Program ID: ${PROGRAM_ID.toString()}`);
    console.log(`   Account size: ${accountInfo.data.length} bytes`);
    console.log(`   Executable: ${accountInfo.executable}`);
    console.log(`   Owner: ${accountInfo.owner.toString()}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error verifying deployment:', error);
    return false;
  }
}

function saveDeployInfo(deployInfo: DeployInfo): void {
  try {
    fs.writeFileSync(DEPLOY_INFO_PATH, JSON.stringify(deployInfo, null, 2));
    console.log(`💾 Deploy info saved to: ${DEPLOY_INFO_PATH}`);
  } catch (error) {
    console.error('❌ Error saving deploy info:', error);
  }
}

async function main() {
  console.log('🚀 Solana Program Deployment Script');
  console.log('=====================================\n');
  
  // Create connection
  const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'confirmed',
    wsEndpoint: WS_ENDPOINT,
  });
  
  try {
    // Check if program already exists
    console.log('🔍 Checking if program already exists...');
    const programExists = await checkProgramExists(connection, PROGRAM_ID);
    
    if (programExists) {
      console.log('⚠️  Program already exists at this address!');
      console.log(`   Program ID: ${PROGRAM_ID.toString()}`);
      
      const verify = await verifyDeployment(connection);
      if (verify) {
        console.log('✅ Existing program is valid and executable');
        return;
      } else {
        console.log('❌ Existing program is invalid');
        return;
      }
    }
    
    // Load deployer keypair
    console.log('🔑 Loading deployer keypair...');
    const deployer = await loadDeployerKeypair();
    console.log(`   Deployer: ${deployer.publicKey.toString()}`);
    
    // Check deployer balance
    console.log('💰 Checking deployer balance...');
    const balance = await checkDeployerBalance(connection, deployer);
    console.log(`   Balance: ${balance.toFixed(6)} SOL`);
    
    if (balance < 0.1) {
      console.log('⚠️  Warning: Low balance. You may need more SOL for deployment.');
    }
    
    // Check program file
    console.log('📦 Checking program file...');
    const programSize = await checkProgramFile();
    console.log(`   Program size: ${programSize} bytes`);
    
    if (programSize > 10 * 1024 * 1024) { // 10MB limit
      console.log('⚠️  Warning: Program size is large. This may cause deployment issues.');
    }
    
    // Deploy the program
    console.log('\n🚀 Deploying program...');
    const signature = await deployProgram(connection, deployer);
    
    // Verify deployment
    console.log('\n🔍 Verifying deployment...');
    const verified = await verifyDeployment(connection);
    
    if (verified) {
      // Save deploy info
      const deployInfo: DeployInfo = {
        programId: PROGRAM_ID.toString(),
        deployer: deployer.publicKey.toString(),
        deployedAt: new Date().toISOString(),
        transactionSignature: signature,
        programSize: programSize,
        rpcEndpoint: RPC_ENDPOINT,
        status: 'success'
      };
      
      saveDeployInfo(deployInfo);
      
      console.log('\n🎉 DEPLOYMENT SUCCESSFUL!');
      console.log('========================');
      console.log(`Program ID: ${PROGRAM_ID.toString()}`);
      console.log(`Deployer: ${deployer.publicKey.toString()}`);
      console.log(`Transaction: ${signature}`);
      console.log(`Size: ${programSize} bytes`);
      console.log(`RPC: ${RPC_ENDPOINT}`);
      console.log(`Time: ${deployInfo.deployedAt}`);
      
    } else {
      console.log('\n❌ DEPLOYMENT FAILED!');
      console.log('====================');
      console.log('Program deployment completed but verification failed.');
      
      const deployInfo: DeployInfo = {
        programId: PROGRAM_ID.toString(),
        deployer: deployer.publicKey.toString(),
        deployedAt: new Date().toISOString(),
        transactionSignature: signature,
        programSize: programSize,
        rpcEndpoint: RPC_ENDPOINT,
        status: 'failed',
        error: 'Verification failed'
      };
      
      saveDeployInfo(deployInfo);
    }
    
  } catch (error) {
    console.error('\n❌ DEPLOYMENT FAILED!');
    console.error('====================');
    console.error('Error:', error);
    
    const deployInfo: DeployInfo = {
      programId: PROGRAM_ID.toString(),
      deployer: 'unknown',
      deployedAt: new Date().toISOString(),
      transactionSignature: '',
      programSize: 0,
      rpcEndpoint: RPC_ENDPOINT,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    saveDeployInfo(deployInfo);
  }
}

// Run the script
main().catch(console.error);
