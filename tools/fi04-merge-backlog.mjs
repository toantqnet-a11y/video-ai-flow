#!/usr/bin/env node
/** FI-04 backlog generator: deterministic, duplicate-safe, no network calls. */
import {readFile,writeFile} from 'node:fs/promises';
import {parseVideoRoadmap,mergeBacklog} from './fi04-backlog.mjs';
import {normalizeLocalhostBacklog} from './localhost-backlog.mjs';
const get=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const base=JSON.parse(await get('docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json'));
const video=parseVideoRoadmap(await get('docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md'));
const policy=JSON.parse(await get('docs/LOCALHOST_BACKLOG_POLICY.json'));
const merged=normalizeLocalhostBacklog(mergeBacklog(base,video),policy);
const target=new URL('../docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json',import.meta.url);
const serialized=JSON.stringify(merged,null,2)+'\n';
const flag=process.argv[2];if(process.argv.length>3||flag&&flag!=='--check')throw new Error('FI04_UNSUPPORTED_BACKLOG_FLAG');
if(flag==='--check'){
 const current=await readFile(target,'utf8').catch(()=>null);
 if(serialized!==current){console.error('FI04_BACKLOG_DRIFT: regenerate with npm run backlog:merge:fi04');process.exitCode=1;}
 else console.log(`FI04_BACKLOG_PASS ${merged.taskCount} unique tasks / ${merged.groups.aiVideo} AI-video`);
}else{await writeFile(target,serialized);console.log(`FI04_BACKLOG_WRITTEN ${merged.taskCount} tasks; ${merged.groups.aiVideo} video roadmap entries preserved`)}
