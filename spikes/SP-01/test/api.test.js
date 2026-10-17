import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('GET /api/v1/system/diagnostics returns JSON on loopback', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const child = spawn(process.execPath, [path.resolve(here, '../src/cli.js'), 'serve'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('server did not start')), 10000);
      child.stdout.on('data', buf => {
        const m = buf.toString().match(/http:\/\/127\.0\.0\.1:\d+\/api\/v1\/system\/diagnostics/);
        if (m) { clearTimeout(timer); resolve(m[0]); }
      });
      child.on('exit', code => { clearTimeout(timer); reject(Error(`server exited ${code}`)); });
    });
    const r = await fetch(url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const body = await r.json();
    assert.equal(body.data.schemaVersion, 1);
    assert.ok(body.data.media.encoders);
    const fail = await fetch(url, { method: 'POST' });
    assert.equal(fail.status, 404);
  } finally { child.kill(); }
});
