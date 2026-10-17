/** A new idempotency key is minted per CLICK, never per render or read. */
export function selectiveBody(kind,expectedRowVersion,options={},requestKey){
  if(!['voice','image'].includes(kind)||!Number.isSafeInteger(expectedRowVersion)||expectedRowVersion<1||
    typeof requestKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(requestKey))
    throw new Error('INVALID_SELECTIVE_REGENERATION');
  return {kind,requestKey,expectedRowVersion,options};
}

/** UI must not regenerate text/prompt that changed in another editor tab
 * even if fetching a fresh rowVersion would technically allow the request.
 */
export function assertSourceUnchanged(seen,fresh,kind){
  if(!seen||!fresh||seen.id!==fresh.id||seen.text!==fresh.text||
    (kind==='image'&&(seen.visualPrompt!==fresh.visualPrompt||seen.mediaType!==fresh.mediaType)))
    throw new Error('SCENE_CHANGED_RELOAD_REQUIRED');
}
