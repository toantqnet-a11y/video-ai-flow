/** R0-07: REAL SQLite persistence + security and paid/quota fail-closed rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openProjectDb,ProviderAccountRepository,migrations,validateProviderEndpoint} from '../src/index.mjs';

function fixture(){const db=openProjectDb();return {db,reg:new ProviderAccountRepository(db)};}
function make(reg,providerId='ollama',name='Local'){const a=reg.createAccount({providerId,name});return {a,m:reg.createModel(a.id,{modelId:'alpha:7b',kind:'llm'})};}

 test('R0-07 provider metadata and models persisted with no stored API key',()=>{
  const {db,reg}=fixture();try{
    assert.equal(reg.templates().length>=7,true);
    const {a,m}=make(reg);assert.equal(m.costTier,'local');assert.equal(m.quota.source,'unknown');
    assert.equal(reg.listAccounts()[0].name,'Local');assert.equal(reg.listModels(a.id)[0].id,m.id);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,migrations.length);
    assert(!JSON.stringify(reg.listModels()).includes('apiKey'));
  }finally{db.close()}
});

test('R0-07 refuses provider secrets and unexpected fields everywhere',()=>{
 const {db,reg}=fixture();try{
   for(const body of [{providerId:'ollama',name:'X',apiKey:'DO_NOT_STORE'}, {providerId:'bad',name:'x'}, {providerId:'edge',name:''}, {providerId:'ollama',name:'X',credentialId:'bad ref'}])
     assert.throws(()=>reg.createAccount(body),/INVALID_/);
   const a=reg.createAccount({providerId:'ollama',name:'Local'});
   assert.throws(()=>reg.createModel(a.id,{modelId:'alpha',kind:'llm',apiKey:'secret'}),/INVALID_/);
   assert.throws(()=>reg.updateAccount(a.id,{rowVersion:1,apiKey:'key'}),/INVALID_/);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM provider_models').get().n,0);
 }finally{db.close()}
});

test('R0-07 models only support provider capability and fixed safe location/cost tier',()=>{
 const {db,reg}=fixture();try{
   const a=reg.createAccount({providerId:'seedance',name:'Video'});
   assert.throws(()=>reg.createModel(a.id,{modelId:'seedance-1',kind:'llm'}),/INVALID_PROVIDER_MODEL/);
   assert.throws(()=>reg.createModel(a.id,{modelId:'seedance-1',kind:'video',costTier:'free_unverified'}),/INVALID_PROVIDER_MODEL/);
   assert.equal(reg.createModel(a.id,{modelId:'seedance-1',kind:'video'}).costTier,'paid');
   const remote=reg.createAccount({providerId:'groq',name:'AI'});
   assert.throws(()=>reg.createModel(remote.id,{modelId:'m',kind:'llm',location:'local'}),/INVALID_PROVIDER_MODEL/);
   assert.throws(()=>reg.createModel(remote.id,{modelId:'m',kind:'image'}),/INVALID_PROVIDER_MODEL/);
 }finally{db.close()}
});

test('R0-07 account disabling/optimistic locking and model uniqueness',()=>{
 const {db,reg}=fixture();try{
   const {a,m}=make(reg);
   assert.throws(()=>reg.createModel(a.id,{modelId:'alpha:7b',kind:'llm'}),{code:'PROVIDER_MODEL_EXISTS',status:409});
   assert.throws(()=>reg.updateAccount(a.id,{rowVersion:0,name:'X'}),{code:'VERSION_CONFLICT'});
   const changed=reg.updateAccount(a.id,{rowVersion:1,status:'disabled'});assert.equal(changed.rowVersion,2);
   assert.equal(reg.planRoute({kind:'llm'}).candidates[0].reason,'DISABLED');
   const back=reg.updateAccount(a.id,{rowVersion:2,status:'active'});
   assert.equal(reg.updateModel(m.id,{rowVersion:m.rowVersion,status:'disabled'}).status,'disabled');
   assert.equal(back.name,'Local');
 }finally{db.close()}
});

test('R0-07 untrusted quota updates cannot claim provider_verified',()=>{
 const {db,reg}=fixture();try{
   const {m}=make(reg);
   assert.throws(()=>reg.setQuota(m.id,{rowVersion:1,source:'provider_verified',limit:10,used:0}),{code:'PROVIDER_QUOTA_VERIFICATION_REQUIRED'});
   assert.throws(()=>reg.setQuota(m.id,{rowVersion:1,source:'estimated',limit:10.5,used:0}),/INVALID_QUOTA/);
   const q=reg.setQuota(m.id,{rowVersion:1,source:'estimated',limit:10,used:3});
   assert.equal(q.quota.source,'estimated');assert.equal(q.quota.used,3);
   assert.equal(reg.planRoute({kind:'llm'}).selected.modelId,m.id);
   const blocked=reg.setQuota(m.id,{rowVersion:2,source:'estimated',limit:8,used:8});
   assert.equal(reg.planRoute({kind:'llm'}).candidates[0].reason,'QUOTA_EXHAUSTED');
   reg.setQuota(m.id,{rowVersion:3,source:'unknown'});
   assert.equal(reg.planRoute({kind:'llm'}).selected.modelId,m.id);
   assert.equal(blocked.quota.used,8);
 }finally{db.close()}
});

test('R0-07 usage recording is idempotent after queue replay',()=>{
 const {db,reg}=fixture();try{
   const {m}=make(reg);
   reg.setQuota(m.id,{rowVersion:1,source:'estimated',limit:10,used:0});
   reg.recordUsage(m.id,{requestId:'request-1234',units:2});
   reg.recordUsage(m.id,{requestId:'request-1234',units:2});
   assert.equal(reg.getModel(m.id).quota.used,2);
   assert.equal(db.prepare('SELECT count(*) n FROM provider_usage_events').get().n,1);
   assert.throws(()=>reg.recordUsage(m.id,{requestId:'request-1234',units:3}),{code:'USAGE_IDEMPOTENCY_CONFLICT'});
 }finally{db.close()}
});

test('R0-07 routing refuses remote without consent, key refs and paid without approval',()=>{
 const {db,reg}=fixture();try{
   const edge=reg.createAccount({providerId:'edge',name:'TTS'});
   reg.createModel(edge.id,{kind:'tts',modelId:'vi-VN-HoaiMyNeural'});
   assert.equal(reg.planRoute({kind:'tts'}).selected,null);
   assert.equal(reg.planRoute({kind:'tts',allowRemote:true}).selected.providerId,'edge');
   const video=reg.createAccount({providerId:'seedance',name:'Paid',credentialId:'seedance-key'});
   const m=reg.createModel(video.id,{kind:'video',modelId:'model'});
   assert.equal(reg.planRoute({kind:'video',allowRemote:true}).selected,null);
   assert.equal(reg.planRoute({kind:'video',allowRemote:true}).candidates[0].reason,'PAID_APPROVAL_REQUIRED');
   assert.equal(reg.planRoute({kind:'video',allowRemote:true,paidApproval:{accountId:video.id,modelId:m.id,approved:true,maxUsd:2}}).selected.modelId,m.id);
   assert.equal(reg.planRoute({kind:'video',allowRemote:true,paidApproval:{accountId:video.id,modelId:m.id,approved:false,maxUsd:2}}).selected,null);
   const remote=reg.createAccount({providerId:'groq',name:'No key'});
   reg.createModel(remote.id,{kind:'llm',modelId:'llama'});
   assert.equal(reg.planRoute({kind:'llm',allowRemote:true}).candidates[0].reason,'CREDENTIAL_REQUIRED');
 }finally{db.close()}
});

test('R0-07 remote endpoints must not be local or contain auth/query',()=>{
 assert.equal(validateProviderEndpoint('http://127.0.0.1:8000/tts','local'),'http://127.0.0.1:8000/tts');
 assert.equal(validateProviderEndpoint('https://api.example.com/v1','remote'),'https://api.example.com/v1');
 for(const url of ['http://169.254.169.254/latest','https://localhost/','https://127.0.0.1/','https://user:pass@example.com','https://example.com?key=x','http://evil.com/','file:///etc/passwd'])
   assert.throws(()=>validateProviderEndpoint(url,'remote'),/INVALID_PROVIDER_ENDPOINT/);
 const {db,reg}=fixture();try{
   const a=reg.createAccount({providerId:'custom',name:'My TTS'});
   const m=reg.createModel(a.id,{kind:'tts',modelId:'voice-x',location:'local',costTier:'local',endpoint:'http://127.0.0.1:8000/tts'});
   assert.equal(m.location,'local');assert.equal(m.endpoint,'http://127.0.0.1:8000/tts');
 }finally{db.close()}
});

test('R0-07 v7 -> v8 migration preserves existing channels/videos and creates a backup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cs-r007-'));
 try{
   const file=join(dir,'studio.sqlite');const old=new DatabaseSync(file);
   old.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
   for(const m of migrations.slice(0,7)){
     old.exec('BEGIN IMMEDIATE');try{old.exec(m.sql);old.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(m.version,createHash('sha256').update(m.sql).digest('hex'),1);old.exec('COMMIT')}catch(e){old.exec('ROLLBACK');throw e}
   }
   old.prepare('INSERT INTO channels(id,name,preset_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('old','Legacy','{}',1,1);
   old.close();
   const upgraded=openProjectDb(file);
   assert.equal(upgraded.prepare('SELECT name FROM channels WHERE id=?').get('old').name,'Legacy');
   assert.equal(upgraded.prepare('SELECT MAX(version) n FROM schema_migrations').get().n,migrations.length);
   upgraded.close();
   assert((await readdir(dir)).some(n=>n.includes(`.pre-v${migrations.length}-`)));
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('R0-07 registry persists model state and quota across process restarts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cs-r007-restart-'));const file=join(dir,'db.sqlite');
 try{
   let db=openProjectDb(file);let reg=new ProviderAccountRepository(db);
   const {a,m}=make(reg);reg.setQuota(m.id,{source:'estimated',limit:5,used:2,rowVersion:1});db.close();
   db=openProjectDb(file);reg=new ProviderAccountRepository(db);
   assert.equal(reg.getModel(m.id).quota.limit,5);assert.equal(reg.getAccount(a.id).name,'Local');db.close();
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('R0-07 read-only preview does not write audit event or mutate DB',()=>{
 const {db,reg}=fixture();try{
   make(reg);
   const prior=db.prepare('SELECT COUNT(*) n FROM domain_events').get().n;
   const plan=reg.planRoute({kind:'llm'});
   assert.equal(plan.dryRun,true);assert.equal(plan.selected.providerId,'ollama');
   assert.equal(db.prepare('SELECT COUNT(*) n FROM domain_events').get().n,prior);
 }finally{db.close()}
});
