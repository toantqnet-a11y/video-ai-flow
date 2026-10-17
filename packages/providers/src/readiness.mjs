/**
 * R0-07 provider readiness is conservative. A credential reference is NOT proof
 * of valid quota, model access or billing. Only known local endpoints receive a
 * non-generative health GET. Unknown/local custom and all remote models are
 * never probed to avoid SSRF, billable requests and leaking user text.
 */
const knownLocal={ollama:{url:'http://127.0.0.1:11434/api/tags',path:'/api/tags'},
  comfyui:{url:'http://127.0.0.1:8188/system_stats',path:'/system_stats'}};
export async function providerReadiness({account,models=[],hasCredential=false,probe=false,fetchImpl=fetch,timeoutMs=2500}={}){
 if(!account)throw new Error('ACCOUNT_REQUIRED');
 const results=[];
 for(const model of models){
   let state='UNVERIFIED',reason='PROVIDER_NOT_PROBED';
   if(account.status!=='active'||model.status!=='active'){state='DISABLED';reason='DISABLED';}
   else if(model.location==='remote'){
     if(account.providerId!=='edge'&&!hasCredential){state='NEEDS_KEY';reason='CREDENTIAL_NOT_CONFIGURED';}
     else {state='UNVERIFIED';reason='REMOTE_NOT_PROBED_NO_CHARGES';}
   }else if(account.providerId in knownLocal){
     const spec=knownLocal[account.providerId];
     // Customizing endpoints does not authorize probing an arbitrary URL: only
     // the known loopback address is safe to probe in the first iteration.
     if(model.endpoint&& new URL(model.endpoint).origin!==new URL(spec.url).origin){
       state='UNVERIFIED';reason='CUSTOM_ENDPOINT_NOT_PROBED';
     }else if(probe){
       const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),timeoutMs);
       try{
         const response=await fetchImpl(spec.url,{method:'GET',redirect:'error',signal:abort.signal,
           headers:{accept:'application/json'}});
         state=response.ok?'REACHABLE':'UNAVAILABLE';reason=response.ok?'LOCAL_ENDPOINT_REACHABLE':'LOCAL_PROBE_FAILED';
       }catch{state='UNAVAILABLE';reason='LOCAL_PROBE_FAILED';}
       finally{clearTimeout(timer)}
     }else {state='UNVERIFIED';reason='PROBE_NOT_REQUESTED';}
   }else {state='UNVERIFIED';reason='NO_SAFE_PROBE_ADAPTER';}
   results.push({modelId:model.id,modelName:model.modelId,state,reason,
     inferenceVerified:false,quotaVerified:false});
 }
 return {accountId:account.id,probeRequested:probe,models:results,
   note:'Kết nối local thành công không chứng minh model chạy được. Remote không được gọi thử hoặc tính phí.'};
}
