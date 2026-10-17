/** R3-06 — derive UI waveform from the VERIFIED selected voice, never guessed
 * samples or remote media. LRU is bounded, keyed by SHA256 + bin count;
 * swapping the selected voice naturally invalidates the cached peaks.
 */
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {DomainError} from '../../../packages/core/src/domain.mjs';
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const SAMPLE_RATE=8000, MAX_DECODED=16_000_000;

// FFmpeg is only used for compressed audio; constrain decode length, rate,
// resource size and wall time, and never pass untrusted shell arguments.
export function decodeMp3(bytes,{spawnImpl=spawn}={}){
 return new Promise((resolve,reject)=>{
  const child=spawnImpl('ffmpeg',['-v','error','-nostdin','-i','pipe:0','-t','130','-ac','1',
   '-ar',String(SAMPLE_RATE),'-f','s16le','pipe:1'],{stdio:['pipe','pipe','pipe']});
  const chunks=[];let size=0,done=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(failValue('VOICE_WAVEFORM_TIMEOUT'))},20000);
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value)};
  const failValue=code=>new DomainError(code,422);
  child.on('error',()=>finish(failValue('WAVEFORM_DECODER_UNAVAILABLE')));
  child.stdout.on('data',data=>{size+=data.length;if(size>MAX_DECODED){child.kill('SIGKILL');finish(failValue('VOICE_WAVEFORM_TOO_LONG'));return;}chunks.push(data)});
  child.stderr.resume(); // never expose external tool output as an API error
  child.on('close',code=>code===0&&size>0&&size%2===0?finish(null,{pcm:Buffer.concat(chunks),sampleRate:SAMPLE_RATE,channels:1}):finish(failValue('VOICE_WAVEFORM_DECODE_FAILED')));
  child.stdin.on('error',()=>{});child.stdin.end(bytes);
 });
}
export function decodeWavPcm(bytes){
 if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')
  fail('WAVEFORM_INVALID_WAV',422);
 let offset=12,format=null,data=null;
 while(offset+8<=bytes.length){
  const type=bytes.toString('ascii',offset,offset+4),len=bytes.readUInt32LE(offset+4);
  const start=offset+8,end=start+len;
  if(end>bytes.length)fail('WAVEFORM_INVALID_WAV',422);
  if(type==='fmt '){
   if(len<16)fail('WAVEFORM_INVALID_WAV',422);
   format={codec:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),sampleRate:bytes.readUInt32LE(start+4),bits:bytes.readUInt16LE(start+14)};
  }
  if(type==='data')data=bytes.subarray(start,end);
  offset=end+(len%2);
 }
 if(!format||!data||format.codec!==1||format.bits!==16||![1,2].includes(format.channels)||
   format.sampleRate<4000||format.sampleRate>192000||data.length%(2*format.channels)!==0||!data.length)
  fail('WAVEFORM_UNSUPPORTED_WAV',422);
 return {pcm:data,sampleRate:format.sampleRate,channels:format.channels};
}
export function waveformPeaks({pcm,sampleRate,channels},bins){
 const count=pcm.length/(channels*2);
 if(!Number.isInteger(count)||count<1||count>sampleRate*130)fail('WAVEFORM_AUDIO_LENGTH_INVALID',422);
 const peaks=new Array(bins).fill(0);
 for(let frame=0;frame<count;frame++){
  const bin=Math.min(bins-1,Math.floor(frame*bins/count));
  for(let channel=0;channel<channels;channel++){
   const amp=Math.abs(pcm.readInt16LE((frame*channels+channel)*2))/32768;
   if(amp>peaks[bin])peaks[bin]=amp;
  }
 }
 return {peaks:peaks.map(x=>Math.round(x*1000)/1000),durationMs:Math.round(count/sampleRate*1000),sampleRate};
}
export class WaveformR306{
 constructor({readVoice,decodeCompressed=decodeMp3,maxEntries=64}){
  this.readVoice=readVoice;this.decodeCompressed=decodeCompressed;this.maxEntries=maxEntries;this.cache=new Map();
 }
 async get(sceneId,query={}){
  if(!query||Object.keys(query).some(k=>k!=='bins')||
    (query.bins!==undefined&&!/^(?:[1-9]\d{1,2})$/.test(String(query.bins))))fail('INVALID_WAVEFORM_QUERY');
  const bins=query.bins===undefined?160:Number(query.bins);
  if(!Number.isInteger(bins)||bins<24||bins>512)fail('INVALID_WAVEFORM_QUERY');
  // voice service rechecks both SHA-256 of file and latest selection after IO.
  const {bytes,format}=await this.readVoice(sceneId);
  const sha256=hash(bytes),key=`${sha256}:${bins}`;
  if(this.cache.has(key)){
   const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);
   return {...value,sceneId,cached:true};
  }
  const decoded=format==='wav'?decodeWavPcm(bytes):format==='mp3'?await this.decodeCompressed(bytes):fail('WAVEFORM_UNSUPPORTED_AUDIO',422);
  const analysis=waveformPeaks(decoded,bins);
  const value={sha256,...analysis,bins,cached:false};
  this.cache.set(key,value);
  if(this.cache.size>this.maxEntries)this.cache.delete(this.cache.keys().next().value);
  return {...value,sceneId};
 }
}
