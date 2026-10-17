import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('FI-04-04 Windows media bootstrap is opt-in and pinned to a reviewed ZIP hash',async()=>{
 const ps=await readFile(new URL('./FI0404-Install-FFmpeg-CI.ps1',import.meta.url),'utf8');
 assert.match(ps,/FI0404_HOSTED_CI_ONLY/);
 assert.match(ps,/FI0404_WINDOWS_ONLY/);
 assert.match(ps,/ffmpeg-8\.1\.2-essentials_build\.zip/);
 assert.match(ps,/db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec/);
 assert.match(ps,/Get-FileHash.+-Algorithm SHA256/);
 assert.match(ps,/FI0404_FFMPEG_SHA256_MISMATCH/);
 assert.ok(ps.indexOf('FI0404_FFMPEG_SHA256_MISMATCH')<ps.indexOf('Expand-Archive'),'No extraction before checksum verification');
 assert.match(ps,/FI0404_FFMPEG_EXECUTABLE_VERSION_MISMATCH/);
 assert.match(ps,/FI0404_FFPROBE_EXECUTABLE_VERSION_MISMATCH/);
 assert.match(ps,/GITHUB_PATH/);
 assert.doesNotMatch(ps,/(?:choco install|winget install|ffmpeg-release-essentials|latest-win64)/i);
});
