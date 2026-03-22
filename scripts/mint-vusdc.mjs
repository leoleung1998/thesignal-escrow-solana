import pkg from '@coral-xyz/anchor';
const { AnchorProvider, setProvider } = pkg;
import { PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../frontend/.env'), 'utf8');
const mintAddress = env.match(/VITE_VUSDC_MINT=(.+)/)[1].trim();

const provider = AnchorProvider.env();
setProvider(provider);

const mint = new PublicKey(mintAddress);
const wallets = process.argv.slice(2);

if (wallets.length === 0) {
  console.log('Usage: node mint-vusdc.mjs <wallet1> <wallet2> ...');
  process.exit(1);
}

for (const w of wallets) {
  const owner = new PublicKey(w);
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection, provider.wallet.payer, mint, owner,
    false, undefined, undefined, TOKEN_2022_PROGRAM_ID
  );
  await mintTo(
    provider.connection, provider.wallet.payer, mint, ata.address,
    provider.wallet.payer, 100_000 * 1_000_000, [], undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log('Minted 100,000 vUSDC to', w);
}
