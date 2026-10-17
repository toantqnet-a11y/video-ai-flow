import test from 'node:test';
import assert from 'node:assert/strict';
import {WaveformR306,decodeWavPcm,decodeMp3,waveformPeaks} from '../src/voice-waveform-r306.mjs';
import {spawnSync} from 'node:child_process';
import {waveformSvgPath} from '../../../apps/web/src/waveform-model-r306.mjs';
function wav({samples=8000,amplitude=14000,frequency=120}={}){
 const pcm=Buffer.alloc(samples*2);
 for(let i=0;i<samples;i++)pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*i*frequency/8000)*amplitude),i*2);
 const out=Buffer.alloc(44);out.write('RIFF');out.writeUInt32LE(36+pcm.length,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(8000,24);out.writeUInt32LE(16000,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(pcm.length,40);
 return Buffer.concat([out,pcm]);
}
test('R3-06 PCM waveform is computed from selected audio and normalized, not synthetic',async()=>{
 const first=wav(),other=wav({amplitude:4000});let bytes=first,reads=0;
 const service=new WaveformR306({readVoice:async()=>{reads++;return {bytes,format:'wav'};},maxEntries:2});
 const a=await service.get('s1',{bins:'80'});
 assert.equal(a.sceneId,'s1');assert.equal(a.durationMs,1000);assert.equal(a.bins,80);
 assert.equal(a.peaks.length,80);assert.ok(a.peaks.every(p=>p>=0&&p<=1));assert.ok(a.peaks.some(p=>p>.3));
 assert.equal(a.cached,false);
 const b=await service.get('s1',{bins:80});assert.equal(b.cached,true);assert.deepEqual(a.peaks,b.peaks);
 bytes=other;const c=await service.get('s1',{bins:80});assert.equal(c.cached,false);
 assert.notEqual(c.sha256,a.sha256);assert.ok(Math.max(...c.peaks)<Math.max(...a.peaks));
 assert.equal(reads,3); // each request re-verifies the currently selected voice
});
test('R3-06 reject invalid waveform query and WAV format without external process',async()=>{
 const service=new WaveformR306({readVoice:async()=>({bytes:wav(),format:'wav'})});
 for(const bins of [0,23,513,'1e3','null',{},-1])await assert.rejects(service.get('s',{bins}),e=>e.code==='INVALID_WAVEFORM_QUERY');
 assert.throws(()=>decodeWavPcm(Buffer.from('broken')),e=>e.code==='WAVEFORM_INVALID_WAV');
 const damaged=wav();damaged.writeUInt32LE(0xffffffff,40);
 assert.throws(()=>decodeWavPcm(damaged),e=>e.code==='WAVEFORM_INVALID_WAV');
 const peaks=waveformPeaks(decodeWavPcm(wav({amplitude:0})),24);
 assert.deepEqual(new Set(peaks.peaks),new Set([0]));
 assert.ok(waveformSvgPath(peaks.peaks).startsWith('M'));
 assert.equal(waveformSvgPath([2]),'');
});
test('R3-06 bounded LRU caches waveform by audio SHA rather than sceneId',async()=>{
 const bytes=wav();let n=0;const service=new WaveformR306({readVoice:async()=>{n++;return {bytes,format:'wav'};},maxEntries:2});
 await service.get('x',{bins:32});assert.equal((await service.get('y',{bins:32})).cached,true);
 await service.get('x',{bins:48});await service.get('x',{bins:64});
 assert.equal(service.cache.size,2);assert.equal((await service.get('x',{bins:32})).cached,false);assert.equal(n,5);
});

test('R3-06 real compressed MP3 is decoded locally to waveform without provider', {skip:spawnSync('ffmpeg',['-version']).status!==0},async()=>{
 const source=wav({samples:4000});
 const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','wav','-i','pipe:0','-f','mp3','pipe:1'],{input:source,maxBuffer:5_000_000});
 assert.equal(encoded.status,0);assert.ok(encoded.stdout.length>50);
 const pcm=await decodeMp3(encoded.stdout);
 const waveform=waveformPeaks(pcm,40);
 assert.ok(waveform.durationMs>=450&&waveform.durationMs<1000);
 assert.ok(waveform.peaks.some(x=>x>.3));
});
