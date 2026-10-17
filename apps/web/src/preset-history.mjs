/**
 * R0-08 read-only preset comparison for the channel settings UI.
 * It intentionally handles only the allowlisted preset groups; no credentials,
 * provider responses or secrets can enter a comparison by accident.
 * Restoring an old revision is NOT supported yet (later EP10 story).
 */
export const presetGroups=['content','voice','media','render','models'];
export function comparePresetRevisions(older,newer){
  if(!older?.preset||!newer?.preset)return [];
  const diff=[];
  for(const group of presetGroups){
    const from=older.preset[group]??{},to=newer.preset[group]??{};
    for(const key of [...new Set([...Object.keys(from),...Object.keys(to)])].sort()){
      // The view must never enumerate an unexpected secret property.
      if(!Object.hasOwn(allowedPresetFields,group)||!allowedPresetFields[group].includes(key))continue;
      if(!Object.is(from[key],to[key]))diff.push({group,key,from:from[key]??null,to:to[key]??null});
    }
  }
  return diff;
}
const allowedPresetFields={
  content:['style','tone','language','targetMinutes','audience','topic','addressStyle','preferredTerms','avoidTerms','basePrompt','extraPrompt'],
  voice:['provider','voice','speed','characterName','characterDescription'],
  media:['mode','style','aspectRatio','sceneSeconds','motionEffect'],
  render:['width','height','fps','codec','subtitles'],
  models:['paidEnabled','remoteEnabled']
};
