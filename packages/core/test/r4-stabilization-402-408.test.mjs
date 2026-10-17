import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository} from '../src/index.mjs';
import {createVerifiedBackup,verifyBackup,restoreBackupToEmpty,inspectStorage,quarantineStaleTemp} from '../src/maintenance-r402-r403.mjs';
import {previewSubtitleEdits,SubtitleDraftsR405,validateMusicMixSettings,mixMusicIntoMp4,inspectVisualConsistency} from '../src/r4-editor-music-style.mjs';
import {summarizeJobsR404,filterPublicJobs} from '../../../apps/web/src/job-insights-r404.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const wav=()=>{const samples=8000,b=Buffer.alloc(44+samples,128);b.write('RIFF',0);b.writeUInt32LE(36+samples,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(samples,40);return b;};
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'r4accept-'));const dataRoot=join(dir,'data');await mkdir(dataRoot);
 const dbPath=join(dir,'studio.sqlite'),db=openProjectDb(dbPath),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Backup regression'}),video=repo.createVideo(channel.id,{title:'Video tiếng Việt'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Xin chào Việt Nam',durationMs:1400,mediaType:'image_motion'}]});
 const manifest=new AssetManifest({db,repository:repo,dataRoot});
 return {dir,dataRoot,dbPath,db,repo,video,scenes,manifest,async close(){db.close();await rm(dir,{recursive:true,force:true})}};
}
const cliAvailable=name=>spawnSync(name,['-version'],{stdio:'ignore'}).status===0;
test('R4-02 hot WAL snapshot preserves SQLite and committed media, excludes vault and detects tampering',async()=>{
 const f=await fixture();try{
  await f.manifest.importBytes({sceneId:f.scenes[0].id,kind:'image',source:'manual_import',bytes:png,extension:'.png'});
  await writeFile(join(f.dataRoot,'private-credential.key'),'NEVER_BACKUP');
  const folder=join(f.dir,'backup');const summary=await createVerifiedBackup({dbPath:f.dbPath,dataRoot:f.dataRoot,backupDir:folder});
  assert.equal(summary.mediaCount,1);assert.equal((await verifyBackup(folder)).mediaCount,1);
  await assert.rejects(readFile(join(folder,'media','private-credential.key')),{code:'ENOENT'});
  await assert.rejects(createVerifiedBackup({dbPath:f.dbPath,dataRoot:f.dataRoot,backupDir:folder}),{code:'R4_BACKUP_EXISTS'});
  const manifest=JSON.parse(await readFile(join(folder,'manifest.json')));manifest.media[0].sha256='f'.repeat(64);
  await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(verifyBackup(folder),{code:'R4_BACKUP_MEDIA_TAMPERED'});
 }finally{await f.close()}
});
test('R4-02 restore dry-run never writes; restore to empty relocates verified asset revisions and rejects overwrite',async()=>{
 const f=await fixture();try{
  const img=await f.manifest.importBytes({sceneId:f.scenes[0].id,kind:'image',source:'manual_import',bytes:png,extension:'.png'});
  const folder=join(f.dir,'backup');await createVerifiedBackup({dbPath:f.dbPath,dataRoot:f.dataRoot,backupDir:folder});
  const targetDb=join(f.dir,'restored','db.sqlite'),targetData=join(f.dir,'new-media');
  const dry=await restoreBackupToEmpty({backupDir:folder,targetDbPath:targetDb,targetDataRoot:targetData});assert.equal(dry.dryRun,true);
  await assert.rejects(stat(targetDb),{code:'ENOENT'});
  const result=await restoreBackupToEmpty({backupDir:folder,targetDbPath:targetDb,targetDataRoot:targetData,confirm:true});
  assert.equal(result.restored,true);const db=openProjectDb(targetDb);try{
   const rows=db.prepare('SELECT * FROM asset_revisions WHERE state=?').all('committed');assert.equal(rows.length,1);
   assert.equal(rows[0].sha256,img.checksum);assert.ok(rows[0].file_path.startsWith('assets/'));
   assert.equal(hash(await readFile(join(targetData,rows[0].file_path))),img.checksum);
  }finally{db.close()}
  await assert.rejects(restoreBackupToEmpty({backupDir:folder,targetDbPath:targetDb,targetDataRoot:targetData,confirm:true}),{code:'R4_RESTORE_DESTINATION_EXISTS'});
 }finally{await f.close()}
});
test('R4-03 review-only inventory never deletes unreferenced user files; quarantine only aged temp',async()=>{
 const f=await fixture();try{
  await f.manifest.importBytes({sceneId:f.scenes[0].id,kind:'image',source:'manual_import',bytes:png,extension:'.png'});
  const loose=join(f.dataRoot,'keep.mp4'),temp=join(f.dataRoot,'interrupted.partial');
  await writeFile(loose,'user-file');await writeFile(temp,'unfinished');
  const past=new Date(Date.now()-172800000);await utimes(temp,past,past);
  const plan=await inspectStorage({db:f.db,dataRoot:f.dataRoot});assert.equal(plan.candidatesBytes,10);
  assert.equal(plan.files.find(i=>i.path==='keep.mp4').quarantineEligible,false);
  await assert.rejects(quarantineStaleTemp({db:f.db,dataRoot:f.dataRoot,quarantineDir:join(f.dir,'quarantine'),expectedDigest:'bad'}),{code:'R4_STORAGE_PLAN_CHANGED'});
  const result=await quarantineStaleTemp({db:f.db,dataRoot:f.dataRoot,quarantineDir:join(f.dir,'quarantine'),expectedDigest:plan.digest});
  assert.equal(result.moved,1);assert.equal((await readFile(loose,'utf8')),'user-file');assert.equal((await readFile(join(f.dir,'quarantine','interrupted.partial'),'utf8')),'unfinished');
 }finally{await f.close()}
});
test('R4-04 filtered dashboard uses only sanitized DTO, no secret-bearing payload',()=>{
 const jobs=[{id:'one',kind:'asset:voice',status:'failed'},{id:'two',kind:'asset:image',status:'running'},
  {id:'three',kind:'render:mp4',status:'pending',availableAt:0}];
 assert.deepEqual(summarizeJobsR404(jobs).find(x=>x.kind==='asset').failed,1);
 assert.equal(filterPublicJobs(jobs,{kind:'asset',search:'voice'}).length,1);
});
test('R4-05 persisted subtitle draft is optimistic and does not change approved composition',async()=>{
 if(!cliAvailable('ffprobe'))return;
 const f=await fixture();try{
  const scene=f.scenes[0],source=wav(),jobId='v-'+scene.id,inputHash=hash('voice-input');
  await f.manifest.importBytes({sceneId:scene.id,kind:'voice',source:'mock-tts',bytes:source,extension:'.wav',metadata:{queueJobId:jobId,inputHash,textSha256:hash(scene.text),providerId:'piper'}});
  f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)').run(scene.id,jobId,inputHash,hash(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
  const img=await f.manifest.importBytes({sceneId:scene.id,kind:'image',source:'manual_import',bytes:png,extension:'.png'});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,img.id,Date.now());
  const comps=new CompositionRepository({repo:f.repo,manifest:f.manifest});const timing=new TimedCompositionRepository({compositions:comps,manifest:f.manifest});
  const doc=await timing.preview(f.video.id);assert.equal(doc.readiness.ready,true);
  const overrides=[{sceneId:scene.id,cues:[{text:'Xin chào!',startFrame:0,endFrame:15},{text:'Việt Nam',startFrame:15,endFrame:29}]}];
  const preview=previewSubtitleEdits(doc,overrides);assert.match(preview.srt,/Việt Nam/);
  const service=new SubtitleDraftsR405(f.db);const before=service.get(f.video.id);assert.equal(before.revision,0);
  const save=service.save(f.video.id,{document:doc,overrides,expectedRevision:0});assert.equal(save.revision,1);
  assert.equal((await timing.preview(f.video.id)).digest,doc.digest,'draft cannot mutate approved timed composition');
  assert.throws(()=>service.save(f.video.id,{document:doc,overrides,expectedRevision:0}),{code:'R4_SUBTITLE_VERSION_CONFLICT'});
  assert.throws(()=>previewSubtitleEdits(doc,[{sceneId:scene.id,cues:[{text:'bad',startFrame:30,endFrame:45}]}]),{code:'R4_SUBTITLE_INVALID'});
 }finally{await f.close()}
});
test('R4-06 reject unsafe mixing settings and test real local soundtrack mux',async()=>{
 assert.throws(()=>validateMusicMixSettings({volume:1,fadeInSeconds:0,fadeOutSeconds:0,loop:true}),{code:'R4_MUSIC_SETTINGS_INVALID'});
 if(!cliAvailable('ffmpeg')||!cliAvailable('ffprobe'))return;
 const f=await fixture();try{
  const source=join(f.dir,'original.mp4'),out=join(f.dir,'mixed.mp4');
  const cmd=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=black:s=320x240:r=30:d=1','-f','lavfi','-i','sine=frequency=350:duration=1','-c:v','libx264','-threads','1','-c:a','aac','-t','1','-pix_fmt','yuv420p',source],{timeout:20000});assert.equal(cmd.status,0,cmd.stderr?.toString());
  const music=join(f.dataRoot,'music.wav');await writeFile(music,wav());
  const result=await mixMusicIntoMp4({sourceMp4:source,musicPin:{relativePath:'music.wav',sha256:hash(await readFile(music)),bytes:(await stat(music)).size},dataRoot:f.dataRoot,targetMp4:out,seconds:1,settings:{volume:0.15,fadeInSeconds:0.1,fadeOutSeconds:0.1,loop:true}});
  assert.equal(result.metadata.videoCodec,'h264');assert.equal(result.metadata.audioCodec,'aac');assert.ok((await stat(out)).size>100);
 }finally{await f.close()}
});
test('R4-07 heuristic style/character audit flags missing token but does not fabricate content',()=>{
 const report=inspectVisualConsistency({scenes:[{id:'s1',visualPrompt:'Vintage watercolor with hero-ken',visualAssetId:'abc'},{id:'s2',visualPrompt:'plain',visualAssetId:null}],styleProfile:{styleToken:'watercolor',characterTokens:['hero-ken']}});
 assert.equal(report.ready,false);assert.equal(report.warnings.length,2);
 assert.throws(()=>inspectVisualConsistency({scenes:[],styleProfile:{styleToken:'../secret',characterTokens:[]}}),{code:'R4_STYLE_PROFILE_INVALID'});
});
test('R4-02 includes published render assets, excludes unfinished tmp and denies manifest traversal',async()=>{
 const f=await fixture();try{
  const finalDir=join(f.dataRoot,'renders',f.video.id);await mkdir(finalDir,{recursive:true});
  await writeFile(join(finalDir,'finished.mp4'),'render-media');
  await writeFile(join(finalDir,'unfinished.tmp'),'transient-sensitive');
  const b=join(f.dir,'full-backup');await createVerifiedBackup({dbPath:f.dbPath,dataRoot:f.dataRoot,backupDir:b});
  const proof=await verifyBackup(b);assert.ok(proof.media.some(x=>x.path===`renders/${f.video.id}/finished.mp4`));
  assert.ok(!proof.media.some(x=>x.path.endsWith('.tmp')));
  const manifest=JSON.parse(await readFile(join(b,'manifest.json')));
  manifest.media[0].path='../outside';await writeFile(join(b,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(verifyBackup(b),{code:'R4_UNSAFE_PATH'});
 }finally{await f.close()}
});
test('R4-08 release gate audit never labels unverified HyperFrames and Windows as ready',()=>{
 const script=new URL('../../../tools/r408-release-audit.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:12000});assert.equal(result.status,0);
 const report=JSON.parse(result.stdout);assert.equal(report.status,'NOT_READY');
 assert.equal(report.gates.real35MinMp4.status,'BLOCKED');assert.equal(report.gates.realHyperframesMp4.status,'BLOCKED');
});
