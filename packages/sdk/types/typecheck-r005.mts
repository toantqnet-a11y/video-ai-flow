/** Type-only regression: invoke typed operations and catch body/result drift. */
import {createStudioClient} from '../src/client.mjs';
import type {Channel,OperationArgs,OperationResult} from '../../contracts/src/types.d.mts';
const studio=createStudioClient();
async function check(){
  const result=await studio.request('listChannels',{query:{status:'active'}});
  const first:Channel|undefined=result.items[0];
  if(first){const v:number=first.rowVersion;void v;}
  const newChannel=await studio.request('createChannel',{body:{name:'Kênh Công nghệ'}});
  const capabilities=await studio.request('getPresetCapabilities',{});
  const modes:string[]=capabilities.mediaModes;void modes;
  const revision=await studio.request('getPresetRevision',{id:'channel-id',version:'1'});
  const revisionNo:number=revision.version;void revisionNo;
  // @ts-expect-error A revision save requires rowVersion and a complete preset.
  await studio.request('savePresetRevision',{id:'channel-id',body:{rowVersion:2}});
  const version:number=newChannel.rowVersion;
  const scenes=await studio.request('listScenes',{id:'video-id'});
  const durationMs:number|undefined=scenes.items[0]?.durationMs;
  const created:OperationResult<'createChannel'>=newChannel;
  const input:OperationArgs<'createChannel'>={body:{name:'abc'}};
  void version;void durationMs;void created;void input;
  // @ts-expect-error Invalid filter must be rejected in editor too.
  await studio.request('listChannels',{query:{status:'some-unrecognized-filter'}});
  // @ts-expect-error Every scene creation requires an explicit duration in ms.
  await studio.request('replaceScenes',{id:'video-id',body:{rowVersion:1,scenes:[{text:'A'}]}});
  // R1-04: typecheck judge dispatch, score schema, and variant-scoped read.
  const queuedJudge=await studio.request('queueContentEvaluation',{
    id:'video-id',variantId:'variant-id',body:{evaluatorModelId:'local-judge',requestKey:'rating-1234'}
  });
  const evaluationId:string=queuedJudge.id;
  const rating:number|undefined=queuedJudge.result?.total;void evaluationId;void rating;
  const rubric=await studio.request('getEvaluationRubric',{});
  const weight:number|undefined=rubric.criteria[0]?.weight;void weight;
  // @ts-expect-error An evaluator model is mandatory; freeform booleans cannot authorize paid calls.
  await studio.request('queueContentEvaluation',{id:'video-id',variantId:'variant-id',body:{requestKey:'abc'}});
  // R2-07: preview cannot authorize a paid or remote model call.
  const mediaPlan=await studio.request('previewAssetDag',{id:'video-id',body:{
    voice:{provider:'piper',speed:1},image:{width:512,height:512,seed:1}
  }});
  const count:number=mediaPlan.generateImage;void count;
  const mediaRun=await studio.request('submitAssetDag',{id:'video-id',body:{
    requestKey:'asset-run-01',sceneIds:['scene-1'],voice:{provider:'piper',speed:1},image:null
  }});
  const runState:string=mediaRun.status;void runState;
  const retried=await studio.request('retryAssetDag',{id:'video-id',runId:'run-id',body:{confirmRemote:false}});
  const retriedNumber:number|undefined=retried.retried;void retriedNumber;
  // @ts-expect-error Request key is required to permit durable submit idempotency.
  await studio.request('submitAssetDag',{id:'video-id',body:{voice:{provider:'piper'}}});
  const selective=await studio.request('selectiveRegenerate',{id:'scene-1',body:{kind:'image',requestKey:'retry-1',expectedRowVersion:2,options:{seed:3,width:512,height:512}}});
  const newJob:string|null|undefined=selective.jobId;void newJob;
  await studio.request('selectSceneVoice',{id:'scene-1',body:{assetId:'voice-id',expectedRowVersion:3}});
  // @ts-expect-error Unknown API names must never be accepted.
  await studio.request('downloadCredentials',{id:'x'});
}
void check;
