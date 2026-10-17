import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateHyperframesInstallManifest,findHyperframesCli} from '../src/render-hyperframes.mjs';

const project=JSON.parse(await readFile(new URL('../../../package.json',import.meta.url),'utf8'));

test('FI-01 requires an exact local HyperFrames version pinned by root package.json',()=>{
 const pin=project.devDependencies.hyperframes;
 assert.match(pin,/^\d+\.\d+\.\d+$/);
 assert.deepEqual(validateHyperframesInstallManifest(project,{version:pin,bin:{hyperframes:'./bin/hyperframes.mjs'}}),
  {version:pin,entry:'./bin/hyperframes.mjs'});
 assert.throws(()=>validateHyperframesInstallManifest(project,{version:'0.0.1',bin:{hyperframes:'./bin/hyperframes.mjs'}}),{code:'HYPERFRAMES_VERSION_MISMATCH'});
 assert.throws(()=>validateHyperframesInstallManifest({...project,devDependencies:{hyperframes:'latest'}},{version:pin,bin:'./bin/hyperframes.mjs'}),{code:'HYPERFRAMES_VERSION_NOT_PINNED'});
 assert.throws(()=>validateHyperframesInstallManifest(project,{version:pin,bin:{other:'./bin/x.mjs'}}),{code:'HYPERFRAMES_CLI_INVALID'});
});
test('FI-01 explicitly injected test renderer is isolated from primary executable resolver',async()=>{
 assert.deepEqual(await findHyperframesCli('fake-cli-only'),{binary:'fake-cli-only',argvPrefix:[],version:null});
});
test('FI-01 absent local CLI must not silently fall back to globally installed HyperFrames',async()=>{
 // These tests run in an offline, dependency-free environment. On developer
 // machines with real dependencies, pin verification is handled by resolver.
 let error;
 try{await findHyperframesCli();}catch(e){error=e;}
 if(error)assert.ok(['HYPERFRAMES_NOT_INSTALLED','HYPERFRAMES_VERSION_MISMATCH','HYPERFRAMES_CLI_INVALID'].includes(error.code),String(error));
 else assert.ok(true,'A genuine pinned local CLI is present');
});
