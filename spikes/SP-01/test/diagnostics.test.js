import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDiagnostics, evaluatePrerequisites } from '../src/diagnostics.js';
import { benchmark } from '../src/benchmark.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('diagnostics: valid schema, disk, CPU, no host/user identity', () => {
  const diag = collectDiagnostics(os.tmpdir());
  assert.equal(diag.schemaVersion, 1);
  assert.ok(diag.machine.logicalCores > 0);
  assert.ok(diag.machine.totalRamBytes > 0);
  assert.ok(diag.disk.totalBytes > 0);
  assert.equal(JSON.stringify(diag).includes(os.hostname()), false);
  assert.ok(['WINDOWS_TEST_PENDING_NON_WINDOWS_RUN','WINDOWS_ENVIRONMENT_DETECTED_NOT_YET_BENCHMARKED'].includes(diag.verdict));
});
test('prerequisites: missing codecs fail closed', () => {
  assert.deepEqual(evaluatePrerequisites({ media: { ffmpeg: null, ffprobe: null, encoders: { libx264: false, aac: false } } }).missing, ['ffmpeg', 'ffprobe', 'libx264', 'aac']);
});
test('benchmark: synthetic mp4 with validated duration/codecs', async t => {
  const diag = collectDiagnostics(os.tmpdir());
  if (!evaluatePrerequisites(diag).readyForSyntheticBenchmark) return t.skip('ffmpeg unavailable');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-bench-'));
  try {
    const result = await benchmark({ ffmpeg: diag.media.ffmpeg, ffprobe: diag.media.ffprobe, outputDir: dir, durationSeconds: 3, label: 'test' });
    assert.equal(result.passed, true);
    assert.equal(result.codecs.video, 'h264');
    assert.equal(result.codecs.audio, 'aac');
    assert.ok(result.fileBytes > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
