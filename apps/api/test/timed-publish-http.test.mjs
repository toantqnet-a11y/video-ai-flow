import test from 'node:test';
import assert from 'node:assert/strict';
import {registerStudioRoutes} from '../src/routes.mjs';

// A real publish is async. Return the awaited serializable payload to React,
// never a Promise object masquerading as a successful 201 response.
test('timed Composition publish sends resolved revision, not a Promise',async()=>{
 const routes=new Map(),app={};
 for(const method of ['get','post','patch','put','delete'])app[method]=(path,handler)=>routes.set(method.toUpperCase()+' '+path,handler);
 let resolvePublish;
 const promise=new Promise(resolve=>{resolvePublish=resolve;});
 registerStudioRoutes(app,{controllers:{publishTimedComposition:()=>promise},store:{},diagnostics:{}});
 const handler=routes.get('POST /api/videos/:id/composition/timing/revisions');
 assert.equal(typeof handler,'function');
 let payload,code;
 const reply={code(value){code=value;return this;},send(value){payload=value;return this;}};
 const resultPromise=handler({params:{id:'video-A'},body:{}},reply);
 assert.equal(payload,undefined,'no HTTP body before async publish finishes');
 resolvePublish({revision:7,unchanged:false,composition:{schemaVersion:2,digest:'a'.repeat(64)}});
 await resultPromise;
 assert.equal(code,201);
 assert.deepEqual(payload,{revision:7,unchanged:false,composition:{schemaVersion:2,digest:'a'.repeat(64)}});
 assert.equal(payload instanceof Promise,false);
});
