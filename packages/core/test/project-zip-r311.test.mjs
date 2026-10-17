/** R3-11 ZIP64 archive: portable paths, UTF-8, integrity, no sensitive metadata. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compositionDigest,validateTimedComposition} from '../src/index.mjs';
import {projectZipEntries,writeZip64} from '../src/project-zip-r311.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function doc(id,audio,picture){
 const text='Xin chào Việt Nam! 🇻🇳';
 const scene={id:'scene-alpha',index:0,sceneRowVersion:1,text,textSha256:sha(text),mediaType:'image_motion',startFrame:0,endFrame:30,
  durationMs:1000,durationFrames:30,durationBasis:'voice_measured',
  voice:{asset:{id:'voice-1',kind:'voice',sha256:sha(audio),bytes:audio.length,relativePath:'media/voice.wav'},measuredDurationMs:780},
  visual:{kind:'image',motion:'none',asset:{id:'image-1',kind:'image',sha256:sha(picture),bytes:picture.length,relativePath:'media/image.png'}},
  timing:{mode:'voice_measured',audioMs:780,audioFrames:24,paddingFrames:6,tailPaddingMs:220},
  captions:{mode:'measured_scene',source:'scene_text',cues:[{text,startFrame:0,endFrame:24}]}};
 const payload={schemaVersion:2,videoId:id,source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:1,scriptSha256:sha('script')},profile:{width:1280,height:720,fps:30,aspectRatio:'16:9',codec:'h264'},scenes:[scene],totalFrames:30,readiness:{ready:true,blockers:[]}};
 const full={...payload,digest:compositionDigest(payload)};validateTimedComposition(full);return full;
}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'project-r311-'));await mkdir(join(root,'media'));
 const audio=Buffer.from('voice-bytes-test'),picture=Buffer.from('image-bytes-test');
 await writeFile(join(root,'media/voice.wav'),audio);await writeFile(join(root,'media/image.png'),picture);
 return {root,audio,picture,composition:doc('vid-one',audio,picture),close:()=>rm(root,{recursive:true,force:true})};
}
// Quick reader for STORE entry payloads and CRC; Python zipfile is separately used in acceptance.
function extractEntries(bytes){
 const out=new Map();let p=0;
 while(p<bytes.length&&bytes.readUInt32LE(p)===0x04034b50){
  const nameLen=bytes.readUInt16LE(p+26),extraLen=bytes.readUInt16LE(p+28),name=bytes.subarray(p+30,p+30+nameLen).toString();
  const offset=p+30+nameLen+extraLen;
  const descriptor=Buffer.from([0x50,0x4b,0x07,0x08]);const trailer=bytes.indexOf(descriptor,offset);
  assert.ok(trailer>offset,'missing ZIP64 descriptor');
  const content=bytes.subarray(offset,trailer),size=bytes.readBigUInt64LE(trailer+8);
  assert.equal(BigInt(content.length),size);out.set(name,content);p=trailer+24;
 }
 assert.equal(bytes.readUInt32LE(p),0x02014b50,'missing central directory');
 assert.ok(bytes.includes(Buffer.from([0x50,0x4b,0x06,0x06])),'ZIP64 EOCD required');
 assert.ok(bytes.includes(Buffer.from([0x50,0x4b,0x06,0x07])),'ZIP64 locator required');
 return out;
}
test('R3-11 approved Vietnamese scene exports self-contained ZIP64, checksums, SRT, script and no local paths',async()=>{
 const f=await fixture();try{
  const {entries,manifest}=await projectZipEntries({composition:f.composition,revision:3,dataRoot:f.root,videoTitle:'Video kiểm thử'});
  assert.equal(entries.length,7);assert.equal(manifest.entries.length,6); // 2 assets + 4 text files
  assert.ok(manifest.entries.every(e=>!e.name.includes('media/')));
  const zip=join(f.root,'bundle.zip');await writeZip64(entries,zip);
  const raw=await readFile(zip),unpacked=extractEntries(raw);
  for(const x of entries)assert.ok(unpacked.has(x.name));
  assert.equal(unpacked.get('assets/scene-0001/voice.wav').toString(),'voice-bytes-test');
  assert.match(unpacked.get('script.txt').toString(),/Xin chào Việt Nam!/);
  assert.match(unpacked.get('subtitles.srt').toString(),/00:00:00,800/);
  const timeline=JSON.parse(unpacked.get('timeline.json'));
  assert.equal(timeline.scenes[0].voice.path,'assets/scene-0001/voice.wav');
  assert.equal(timeline.scenes[0].text,f.composition.scenes[0].text);
  const jsonManifest=JSON.parse(unpacked.get('manifest.json'));
  for(const e of jsonManifest.entries)assert.equal(sha(unpacked.get(e.name)),e.sha256);
  assert.ok(!raw.includes(Buffer.from(f.root)));assert.ok(!raw.includes(Buffer.from('credentialId')));
  assert.ok((await stat(zip)).size>f.audio.length+f.picture.length);
 }finally{await f.close()}
});
test('R3-11 altered asset fails before output, does not leak changed voice',async()=>{
 const f=await fixture();try{
  await writeFile(join(f.root,'media/voice.wav'),'changed');
  await assert.rejects(projectZipEntries({composition:f.composition,revision:1,dataRoot:f.root}),{code:'RENDER_ASSET_CHANGED'});
 }finally{await f.close()}
});
test('R3-11 changed source after preflight aborts archive output, caller can clean staging',async()=>{
 const f=await fixture();try{
  const prepared=await projectZipEntries({composition:f.composition,revision:1,dataRoot:f.root});
  await writeFile(join(f.root,'media/image.png'),'different-asset-bytes');
  await assert.rejects(writeZip64(prepared.entries,join(f.root,'bad.zip')),{code:'PROJECT_ZIP_SOURCE_CHANGED'});
 }finally{await f.close()}
});
test('R3-11 rejects malicious archive names, duplicate names, unreadable pins and unready composition',async()=>{
 const f=await fixture();try{
  await assert.rejects(writeZip64([{name:'../escape',data:Buffer.from('hi')}],join(f.root,'x.zip')),{code:'PROJECT_ZIP_UNSAFE_NAME'});
  await assert.rejects(writeZip64([{name:'foo.txt',data:Buffer.from('a')},{name:'foo.txt',data:Buffer.from('b')}],join(f.root,'x.zip')),{code:'PROJECT_ZIP_UNSAFE_NAME'});
  await assert.rejects(projectZipEntries({composition:f.composition,revision:0,dataRoot:f.root}),{code:'PROJECT_ZIP_UNAPPROVED'});
  const tampered=structuredClone(f.composition);tampered.scenes[0].voice.asset.relativePath='../secret.env';
  await assert.rejects(projectZipEntries({composition:tampered,revision:1,dataRoot:f.root}));
 }finally{await f.close()}
});
