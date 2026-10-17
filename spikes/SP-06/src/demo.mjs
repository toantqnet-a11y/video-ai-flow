/**
 * Local diagnostic only. No default credentials, no network binding outside
 * loopback and no persistent session token. Never print tokens to terminal.
 */
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { PassphraseVault } from './vault.mjs';
import { startSecureLocalServer } from './http.mjs';

const temp = await mkdtemp(path.join(os.tmpdir(), 'contentstudio-sp06-'));
const vault = new PassphraseVault(temp);
const session = await startSecureLocalServer({ vault });
try {
  const response = await fetch(`${session.url}/health`);
  console.log(JSON.stringify({ loopback: session.server.address().address, healthStatus: response.status,
    vault: (await vault.status()).state, note: 'Security-only smoke; credentials not saved' }));
} finally { await session.close(); vault.lock(); await rm(temp, { recursive: true, force: true }); }
