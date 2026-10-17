import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { collectDiagnostics, evaluatePrerequisites } from './diagnostics.js';
import { benchmark } from './benchmark.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, 'reports');
const outDir = path.join(root, 'output');
fs.mkdirSync(reportDir, { recursive: true });
function saveJson(name, body) { const dest = path.join(reportDir, name); fs.writeFileSync(dest, JSON.stringify(body, null, 2) + '\n'); console.log(`Report: ${dest}`); }
function help() { console.log('Usage: node src/cli.js diagnose | benchmark --smoke | benchmark --full | serve'); }
const command = process.argv[2];
if (command === 'diagnose') {
  const report = collectDiagnostics(outDir);
  report.prerequisites = evaluatePrerequisites(report);
  saveJson('diagnostics.json', report);
  console.log(JSON.stringify({ platform: report.actualPlatform.platform, ffmpeg: report.media.version, prerequisites: report.prerequisites, verdict: report.verdict }, null, 2));
} else if (command === 'benchmark') {
  const full = process.argv.includes('--full');
  const smoke = process.argv.includes('--smoke');
  if (!full && !smoke) { help(); process.exitCode = 2; }
  else {
    const diagnostics = collectDiagnostics(outDir);
    const prereq = evaluatePrerequisites(diagnostics);
    if (!prereq.readyForSyntheticBenchmark) throw Error(`Missing tools: ${prereq.missing.join(', ')}`);
    saveJson('diagnostics.json', { ...diagnostics, prerequisites: prereq });
    const checks = full ? [{ label: 'fixture-5min', durationSeconds: 300 }, { label: 'fixture-35min', durationSeconds: 2100 }] : [{ label: 'fixture-smoke', durationSeconds: 15 }];
    const results = [];
    for (const c of checks) {
      console.log(`Rendering synthetic ${c.durationSeconds}s...`);
      const r = await benchmark({ ...c, ffmpeg: diagnostics.media.ffmpeg, ffprobe: diagnostics.media.ffprobe, outputDir: outDir });
      results.push(r);
      saveJson('benchmark.json', { schemaVersion: 1, platform: diagnostics.actualPlatform.platform, executedAt: new Date().toISOString(), results });
      console.log(`ffprobe ${r.passed ? 'PASS' : 'FAIL'}: ${r.actualDurationSeconds}s h264/aac, wall ${r.elapsedSeconds}s`);
      if (!r.passed) process.exitCode = 1;
    }
  }
} else if (command === 'serve') {
  const host = '127.0.0.1';
  const port = process.env.PORT === undefined ? 4317 : Number(process.env.PORT);
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/api/v1/system/diagnostics') {
      res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ data: collectDiagnostics(outDir) }));
  });
  server.listen(port, host, () => console.log(`SP-01 diagnostic proof endpoint: http://${host}:${server.address().port}/api/v1/system/diagnostics (NOT production API)`));
} else { help(); process.exitCode = 2; }
