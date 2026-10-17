import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createVideoFixture, fakeComfy, fixtureWorkflow, bindings, minimalPng} from './helpers.mjs';
import {ComfyVideoAdapter} from '../src/comfy-video.mjs';
import {VideoError, validateLocalOrigin, validateRequest, assertProviderAllowed, requestFingerprint} from '../src/contracts.mjs';
import {readBounded} from '../src/media.mjs';

let fixture;
before(async()=> {fixture=await createVideoFixture();});
const adapter = (origin, opts={}) => new ComfyVideoAdapter({origin, workflow:fixtureWorkflow,bindings,pollMs:5,timeoutMs:800,...opts});

test('local endpoint strictly refuses arbitrary SSRF destinations, URL credentials and paths',()=>{
  for(const url of ['http://192.168.1.4:8188','https://127.0.0.1:8188','http://127.0.0.1:8188/admin',
    'http://metadata.google.internal','http://127.0.0.1:8188?x=y','http://user:pass@127.0.0.1:8188'])
    assert.throws(()=>validateLocalOrigin(url), {code:'LOCAL_LOOPBACK_ONLY'});
  assert.equal(validateLocalOrigin('http://127.0.0.1:8188'),'http://127.0.0.1:8188');
});
test('hard cost + remote data-transfer gates block nonlocal providers',()=>{
  assertProviderAllowed({type:'local'});
  assert.throws(()=>assertProviderAllowed({type:'paid'}),{code:'PAID_APPROVAL_REQUIRED'});
  assert.throws(()=>assertProviderAllowed({type:'unknown',remoteConsent:false}),{code:'REMOTE_CONSENT_REQUIRED'});
  assert.throws(()=>assertProviderAllowed({type:'paid',paidApproved:true,remoteConsent:true}),{code:'REMOTE_ADAPTER_NOT_IMPLEMENTED'});
});
test('T2V and I2V input validation enforce image, prompt, duration and limits',()=>{
  const request={mode:'text_to_video',prompt:'Hello video',durationSeconds:2};
  assert.equal(validateRequest(request),true);
  assert.throws(()=>validateRequest({...request,durationSeconds:0}),{code:'INVALID_DURATION'});
  assert.throws(()=>validateRequest({...request,width:1}),{code:'INVALID_WIDTH'});
  assert.throws(()=>validateRequest({...request,mode:'image_to_video'}),{code:'REFERENCE_IMAGE_REQUIRED'});
  assert.equal(validateRequest({...request,mode:'image_to_video',imageBytes:minimalPng}),true);
  assert.throws(()=>validateRequest({...request,mode:'image_to_video',imageBytes:Buffer.alloc(24)}),{code:'INVALID_REFERENCE_IMAGE'});
});
test('T2V uses explicit API-format workflow bindings, polls history and fetches actual video bytes',async()=>{
  const mock=await fakeComfy({bytes:fixture.bytes});
  try {
    const progress=[];
    const result=await adapter(mock.origin).generate({mode:'text_to_video',prompt:'River at sunrise',durationSeconds:1,fps:12,seed:5},{onProgress:e=>progress.push(e.stage)});
    assert.deepEqual(result.bytes,fixture.bytes);
    assert.equal(result.provenance.providerId,'comfyui-local');
    assert.deepEqual(progress,['queued','downloading']);
    const posted=JSON.parse(mock.calls.find(c=>c.url==='/prompt').body.toString());
    assert.equal(posted.prompt['10'].inputs.text,'River at sunrise');
    assert.equal(posted.prompt['21'].inputs.length,12);
    assert.equal(posted.prompt['21'].inputs.seed,5);
    assert.equal(fixtureWorkflow['10'].inputs.text,'original', 'user workflow must not be mutated');
  } finally { await mock.close(); }
});
test('I2V uploads image reference locally before posting configured image-node binding',async()=>{
  const mock=await fakeComfy({bytes:fixture.bytes});
  try {
    const result=await adapter(mock.origin).generate({mode:'image_to_video',prompt:'Pan across frame',durationSeconds:1,fps:12,imageBytes:minimalPng});
    assert.equal(result.bytes.length,fixture.bytes.length);
    const uploadIndex=mock.calls.findIndex(c=>c.url==='/upload/image');
    const postIndex=mock.calls.findIndex(c=>c.url==='/prompt');
    assert.ok(uploadIndex>=0 && uploadIndex<postIndex);
    const posted=JSON.parse(mock.calls[postIndex].body.toString());
    assert.equal(posted.prompt['31'].inputs.image,'reference.png');
  } finally {await mock.close();}
});
test('workflow rejects UI JSON and invalid mappings (never guesses Wan node IDs)',async()=>{
  const req={mode:'text_to_video',prompt:'River',durationSeconds:1};
  await assert.rejects(adapter('http://127.0.0.1:8188',{workflow:{nodes:[]}}).loadWorkflow(req),{code:'WORKFLOW_MUST_BE_API_FORMAT'});
  await assert.rejects(adapter('http://127.0.0.1:8188',{bindings:{prompt:{nodeId:'99',input:'text'}}}).loadWorkflow(req),{code:'INVALID_WORKFLOW_BINDING'});
  await assert.rejects(adapter('http://127.0.0.1:8188',{bindings:{prompt:bindings.prompt,durationSeconds:bindings.durationSeconds}}).loadWorkflow(req),{code:'FPS_REQUIRED_FOR_FRAME_BINDING'});
});
test('provider history rejects failures and missing mp4 output',()=>{
  const a=adapter('http://127.0.0.1:8188');
  assert.throws(()=>a.extractVideo({status:{status_str:'error'},outputs:{}}),{code:'GENERATION_FAILED'});
  assert.throws(()=>a.extractVideo({outputs:{'1':{images:[{filename:'test.png'}]}}}),{code:'NO_VIDEO_OUTPUT'});
  assert.throws(()=>a.extractVideo({outputs:{'1':{videos:[{filename:'sample.webm'}]}}}),{code:'NO_VIDEO_OUTPUT'});
  assert.throws(()=>a.extractVideo({outputs:{'1':{gifs:[{filename:'../evil.mp4'}]}}}),{code:'UNSAFE_MEDIA_FILENAME'});
  assert.throws(()=>a.extractVideo({outputs:{'1':{videos:[{filename:'good.mp4',subfolder:'../../secret'}]}}}),{code:'UNSAFE_MEDIA_FOLDER'});
});
test('ComfyUI connection check does not prove GPU generation occurred',async()=>{
  const mock=await fakeComfy({bytes:fixture.bytes});
  try {const info=await adapter(mock.origin).status();assert.equal(info.reachable,true);assert.equal(info.realInferenceVerified,false);} finally {await mock.close();}
});
test('poll waits for history then completes',async()=>{
  let n=0;
  const mock=await fakeComfy({bytes:fixture.bytes,onHistory:({req,writeJson})=>{
    n++;
    if(n<3)return writeJson({});
    const id=req.url.split('/').at(-1);
    return writeJson({[id]:{outputs:{'1':{videos:[{filename:'result.mp4'}]}}}});
  }});
  try { const result=await adapter(mock.origin).generate({mode:'text_to_video',prompt:'Wait for frames',durationSeconds:1,fps:12});assert.equal(result.bytes.length,fixture.bytes.length);assert.equal(n,3); }
  finally {await mock.close();}
});
test('abort while queued cancels local waiting without claiming provider work interrupted',async()=>{
  const mock=await fakeComfy({bytes:fixture.bytes,onHistory:({writeJson})=>writeJson({})});
  const controller=new AbortController();
  try {
    const work=adapter(mock.origin,{pollMs:30,timeoutMs:500}).generate({mode:'text_to_video',prompt:'Cancel',durationSeconds:1,fps:12},{signal:controller.signal});
    setTimeout(()=>controller.abort(),45);
    await assert.rejects(work,{code:'CANCELLED'});
  } finally {await mock.close();}
});
test('timeouts have retryable classification; empty history never yields fake output',async()=>{
  const mock=await fakeComfy({bytes:fixture.bytes,onHistory:({writeJson})=>writeJson({})});
  try {await assert.rejects(adapter(mock.origin,{timeoutMs:650,pollMs:15}).generate({mode:'text_to_video',prompt:'Too slow',durationSeconds:1,fps:12}),e=>e.code==='GENERATION_TIMEOUT' && e.retryable===true);} finally {await mock.close();}
});
test('malicious redirect to external file is blocked (no provider-controlled fetch target)',async()=>{
  const mock=await fakeComfy({bytes:fixture.bytes,onView:({res})=>{res.writeHead(302,{location:'http://example.org/secrets'});res.end();}});
  try {await assert.rejects(adapter(mock.origin).generate({mode:'text_to_video',prompt:'Preview clip',durationSeconds:1,fps:12}),{code:'REDIRECT_FORBIDDEN'});}finally{await mock.close();}
});
test('response body enforces streaming size even without Content-Length',async()=>{
  const response=new Response(Buffer.alloc(100));
  await assert.rejects(readBounded(response,50),{code:'VIDEO_TOO_LARGE'});
});
test('same video request hashes to same fingerprint; changed reference invalidates it',()=>{
  const a={mode:'image_to_video',prompt:'Clip',durationSeconds:1,imageBytes:minimalPng};
  assert.equal(requestFingerprint(a,'wf'),requestFingerprint(a,'wf'));
  assert.notEqual(requestFingerprint(a,'wf'),requestFingerprint({...a,prompt:'Different'},'wf'));
});
