#!/usr/bin/env node
/**
 * Private LOCALHOST-07 test child. Uses the real production renderer and
 * SP-04 JobRunner. IPC sends stage labels only, never source text, paths,
 * pairing codes, environment variables or media bytes.
 */
import {resolve} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository} from '../packages/core/src/index.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
import {RenderExportService} from '../apps/api/src/render-export-r2ext0406.mjs';
const root=process.argv[2],jobId=process.argv[3];
if(typeof root!=='string'||typeof jobId!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(jobId))
 throw Error('LOCAL_RECOVERY_CHILD_ARGS_INVALID');
const path=resolve(root,'project.sqlite');
const db=openProjectDb(path);
const store=new JobStore({path,leaseMs:3200});
const repo=new StudioRepository(db);
const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
const compositions=new CompositionRepository({repo,manifest});
const renderer=new RenderExportService({repo,store,manifest,compositions});
const handler=renderer.handler('hyperframes');
const runner=new JobRunner(store,{
 'render:hyperframes':async(payload,ctx)=>{
  if(ctx.jobId!==jobId)throw Object.assign(Error('RECOVERY_WRONG_JOB'),{retryable:false});
  process.send?.({type:'handler_active'});
  return await handler(payload,ctx);
 }
},{concurrency:1,pollMs:65,heartbeatMs:400});
runner.start();
process.send?.({type:'ready'});
let stopping=false;
process.on('message',async msg=>{
 if(msg?.type!=='stop'||stopping)return;
 stopping=true;
 await runner.stop({abort:false});
 store.close();db.close();
 process.send?.({type:'stopped'});
 process.exit(0);
});
process.on('uncaughtException',()=>process.exit(1));
process.on('unhandledRejection',()=>process.exit(1));
