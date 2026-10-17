/**
 * HTTP facade for SP-06 AES-256-GCM vault. All endpoints inherit the global
 * localhost + bearer + CSRF security guard; plaintext retrieval has NO route.
 * Responses and logs contain only safe codes/metadata, never credentials.
 */
import {VaultError} from '../../../packages/security/src/index.mjs';
import {createUnlockLimiter} from './unlock-limiter.mjs';

const exactFields=(body,fields)=>Boolean(body)&&typeof body==='object'&&!Array.isArray(body)
  &&Object.keys(body).length===fields.length&&fields.every(f=>Object.hasOwn(body,f));

export function registerVaultRoutes(app,{vault,limiter=createUnlockLimiter(),isCredentialUsed=()=>false}={}) {
  let unlockTail=Promise.resolve();
  const wrap=fn=>async(req,reply)=>{
    try{return await fn(req,reply)}catch(error){
      if(!(error instanceof VaultError)){
        req.log?.error?.({code:'VAULT_INTERNAL_ERROR'},'vault operation failed');
        return reply.code(500).send({error:'VAULT_ERROR'});
      }
      const code=error.code;
      const status=code==='VAULT_LOCKED'?423:code==='VAULT_UNLOCK_RATE_LIMITED'?429:code==='VAULT_UNLOCK_FAILED'?401:
        code==='SECRET_NOT_FOUND'?404:code.startsWith('INVALID_')?400:409;
      return reply.code(status).send({error:code});
    }
  };
  app.get('/api/security/vault/status',wrap(()=>vault.status()));
  app.get('/api/security/credentials',wrap(async()=>({items:await vault.list()})));
  app.post('/api/security/vault/init',wrap(async(req,reply)=>{
    if(!exactFields(req.body,['passphrase']))return reply.code(400).send({error:'INVALID_VAULT_REQUEST'});
    return reply.code(201).send(await vault.initialize(req.body.passphrase));
  }));
  app.post('/api/security/vault/unlock',wrap((req,reply)=>{
    if(!exactFields(req.body,['passphrase']))return reply.code(400).send({error:'INVALID_VAULT_REQUEST'});
    // All unlocks in this Fastify process must pass the same atomic throttle.
    const run=async()=>{
      if(limiter.blocked())throw new VaultError('VAULT_UNLOCK_RATE_LIMITED');
      try {const output=await vault.unlock(req.body.passphrase);limiter.succeeded();return output;}
      catch(error){if(error.code==='VAULT_UNLOCK_FAILED')limiter.failed();throw error;}
    };
    const result=unlockTail.then(run);
    unlockTail=result.catch(()=>{});
    return result;
  }));
  app.post('/api/security/vault/lock',wrap((req,reply)=>{
    if(req.body&&(!exactFields(req.body,[])||Object.keys(req.body).length))return reply.code(400).send({error:'INVALID_VAULT_REQUEST'});
    vault.lock();return {state:'LOCKED'};
  }));
  app.post('/api/security/credentials',wrap(async(req,reply)=>{
    if(!exactFields(req.body,['id','providerId','apiKey']))return reply.code(400).send({error:'INVALID_CREDENTIAL_REQUEST'});
    return reply.code(201).send(await vault.put(req.body.id,req.body.providerId,req.body.apiKey));
  }));
  app.delete('/api/security/credentials/:id',wrap((req,reply)=>{
    // A config reference must not silently become dangling after secret deletion.
    if(isCredentialUsed(req.params.id))return reply.code(409).send({error:'CREDENTIAL_IN_USE'});
    return vault.remove(req.params.id);
  }));
}
