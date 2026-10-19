/** LOCALHOST-06: immutable job identity guard for simultaneous SSE, HTTP polling,
 * browser re-pair and SQLite history hydration. A slower GET must not replace
 * a newly queued job with an earlier one or regress completed output to running.
 */
const finalStates=new Set(['succeeded','failed','cancelled']);
export function keepCurrentRenderJob(current,incoming,requestedId){
 if(!current||current.id!==requestedId||incoming?.id!==requestedId)return current;
 if(finalStates.has(current.status)&&current.status!==incoming.status)return current;
 return incoming;
}
export function hydrateRenderHistory(current,items){
 // Async mount or history refresh is read-only. Never replace an active
 // selection created since the request started.
 return current??items?.[0]??null;
}

export function reconcileRenderHistory(current,items){
 if(!current)return items?.[0]??null;
 // Selecting a historical completed render is deliberate. Never jump to a
 // newer job just because it finished, and never take a stale status snapshot.
 const updated=items?.find(x=>x.id===current.id);
 return updated?keepCurrentRenderJob(current,updated,current.id):current;
}
