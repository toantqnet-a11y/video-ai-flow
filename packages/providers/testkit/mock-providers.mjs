/**
 * R0-14: deterministic OFFLINE test doubles for all four provider capabilities.
 * Purpose: exercise real queue, repository, and asset-promotion boundaries in CI
 * without GPU, network, credentials, or usage charges.
 *
 * IMPORTANT: testkit only. Production setupProviders() never imports this file.
 * Generated WAV/PNG/MP4 are test fixtures, NOT neural voice / generative media.
 */
import {createHash} from 'node:crypto';
import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const imageFixture=fileURLToPath(new URL('../../../spikes/SP-03/fixtures/sp03-demo.png',import.meta.url));
const videoFixture=fileURLToPath(new URL('./fixtures/mock-video.mp4',import.meta.url));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const abortError=()=>Object.assign(new Error('MOCK_ABORTED'),{code:'MOCK_ABORTED',retryable:false});
const fail=(code,retryable)=>Object.assign(new Error(code),{code,retryable});

/** PCM WAV is generated locally so mock voice tests require no TTS installation. */
function wavTone({text,voice}) {
  const sampleRate=8000, durationMs=600, samples=sampleRate*durationMs/1000;
  const bytes=Buffer.alloc(44+samples*2);
  const frequency=300+(parseInt(sha({text,voice}).slice(0,4),16)%200);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
  bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++) {
    const envelope=Math.min(1,i/200,(samples-i)/200);
    bytes.writeInt16LE(Math.round(9000*envelope*Math.sin(2*Math.PI*frequency*i/sampleRate)),44+i*2);
  }
  return bytes;
}

/**
 * Install safe, local, deterministic substitutes into a fresh ProviderRegistry.
 * `failFirst` simulates a retryable outage; `alwaysFail` exercises exhausted
 * retries without contacting a real provider. Counters are intentionally kept
 * in memory and returned only to the test harness.
 */
export function registerMockProviders(registry,{dataRoot,failFirst={},alwaysFail={},latencyMs=0}={}) {
  if(!dataRoot||typeof dataRoot!=='string')throw new Error('MOCK_DATA_ROOT_REQUIRED');
  const calls={llm:0,tts:0,image:0,video:0};
  const execute=kind=>async(input={}, {signal}={})=>{
    calls[kind]++;
    if(signal?.aborted)throw abortError();
    if(latencyMs>0)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},latencyMs);
      const onAbort=()=>{clearTimeout(timer);reject(abortError());};
      signal?.addEventListener('abort',onAbort,{once:true});
    });
    if(signal?.aborted)throw abortError();
    if(alwaysFail[kind]||calls[kind]<=(failFirst[kind]??0))throw fail('MOCK_TRANSIENT_FAILURE',!alwaysFail[kind]);
    const prompt=kind==='llm'?input.prompt:kind==='tts'?input.text:kind==='image'?input.prompt:input.request?.prompt;
    if(typeof prompt!=='string'||!prompt.trim())throw fail('MOCK_INVALID_INPUT',false);
    if(kind==='llm')return {text:`[MOCK - không phải AI thật] Nội dung kiểm thử ${sha({prompt,style:input.style}).slice(0,12)}.`,metadata:{mock:true}};
    const digest=sha({kind,prompt,voice:input.voice,style:input.style,seed:input.seed,request:input.request});
    const ext=kind==='tts'?'.wav':kind==='image'?'.png':'.mp4';
    const path=join(dataRoot,'mock-assets',kind,`${digest}${ext}`);
    await mkdir(dirname(path),{recursive:true});
    if(kind==='tts')await writeFile(path,wavTone({text:prompt,voice:input.voice}));
    else await copyFile(kind==='image'?imageFixture:videoFixture,path);
    return {path,metadata:{mock:true,kind,sha256:digest}};
  };
  for(const [kind,id] of Object.entries({llm:'mock-llm',tts:'mock-tts',image:'mock-image',video:'mock-video'}))
    registry.register({id,kind,location:'local',costTier:'local',invoke:execute(kind)});
  return {calls,ids:{llm:'mock-llm',tts:'mock-tts',image:'mock-image',video:'mock-video'}};
}
