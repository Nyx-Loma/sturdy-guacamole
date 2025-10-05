/* global console */
import { generateKeyPair, exportSPKI, exportPKCS8 } from 'jose';

const main = async () => {
  console.log('Generating RS256 keypair for testing...\n');
  
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  
  const publicKeyPem = await exportSPKI(publicKey);
  const privateKeyPem = await exportPKCS8(privateKey);
  
  console.log('Public Key (use this for JWT_PUBLIC_KEY):');
  console.log('─'.repeat(70));
  console.log(publicKeyPem);
  
  console.log('\nPrivate Key (save this for load testing):');
  console.log('─'.repeat(70));
  console.log(privateKeyPem);
};

main().catch(console.error);
