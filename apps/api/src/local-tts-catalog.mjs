/** R2-04: read-only disclosure of operator-configured, loopback TTS runtime.
 * Health checks never synthesize voice or reveal endpoint locations.
 */
export async function localTtsCatalog(registry,{probe=false}={}){
  const items=[];
  for(const id of ['piper','vieneu']){
    const adapter=registry.localTtsAdapters?.get(id);
    let health='not_configured';
    if(adapter){
      health='not_probed';
      if(probe){
        try{const output=await adapter.health();health=output.status==='ready'?'ready':'unavailable';}
        catch{health='unavailable'}
      }
    }
    items.push({provider:id,configured:!!adapter,voice:registry.localVoiceDefaults?.[id]??null,health});
  }
  return {items};
}
