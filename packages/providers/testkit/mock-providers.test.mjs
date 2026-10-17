/** R0-14 deterministic provider smoke, negative paths, and zero-network guarantee. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ProviderRegistry} from '../src/index.mjs';
import {registerMockProviders} from './mock-providers.mjs';
const digest=data=>createHash('sha256').update(data).digest('hex');
const root=()=>mkdtemp(join(tmpdir(),'cs-r014-mocks-'));

test('all four modalities create deterministic, LOCAL artifacts and never call fetch',async()=>{
 const dir=await root(), original=globalThis.fetch;
 globalThis.fetch=()=>{throw new Error('NETWORK_MUST_NOT_BE_USED');};
 try {
  const reg=new ProviderRegistry();const {calls}=registerMockProviders(reg,{dataRoot:dir});
  assert.equal(reg.list().length,4);
  assert.equal(reg.list().every(x=>x.location==='local'&&x.costTier==='local'),true);
  const llm=await reg.invoke('mock-llm',{prompt:'Xin chào thế giới'});
  assert.match(llm.text,/\[MOCK/);
  for(const [id,input,signature] of [
    ['mock-tts',{text:'Xin chào',voice:'vi-VN-HoaiMyNeural'},'RIFF'],
    ['mock-image',{prompt:'Sunrise',style:'illustration'},'\x89PNG'],
    ['mock-video',{request:{prompt:'Sunrise',duration:1}},'']
  ]) {
    const first=await reg.invoke(id,input),second=await reg.invoke(id,input);
    assert.equal(first.path,second.path);
    const bytes=await readFile(first.path);
    assert.equal(bytes.length,(await stat(first.path)).size);
    if(id==='mock-tts')assert.equal(bytes.toString('ascii',0,4),'RIFF');
    if(id==='mock-image')assert.equal(bytes.subarray(0,4).equals(Buffer.from('89504e47','hex')),true);
    if(id==='mock-video')assert.equal(bytes.toString('ascii',4,8),'ftyp');
    assert.equal(digest(bytes),digest(await readFile(second.path)));
  }
  assert.deepEqual(calls,{llm:1,tts:2,image:2,video:2});
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});

test('provider mock supports retryable and permanent failures without exposing prompts',async()=>{
 const dir=await root();try{
  const r=new ProviderRegistry();const {calls}=registerMockProviders(r,{dataRoot:dir,failFirst:{llm:1},alwaysFail:{video:true}});
  await assert.rejects(r.invoke('mock-llm',{prompt:'Private content'}),{code:'MOCK_TRANSIENT_FAILURE',retryable:true});
  assert.match((await r.invoke('mock-llm',{prompt:'Private content'})).text,/MOCK/);
  await assert.rejects(r.invoke('mock-video',{request:{prompt:'Private content'}}),{code:'MOCK_TRANSIENT_FAILURE',retryable:false});
  assert.equal(calls.llm,2);assert.equal(calls.video,1);
  assert.equal(JSON.stringify(r.list()).includes('Private content'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('mock input validation and cancellation always fail without network',async()=>{
 const dir=await root();try{
  const r=new ProviderRegistry();registerMockProviders(r,{dataRoot:dir,latencyMs:70});
  await assert.rejects(r.invoke('mock-llm',{prompt:''}),{code:'MOCK_INVALID_INPUT',retryable:false});
  const controller=new AbortController();const pending=r.invoke('mock-image',{prompt:'a landscape'},{signal:controller.signal});
  setTimeout(()=>controller.abort(),10);
  await assert.rejects(pending,{code:'MOCK_ABORTED',retryable:false});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('mock providers never weaken paid or remote consent policy',async()=>{
 const dir=await root();try{
  const r=new ProviderRegistry();registerMockProviders(r,{dataRoot:dir});
  let invoked=false;
  r.register({id:'billable',kind:'llm',location:'remote',costTier:'paid',estimateCostMicroUsd:()=>100,invoke:async()=>{invoked=true;}});
  await assert.rejects(r.invoke('billable',{prompt:'x'}, {allowRemote:true,paidApproval:{approved:true}}),/PAID_APPROVAL_REQUIRED/);
  assert.equal(invoked,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
