/**
 * R4-01: Compare a video's effective (frozen-origin + overrides) configuration
 * with the channel's latest preset. Only explicitly selected scalar leaves can
 * be copied; channel changes must NEVER silently migrate existing videos.
 */
import {createHash} from 'node:crypto';
import {stablePresetJson} from './preset-schema.mjs';
import {normalizeVideoOverrides} from './video-config.mjs';

const GROUPS=['content','voice','media','render','models'];
const same=(a,b)=>stablePresetJson(a)===stablePresetJson(b);
const wrong=()=>Object.assign(new Error('INVALID_PRESET_SELECTION'),{code:'INVALID_PRESET_SELECTION'});

export function presetDiffFields(current,channel) {
  const differences=[];
  for(const group of GROUPS){
    for(const key of [...new Set([...Object.keys(current[group]??{}),...Object.keys(channel[group]??{})])].sort()){
      const before=current[group]?.[key],after=channel[group]?.[key];
      if(same(before,after))continue;
      // R0-11 overrides cannot encode deletion of an optional channel field
      // present in the frozen source; display, but prohibit selecting it.
      differences.push({path:`${group}.${key}`,
        currentValue:before??null,channelValue:after??null,
        selectable:after!==undefined});
    }
  }
  return differences;
}

/** Safely construct complete override replacement without losing unselected fields. */
export function buildSelectivePresetOverrides({origin,effective,channel,selectedPaths}){
  if(!Array.isArray(selectedPaths)||selectedPaths.length>64||new Set(selectedPaths).size!==selectedPaths.length||
    selectedPaths.some(x=>typeof x!=='string'||x.length>120))throw wrong();
  const fields=presetDiffFields(effective,channel);
  const selectable=new Set(fields.filter(f=>f.selectable).map(f=>f.path));
  if(selectedPaths.some(path=>!selectable.has(path)))throw wrong();
  const desired=structuredClone(effective);
  for(const path of selectedPaths){const [group,key]=path.split('.');desired[group][key]=channel[group][key];}
  // Converting the resulting effective config back to overrides relative to
  // the ORIGINAL source avoids unintentionally inheriting future channel edits.
  const overrides={};
  for(const group of GROUPS){
    for(const [key,value] of Object.entries(desired[group])){
      if(!same(value,origin[group][key]))(overrides[group]??={})[key]=value;
    }
  }
  const result=normalizeVideoOverrides(origin,overrides); // canonical provider/cost validation
  if(!same(result.resolved,desired))throw wrong();
  return {fields,overrides:result.overrides,resolved:result.resolved};
}

/** Fingerprint selection AND impact at preview time, not just selected names. */
export function presetApplyDigest(payload){
  return createHash('sha256').update(stablePresetJson(payload)).digest('hex');
}
