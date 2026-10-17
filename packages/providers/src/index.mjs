/**
 * One registry for already-developed SPIKE adapters. No fake AI outputs are
 * exposed as live models. Provider calls are explicit and paid/remote OFF.
 */
import {createHash} from 'node:crypto';

export class ProviderRegistry {
  #entries=new Map();
  #paidPolicy=null;
  // Install server-owned durable guard; never supply this through untrusted JSON.
  setPaidPolicy(policy){if(typeof policy!=='function')throw new Error('INVALID_PAID_POLICY');this.#paidPolicy=policy;return this;}
  register({id,kind,location,costTier,invoke,estimateCostMicroUsd,noChargeConfirmed=false}) {
    if (!/^[a-z0-9_-]{2,60}$/.test(id)||!['llm','tts','image','video'].includes(kind)||
      !['local','remote'].includes(location)||!['local','free_unverified','paid','unknown'].includes(costTier)||
      typeof invoke!=='function'||this.#entries.has(id)||
      (['paid','unknown'].includes(costTier)&&typeof estimateCostMicroUsd!=='function'))throw new Error('INVALID_PROVIDER');
    this.#entries.set(id,{id,kind,location,costTier,invoke,estimateCostMicroUsd,noChargeConfirmed});return this;
  }
  list() {return [...this.#entries.values()].map(({invoke,estimateCostMicroUsd,noChargeConfirmed,...publicMetadata})=>publicMetadata);}
  /** Paid invocations require DB-backed job-bound approval at execution time.
   * A JSON `paidApproval` from route-preview is deliberately ignored.
   */
  async invoke(id,input,{allowRemote=false,paidApproval=null,paidContext=null,signal}={}) {
    const p=this.#entries.get(id);
    if(!p) throw Object.assign(new Error('PROVIDER_NOT_REGISTERED'),{retryable:false});
    if (p.location==='remote'&&!allowRemote) throw Object.assign(new Error('REMOTE_CONSENT_REQUIRED'),{retryable:false});
    // A user-entered 'free' flag is not proof an external provider will not bill.
    // Only vetted built-in adapters may declare a non-billable remote endpoint.
    if(p.costTier==='free_unverified'&&p.location==='remote'&&!p.noChargeConfirmed)
      throw Object.assign(new Error('FREE_TIER_NOT_VERIFIED'),{retryable:false});
    if(p.costTier==='paid'||p.costTier==='unknown') {
      if(!this.#paidPolicy||!paidContext||p.costTier==='unknown')
        throw Object.assign(new Error(p.costTier==='unknown'?'PRICING_UNVERIFIED':'PAID_APPROVAL_REQUIRED'),{retryable:false});
      // Trusted adapter computes worst-case estimate; caller-supplied estimates
      // or spoofed approval flags must never authorize external spending.
      const estimateMicroUsd=await p.estimateCostMicroUsd(input);
      if(!Number.isSafeInteger(estimateMicroUsd)||estimateMicroUsd<=0)
        throw Object.assign(new Error('PAID_COST_ESTIMATE_UNAVAILABLE'),{retryable:false});
      try{return await this.#paidPolicy({...paidContext,providerId:id,estimateMicroUsd},()=>p.invoke(input,{signal}));}
      catch(error){if(typeof error==='object'&&error&&error.retryable===undefined)error.retryable=false;throw error;}
    }
    return p.invoke(input,{signal});
  }
}

export const fingerprint = value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Register real local adapters only when their runtime prerequisites exist. */
export async function configureLocalProviders(registry,{spikesRoot,dataRoot,comfyUrl}={}) {
  const {TtsService}=await import(`${spikesRoot}/SP-02/src/service.js`);
  const {ImageService}=await import(`${spikesRoot}/SP-03/src/service.js`);
  const {VideoAssetService}=await import(`${spikesRoot}/SP-VID-01/src/service.mjs`);
  const {ComfyVideoAdapter}=await import(`${spikesRoot}/SP-VID-01/src/comfy-video.mjs`);
  // No adapter is auto-registered without its required runtime configuration.
  // We re-export SPIKE service implementations here so the application can use
  // a single registry without rewriting successful spike logic.
  return {TtsService,ImageService,VideoAssetService,ComfyVideoAdapter,dataRoot,comfyUrl,registry};
}
