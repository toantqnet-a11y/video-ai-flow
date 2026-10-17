/** ComfyUI real HTTP adapter integration against local deterministic server.
 * No GPU/model. Actual SP-03 ImageService uses installed FFprobe/FFmpeg. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupProviders} from '../src/providers.mjs';
import {openProjectDb,StudioRepository,AssetManifest,SceneImageRepository,promotePendingQueueAssets} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createJobHandlers} from '../src/handlers.mjs';

const UUID='7e8ce781-9b62-4fd1-b051-469705732e20';
async function fixture({malformed=false,redirect=false}={}){
 const image=await readFile('spikes/SP-03/fixtures/sp03-demo.png');
 const requests=[];
 const server=createServer(async(req,res)=>{
  requests.push({method:req.method,path:req.url});
  if(req.url==='/system_stats')return res.writeHead(200,{'content-type':'application/json'}).end('{"devices":[]}');
  if(req.url==='/prompt'){
    let text='';for await(const chunk of req)text+=chunk;
    const parsed=JSON.parse(text);requests.at(-1).workflow=parsed.prompt;
    return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({prompt_id:UUID}));
  }
  if(req.url===`/history/${UUID}`)return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({
    [UUID]:{status:{completed:true},outputs:{'9':{images:[{filename:'safe.png',subfolder:'',type:'output'}]}}}}));
  if(req.url.startsWith('/view?')){
    if(redirect)return res.writeHead(302,{location:'http://example.com/remote.png'}).end();
    return res.writeHead(200,{'content-type':'image/png'}).end(malformed?Buffer.from('{"not":"an image"}'):image);
  }
  res.writeHead(404).end();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const root=await mkdtemp(join(tmpdir(),'cs-comfy-r205-'));
 const workflowPath=join(root,'workflow.json');
 const workflow={'1':{inputs:{text:'template',seed:0,width:512,height:512}},'9':{inputs:{save:'yes'}}};
 await writeFile(workflowPath,JSON.stringify(workflow));
 const registry=setupProviders({dataRoot:root,comfyUrl:`http://127.0.0.1:${server.address().port}`,
  localConfig:{},imageWorkflow:{path:workflowPath,bindings:{prompt:{nodeId:'1',input:'text'},
    seed:{nodeId:'1',input:'seed'},width:{nodeId:'1',input:'width'},height:{nodeId:'1',input:'height'}}}});
 const dbPath=join(root,'db.sqlite'),db=openProjectDb(dbPath),repo=new StudioRepository(db);
 const store=new JobStore({path:dbPath,leaseMs:1000,baseBackoffMs:1,maxBackoffMs:10});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
 const ch=repo.createChannel({name:'HTTP Comfy test'}),video=repo.createVideo(ch.id,{title:'Comfy'});
 const [scene]=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Một ngày',durationMs:3000,visualPrompt:'Blue skies'}]});
 const svc=new SceneImageRepository(repo,{store,manifest,registry});
 const close=async()=>{store.close();db.close();await new Promise(resolve=>server.close(resolve));await rm(root,{force:true,recursive:true})};
 return {root,registry,requests,server,db,repo,store,manifest,scene,svc,workflowPath,close};
}
async function run(f){const runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.root}),{concurrency:1,pollMs:6,heartbeatMs:100});
 runner.start();try{await runner.waitForIdle({timeoutMs:6000})}finally{await runner.stop()}
 return promotePendingQueueAssets(f.manifest);
}
test('Comfy actual POST /prompt → poll history → GET /view → FFmpeg validation → durable scene asset',async()=>{
 const f=await fixture();try{
  assert.equal((await f.registry.imageAdapter.diagnose()).reachable,true);
  const queued=await f.svc.queue(f.scene.id,{width:640,height:360,seed:91});
  const promotion=await run(f);
  assert.equal(f.store.get(queued.job.id).status,'succeeded');
  assert.equal(promotion.promoted.length,1);assert.equal(promotion.failed.length,0);
  assert.equal((await f.svc.status(f.scene.id)).state,'ready');
  const call=f.requests.find(r=>r.path==='/prompt');
  assert.equal(call.workflow['1'].inputs.text.includes('Blue skies'),true);
  assert.equal(call.workflow['1'].inputs.seed,91);
  assert.equal(call.workflow['1'].inputs.width,640);
  assert.equal(call.workflow['1'].inputs.height,360);
  assert.equal(f.requests.some(x=>x.path.startsWith('/view?')),true);
  assert.equal(JSON.stringify(f.registry.list()).includes(f.server.address().port),false);
 }finally{await f.close()}
});
test('workflow file changes after queue result in terminal IMAGE_WORKFLOW_CHANGED without remote call',async()=>{
 const f=await fixture();try{
  const queued=await f.svc.queue(f.scene.id,{width:640,height:360});
  await writeFile(f.workflowPath,JSON.stringify({'1':{inputs:{text:'modified',seed:0,width:512,height:512}},'9':{inputs:{save:'changed'}}}));
  await run(f);
  assert.equal(f.store.get(queued.job.id).status,'failed');
  assert.equal(f.requests.filter(x=>x.path==='/prompt').length,0);
  assert.equal(f.repo.getScene(f.scene.id).visualAssetId,null);
 }finally{await f.close()}
});
test('JSON masquerading as image rejected before asset promotion',async()=>{
 const f=await fixture({malformed:true});try{
  const queued=await f.svc.queue(f.scene.id,{width:640,height:360});
  await run(f);assert.equal(f.store.get(queued.job.id).status,'failed');
  assert.equal(f.repo.getScene(f.scene.id).visualAssetId,null);
 }finally{await f.close()}
});
test('HTTP redirect is never followed to public web image and cannot activate',async()=>{
 const f=await fixture({redirect:true});try{
  const queued=await f.svc.queue(f.scene.id,{width:640,height:360});
  await run(f);assert.equal(f.store.get(queued.job.id).status,'failed');
  assert.equal(f.repo.getScene(f.scene.id).visualAssetId,null);
 }finally{await f.close()}
});
