import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, setProvider } = pkg;
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const kycIdl = JSON.parse(readFileSync(join(__dirname, '../frontend/src/idl/signal_kyc_hook.json'), 'utf8'));
const env = readFileSync(join(__dirname, '../frontend/.env'), 'utf8');
const mintAddress = env.match(/VITE_VUSDC_MINT=(.+)/)[1].trim();

const provider = AnchorProvider.env();
setProvider(provider);

const kycProgram = new Program(kycIdl, provider);
const mint = new PublicKey(mintAddress);

console.log('Mint:', mintAddress);

const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('extra-account-metas'), mint.toBuffer()],
  kycProgram.programId
);

console.log('ExtraAccountMetaList PDA:', extraAccountMetaListPDA.toBase58());

await kycProgram.methods
  .initializeExtraAccountMetaList()
  .accounts({
    payer: provider.wallet.publicKey,
    extraAccountMetaList: extraAccountMetaListPDA,
    mint: mint,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log('ExtraAccountMetaList initialized!');
