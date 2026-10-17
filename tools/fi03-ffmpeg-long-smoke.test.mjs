import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('FI-03 opt-in long duration control cannot claim production HyperFrames acceptance',async()=>{
 const script=await readFile(new URL('./fi03-ffmpeg-long-smoke.mjs',import.meta.url),'utf8');
 assert.match(script,/FFMPEG_ONLY_SYNTHETIC_360P_CONTROL/);
 assert.match(script,/releaseGateSatisfied:false/);
 assert.match(script,/expected=63000/);
 assert.match(script,/2100/);
});
