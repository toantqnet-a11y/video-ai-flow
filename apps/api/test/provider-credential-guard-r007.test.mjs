/** Prevent dangling account->credential references after deletion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerVaultRoutes} from '../src/vault-routes.mjs';

test('R0-07 delete blocked if encrypted credential is still referenced',async()=>{
  let removed=false;
  const app={delete(path,fn){if(path==='/api/security/credentials/:id')this.remove=fn},get(){},post(){}};
  registerVaultRoutes(app,{vault:{remove:async()=>{removed=true;return {deleted:true}}},isCredentialUsed:id=>id==='key-bound'});
  const reply={status:200,code(v){this.status=v;return this},send(body){return body}};
  const denied=await app.remove({params:{id:'key-bound'},log:{}},reply);
  assert.equal(reply.status,409);assert.deepEqual(denied,{error:'CREDENTIAL_IN_USE'});assert.equal(removed,false);
  reply.status=200;
  const allowed=await app.remove({params:{id:'key-free'},log:{}},reply);
  assert.deepEqual(allowed,{deleted:true});assert.equal(removed,true);
});
