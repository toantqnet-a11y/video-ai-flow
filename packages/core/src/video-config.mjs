/**
 * Video config resolver (EP10 / R0-11).
 * Why: channel presets are immutable sources for existing videos. Overrides
 * are applied to a frozen copy, and changing them NEVER regenerates media.
 * A separate impact report tells the user which downstream work is stale.
 */
import {validPreset} from './domain.mjs';
import {stablePresetJson} from './preset-schema.mjs';

const groups=new Set(['content','voice','media','render','models']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

/** Accept only known group/field names; no credentials or prototype keys. */
export function normalizeVideoOverrides(base, overrides={}) {
  if (!object(overrides)) throw invalid();
  if (JSON.stringify(overrides).length>24000) throw invalid();
  const normalized={};
  for (const [group,fields] of Object.entries(overrides)) {
    if (!groups.has(group)||!object(fields)) throw invalid();
    const changes={};
    for (const [key,value] of Object.entries(fields)) {
      if(!Object.hasOwn(base[group],key) && !isOptionalField(group,key)) throw invalid();
      // Override is a value, never a deletion instruction. Reset to channel
      // origin by removing the field from the submitted override object.
      if (value===null||object(value)||Array.isArray(value)) throw invalid();
      if (stablePresetJson(value)!==stablePresetJson(base[group][key])) changes[key]=value;
    }
    if(Object.keys(changes).length) normalized[group]=changes;
  }
  const resolved=structuredClone(base);
  for(const [group,changes] of Object.entries(normalized)) Object.assign(resolved[group],changes);
  validPreset(resolved); // Paid/remote requests remain denied by the canonical policy.
  return {overrides:normalized,resolved};
}

function invalid(){return Object.assign(new Error('INVALID_VIDEO_OVERRIDES'),{code:'INVALID_VIDEO_OVERRIDES',status:400});}
function isOptionalField(group,key){
  const fields={
    content:['audience','topic','addressStyle','preferredTerms','avoidTerms','basePrompt','extraPrompt'],
    voice:['characterName','characterDescription'],media:['motionEffect'],render:['subtitles']
  };
  return fields[group]?.includes(key)??false;
}

/** Persist the diff so the editor can show stale assets after a restart. */
export function videoConfigImpact(before,after,{hasScript=false,sceneCount=0,assetCounts={}}={}){
  const changedPaths=[];
  const affected=new Set();
  for (const group of groups) for (const key of new Set([...Object.keys(before[group]),...Object.keys(after[group])])) {
    if(stablePresetJson(before[group][key])===stablePresetJson(after[group][key]))continue;
    changedPaths.push(`${group}.${key}`);
    if(group==='content')affected.add('script_review');
    if(group==='voice'){affected.add('voice');affected.add('render');}
    if(group==='media'){
      if(key==='motionEffect'){affected.add('render');}
      else {affected.add('image');affected.add('video');affected.add('render');}
    }
    if(group==='render')affected.add('render');
    if(group==='models')affected.add('future_jobs');
  }
  changedPaths.sort();
  const counts={voice:assetCounts.voice??0,image:assetCounts.image??0,video:assetCounts.video??0};
  const requiresReview=affected.has('script_review')&&hasScript ||
    affected.has('voice')&&counts.voice>0 ||
    affected.has('image')&&counts.image>0 ||
    affected.has('video')&&counts.video>0 ||
    affected.has('render')&&sceneCount>0;
  return {changedPaths,affected:[...affected].sort(),requiresReview,
    existing:{hasScript,sceneCount,assetCounts:counts},
    note:'Preview only. No asset, script, timeline or job is modified automatically.'};
}
