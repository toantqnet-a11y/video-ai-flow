/** Contract verification without npm: Fastify route registration must match API catalog. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {operations,operationById,operationByMethodPath,schemas} from '../src/catalog.mjs';
import {buildOpenApi} from '../src/openapi.mjs';
import {registerStudioRoutes} from '../../../apps/api/src/routes.mjs';
import {registerVoicePreviewRoute} from '../../../apps/api/src/voice-preview.mjs';
import {registerSceneVoiceAudioRoute} from '../../../apps/api/src/scene-voice-audio.mjs';
import {registerSceneImageFileRoute} from '../../../apps/api/src/scene-image-file.mjs';
import {registerSceneClipFileRoute} from '../../../apps/api/src/scene-video-file.mjs';
import {registerChannelAvatarRoutes} from '../../../apps/api/src/channel-avatar.mjs';
import {registerVaultRoutes} from '../../../apps/api/src/vault-routes.mjs';
import {installSecurity} from '../../../apps/api/src/security.mjs';
import {inspectIncomingRequest} from '../../../apps/api/src/request-policy.mjs';
import {createSecurityGate} from '../../security/src/index.mjs';

function registry(){
  const paths=new Set(),app={addHook(){}};
  for(const m of ['get','post','put','patch','delete'])app[m]=(p)=>{
    const name=`${m.toUpperCase()} ${p}`;
    assert(!paths.has(name),`duplicate route ${name}`);
    paths.add(name);
  };
  return {app,paths};
}

test('every registered route has exactly one operation and vice versa',()=>{
 const {app,paths}=registry();
 installSecurity(app,{port:4311});
 registerVaultRoutes(app,{vault:{}});
 registerStudioRoutes(app,{controllers:{},store:{},diagnostics:{}});
 registerVoicePreviewRoute(app,{preview(){}});
 registerSceneVoiceAudioRoute(app,{audio(){}});
 registerSceneImageFileRoute(app,{sceneImageBytes(){}});
 registerSceneClipFileRoute(app,{videoClipFile(){}});
 registerChannelAvatarRoutes(app,{});
 // /health is deliberately registered by the server, not route modules.
 // Verify the actual source has not drifted from our contract.
 paths.add('GET /health');
 assert.deepEqual([...paths].sort(),[...operationByMethodPath.keys()].sort());
 assert.equal(operations.length,operationById.size);
 assert.equal(operations.length,operationByMethodPath.size);
});

test('OpenAPI 3.1 operations, security and SSE media match the catalog',()=>{
 const doc=buildOpenApi();assert.equal(doc.openapi,'3.1.0');
 let counted=0;
 for(const [path,methods] of Object.entries(doc.paths)){
   for(const [verb,spec] of Object.entries(methods)){
     counted++;
     const op=operationById.get(spec.operationId);
     assert(op,`${verb} ${path} missing`);
     assert.equal(op.method,verb.toUpperCase());
     assert.equal(path,op.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g,'{$1}'));
     assert.deepEqual(spec.security,op.public?[]:[{SessionBearer:[]}]);
     if(op.stream){assert(spec.responses[200].content['text/event-stream']);assert(spec.parameters.some(p=>p.name==='Last-Event-ID'));}
     else if(op.binaryImage){assert(spec.responses[200].content['image/png']);assert(spec.responses[200].content['image/jpeg']);}
     else if(op.binarySceneImage){assert(spec.responses[200].content['image/png']);assert(spec.responses[200].content['image/jpeg']);assert(spec.responses[200].content['image/webp']);}
     else if(op.binarySceneVideo||op.binaryVideo){assert(spec.responses[200].content['video/mp4']);}
     else if(op.binaryArchive){assert(spec.responses[200].content['application/zip']);}
     else if(op.binaryAudio){assert(spec.responses[200].content['audio/mpeg']);assert(spec.responses[200].content['audio/wav']);}
     else assert(spec.responses[op.created?201:op.accepted?202:200].content['application/json']);
     if(op.method!=='GET'&&!op.public)assert.match(spec.description,/CSRF/);
     if(op.body)assert(spec.requestBody);
   }
 }
 assert.equal(counted,operations.length);
 for(const [name,schema] of Object.entries(schemas))assert(schema&&schema.type,`schema ${name}`);
});

test('GET response contract does not expose credential plaintext fields',()=>{
 const forbidden=new Set(['apiKey','passphrase','secret','bearer','csrf']);
 const inspect=(schema,stack=new Set())=>{
   if(!schema||typeof schema!=='object')return;
   if(schema.$ref){const name=schema.$ref.split('/').at(-1);if(stack.has(name))return;
     inspect(schemas[name],new Set([...stack,name]));return;
   }
   for(const [key,value] of Object.entries(schema.properties??{})){
     assert(!forbidden.has(key),`secret-bearing response field ${key}`);
     inspect(value,stack);
   }
   if(schema.items)inspect(schema.items,stack);
 };
 for(const op of operations.filter(op=>op.method==='GET'))inspect(op.response);
});

test('query parameters in OpenAPI must be allowed by local security gate',()=>{
 const gate=createSecurityGate({port:4311});
 for(const op of operations){
   const path=op.path.replace(':id','test-id');
   const query=Object.keys(op.query??{});
   const url=path+(query.length?`?${query[0]}=${encodeURIComponent(op.query[query[0]].enum?.[0]??'test')}`:'');
   const raw={method:op.method,url,headers:{host:'127.0.0.1:4311'},rawHeaders:['Host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}};
   assert.equal(inspectIncomingRequest(raw,{port:4311,gate}),null,op.id);
 }
});

test('checked-in OpenAPI is freshly generated and has local-only server URL',async()=>{
 const file=JSON.parse(await readFile(new URL('../../../docs/api/openapi.json',import.meta.url),'utf8'));
 assert.deepEqual(file,buildOpenApi());
 assert.equal(file.servers.length,1);
 assert.match(file.servers[0].url,/^http:\/\/127\.0\.0\.1:/);
});

test('unexpected handler failure becomes sanitized 500, not a misleading 400 or stack',async()=>{
 const {app}=registry(),handlers=new Map();
 // Replace GET registration only for the target route: call the real handler
 // with a deliberately broken controller, exercising the HTTP boundary wrapper.
 app.get=(path,fn)=>handlers.set(path,fn);
 registerStudioRoutes(app,{controllers:{channels(){throw new Error('secret private request value')}},store:{}});
 const reply={status:200,code(n){this.status=n;return this},send(value){return value}};
 const result=await handlers.get('/api/channels')({query:{},log:{warn() {}}},reply);
 assert.equal(reply.status,500);
 assert.deepEqual(result,{error:'INTERNAL_ERROR'});
});
