import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://rpc.gorbchain.xyz');
const vaultQ = new PublicKey('9TKtsxzBktatzRuvLamLHuh7rs9WR3KUsU4upu8h39PK');
const vaultR = new PublicKey('BqacvtnxZfeHSMb5u8f4SVeawekna4mQyjtDWTLkwWZA');

async function checkVaults() {
  try {
    const [vaultQInfo, vaultRInfo] = await Promise.all([
      connection.getAccountInfo(vaultQ, 'confirmed'),
      connection.getAccountInfo(vaultR, 'confirmed')
    ]);

    console.log('Vault Q exists:', !!vaultQInfo);
    if (vaultQInfo) {
      console.log('Vault Q data length:', vaultQInfo.data.length);
      console.log('Vault Q owner:', vaultQInfo.owner.toString());
    }
    
    console.log('Vault R exists:', !!vaultRInfo);
    if (vaultRInfo) {
      console.log('Vault R data length:', vaultRInfo.data.length);
      console.log('Vault R owner:', vaultRInfo.owner.toString());
    }
  } catch (error) {
    console.log('Error:', (error as Error).message);
  }
}

checkVaults();
