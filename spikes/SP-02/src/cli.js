#!/usr/bin/env node
/** Minimal standalone SP-02 smoke runner; will become a Fastify service at R2. */
import { resolve } from 'node:path';
import { EdgeTtsAdapter } from './edge.js';
import { LocalHttpTtsAdapter } from './local.js';
import { EspeakTtsAdapter } from './espeak.js';
import { TtsService } from './service.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  const edge = new EdgeTtsAdapter({ python: process.env.TTS_PYTHON || undefined });
  const espeak = new EspeakTtsAdapter({ binary: process.env.TTS_ESPEAK_BINARY || 'espeak' });
  const local = process.env.TTS_LOCAL_ENDPOINT ? new LocalHttpTtsAdapter({
    endpoint: process.env.TTS_LOCAL_ENDPOINT,
    bodyFormat: process.env.TTS_LOCAL_BODY_FORMAT || 'json',
    voice: process.env.TTS_LOCAL_VOICE || 'default',
  }) : null;
  if (command === 'diagnose') {
    process.stdout.write(JSON.stringify({
      edge: await edge.health(),
      edgeVoices: edge.voices(),
      local: local ? await local.health() : { status: 'not_configured' },
      espeak: await espeak.health(),
      note: 'Edge dependency check does not contact Microsoft; synthesis not verified',
    }, null, 2) + '\n');
    return;
  }
  if (command !== 'synth') throw Error('Use: node src/cli.js diagnose | synth [--provider edge|local|offline|auto] [--voice VOICE_ID]');
  const readArg = (key, fallback) => { const idx = args.indexOf(key); return idx >= 0 ? args[idx + 1] : fallback; };
  const selected = readArg('--provider', 'auto');
  const voice = readArg('--voice', 'vi-VN-HoaiMyNeural');
  const text = await new Promise((resolveText, rejectText) => {
    let value = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { value += chunk; if (value.length > 4000) rejectText(Error('Text too long')); });
    process.stdin.on('end', () => resolveText(value));
    process.stdin.on('error', rejectText);
  });
  const adapters = selected === 'local' ? [local] : selected === 'edge' ? [edge] : selected === 'offline' ? [espeak] : [edge, ...(local ? [local] : []), ...(process.env.TTS_ENABLE_ESPEAK === '1' ? [espeak] : [])];
  if (adapters.some(a => !a)) throw Error('Local provider requires TTS_LOCAL_ENDPOINT');
  const service = new TtsService({ dataRoot: resolve(process.env.TTS_DATA_ROOT || './data'), adapters });
  const result = await service.synthesize({ projectId: 'smoke', sceneId: 'intro', text, voice, voiceByProvider: { 'espeak-local': 'vi' } }, {
    providerIds: adapters.map(a => a.id),
  });
  // Never print narration text or credentials, even in diagnostic mode.
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(error => {
  process.stderr.write(`${error.code ?? 'ERROR'}: ${error.message}\n`);
  process.exitCode = 1;
});
