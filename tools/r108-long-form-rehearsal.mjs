/**
 * R1-08 — reproducible multi-model/long-script production REHEARSAL.
 * Uses the actual SQLite repositories, SP-04 scheduler, chapter worker and
 * Master Script approval, but supplies deterministic TEST-ONLY text instead
 * of calling providers. Output is metric-only and safe for CI artifacts.
 * This harness NEVER reads API keys, contacts AI services or incurs costs.
 */
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository,
  ChapterGenerationRepository,MasterScriptRepository} from '../packages/core/src/index.mjs';
import {auditLongContent} from '../packages/core/src/long-content-audit.mjs';
import {createChapterJobHandler} from '../apps/api/src/chapter-generation.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const MODEL_IDS=['qa_model_a','qa_model_b','qa_model_c'];
const DEFAULT_MINUTES=35,WPM=145,CHAPTER_COUNT=5;

/** Synthetic chapter with exact target count; never a claim about AI quality. */
function syntheticDraft({modelId,chapterIndex,wordCount}){
  const vocabulary=['kiến','thức','nghiên','cứu','dữ','liệu','phương','pháp','khoa','học',
    'lịch','sử','ứng','dụng','hiện','đại','đổi','mới','bằng','chứng'];
  // Mark each unique chapter with lexical signature; the rest is generated
  // deterministically to stress storage, timing estimates and queue behavior.
  const words=[`M${modelId}`,`C${chapterIndex+1}`,...Array.from({length:wordCount-2},(_,i)=>vocabulary[(i+chapterIndex*3+MODEL_IDS.indexOf(modelId))%vocabulary.length])];
  return {text:words.join(' '),summary:`Tóm tắt chương ${chapterIndex+1} từ mô hình ${modelId} để duy trì bối cảnh.`};
}

/**
 * Run real queue/repository code with stub LLM output.
 * @returns {Promise<object>} Safe report without prompts/scripts, credentials or personal data.
 */
export async function runLongFormRehearsal({injectTransientError=true,durationMinutes=DEFAULT_MINUTES}={}){
  if(![30,35,40].includes(durationMinutes))throw new RangeError('REHEARSAL_DURATION_UNSUPPORTED');
  const chapterWords=durationMinutes*WPM/CHAPTER_COUNT;
  const db=openProjectDb(),repo=new StudioRepository(db),store=new JobStore({path:':memory:',leaseMs:1500,baseBackoffMs:1});
  const start=performance.now(); let concurrent=0,maxConcurrent=0,retrySimulated=false;
  try{
    const ch=repo.createChannel({name:'R108 test channel'}),video=repo.createVideo(ch.id,{title:'35-minute QA rehearsal'});
    db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('qa_account','ollama','QA local mock',1,1)").run();
    for(const id of MODEL_IDS)db.prepare(`INSERT INTO provider_models
      (id,account_id,model_id,kind,location,cost_tier,created_at,updated_at)
      VALUES(?,'qa_account',?,'llm','local','local',1,1)`).run(id,id);
    const briefs=new ContentBriefRepository(repo),outlines=new ContentOutlineRepository(repo),
      gen=new ChapterGenerationRepository(repo,{store}),master=new MasterScriptRepository(repo);
    briefs.save(video.id,{expectedRevision:0,brief:{topic:'Chủ đề mô phỏng',idea:'Đánh giá độ dài và tiến trình',
      modelIds:MODEL_IDS,target:{mode:'duration',durationMinutes,wpm:WPM,
        wordCount:chapterWords*CHAPTER_COUNT,chapterTargetWords:chapterWords}}});
    outlines.save(video.id,{expectedRevision:0,outline:{chapters:Array.from({length:CHAPTER_COUNT},(_,i)=>({
      id:`chapter_${i+1}`,title:`Chương ${i+1}`,objective:'Tổng hợp thông tin và tiếp nối chủ đề',
      keyPoints:['Luận điểm'],targetWords:chapterWords}))}});
    const request={briefRevision:1,outlineRevision:1,modelIds:MODEL_IDS,requestKey:'r108_rehearsal'};
    const batch=gen.requestBatch(video.id,request);
    if(gen.requestBatch(video.id,request).id!==batch.id)throw new Error('REHEARSAL_IDEMPOTENCY_FAILED');
    const generateLocal=async({modelId,chapterIndex,prompt,signal})=>{
      if(signal?.aborted)throw Object.assign(new Error('cancelled'),{code:'REHEARSAL_ABORTED'});
      // A successful predecessor summary must be injected per model chain.
      if(chapterIndex>0&&!prompt.includes(`Tóm tắt chương ${chapterIndex} từ mô hình ${modelId}`))
        throw Object.assign(new Error('missing continuity'),{code:'REHEARSAL_CONTEXT_MISSING',retryable:false});
      concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
      try{
        await new Promise(r=>setTimeout(r,2));
        if(injectTransientError&&!retrySimulated&&modelId===MODEL_IDS[1]&&chapterIndex===2){
          retrySimulated=true;
          throw Object.assign(new Error('simulated 429'),{code:'REHEARSAL_RATE_LIMIT',retryable:true});
        }
        return syntheticDraft({modelId,chapterIndex,wordCount:chapterWords});
      }finally{concurrent--}
    };
    const runner=new JobRunner(store,{'content:chapter':createChapterJobHandler({repo,store,generateLocal})},
      {concurrency:3,pollMs:3,heartbeatMs:100});
    runner.start();
    try{await runner.waitForIdle({timeoutMs:20_000})}finally{await runner.stop()}
    const results=gen.batch(video.id,batch.id);
    if(!results.complete)throw new Error(`REHEARSAL_INCOMPLETE_${results.counts.succeeded}`);
    const audit=auditLongContent({modelIds:MODEL_IDS,
      plannedChapters:outlines.get(video.id).outline.chapters,
      chapters:results.results.map(r=>({modelId:r.modelId,chapterIndex:r.chapterIndex,
        text:r.text,summary:r.summary})),expectedMinutes:durationMinutes,wpm:WPM});
    if(audit.models.some(m=>m.readiness!=='METRIC_CHECKS_PASS'))throw new Error('REHEARSAL_CONTENT_AUDIT_FAILED');
    if(repo.getVideo(video.id).masterScript)throw new Error('REHEARSAL_PREMATURE_MASTER_APPROVAL');
    const selections=results.results.filter(r=>r.modelId===MODEL_IDS[0]).map(r=>({chapterIndex:r.chapterIndex,variantId:r.variantId}));
    const candidate=master.save(video.id,{expectedRevision:0,outlineRevision:1,selections});
    if(repo.getVideo(video.id).masterScript)throw new Error('REHEARSAL_PREMATURE_MASTER_PUBLISH');
    const approved=master.approve(video.id,{revision:candidate.revision,expectedRevision:candidate.revision,
      videoRowVersion:repo.getVideo(video.id).rowVersion,acknowledgeWarnings:true});
    const approvedText=repo.getVideo(video.id).masterScript;
    if(approvedText.length<20_000||approvedText.length>300_000)throw new Error('REHEARSAL_MASTER_SCRIPT_LENGTH');
    const jobs=store.list({limit:100});
    const attempts=jobs.map(j=>store.attempts(j.id).length);
    return {taskId:'R1-08',mode:'MOCK_ONLY_NO_EXTERNAL_REQUESTS',simulatedVideoMinutes:durationMinutes,
      chapterCount:CHAPTER_COUNT,modelCount:MODEL_IDS.length,jobCount:jobs.length,
      successfulJobs:jobs.filter(j=>j.status==='succeeded').length,
      failedJobs:jobs.filter(j=>j.status==='failed').length,
      repeatedRequestCreatedJobs:false,maxObservedConcurrentCalls:maxConcurrent,
      totalAttempts:attempts.reduce((a,b)=>a+b,0),transientFailureInjected:retrySimulated,
      elapsedMs:Math.round(performance.now()-start),
      master:{approvalRecorded:Boolean(approved),wordCount:candidate.wordCount,
        approvedVersion:candidate.revision,sourceChapterCount:selections.length},
      contentAudit:audit,providerCalls:{external:0,paid:0},
      acceptance:'OFFLINE_STRUCTURAL_CHECKS_ONLY',limitations:[
        'Synthetic content is not validated for correctness, language quality, or factual consistency.',
        'Word-count duration is an estimate, not a TTS or completed MP4 duration.',
        'No live provider, Fastify browser, Windows hardware or GPU was tested.'
      ]};
  }finally{store.close();db.close()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const report=await runLongFormRehearsal();
    const pathArg=process.argv.find(x=>x.startsWith('--report='));
    if(pathArg){const target=resolve(pathArg.slice('--report='.length));mkdirSync(dirname(target),{recursive:true});
      writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));
  }catch(e){console.error('R1-08 rehearsal failed:',e.code??e.message);process.exitCode=1}
}
