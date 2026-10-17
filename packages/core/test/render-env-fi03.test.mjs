import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizedRendererEnv} from '../src/render-hyperframes.mjs';

test('FI-03 HyperFrames subprocess does not inherit API keys or pairing secrets',()=>{
 const incoming={PATH:'/bin',HOME:'/tmp',OPENAI_API_KEY:'secret',CONTENTSTUDIO_API_KEY:'secret',
  CONTENTSTUDIO_PAIRING_CODE:'hidden',AWS_SECRET_ACCESS_KEY:'private',HTTP_PROXY:'http://proxy',
  HYPERFRAMES_NO_TELEMETRY:'0'};
 const env=sanitizedRendererEnv(incoming);
 assert.equal(env.PATH,'/bin');assert.equal(env.HOME,'/tmp');
 assert.equal(env.OPENAI_API_KEY,undefined);
 assert.equal(env.CONTENTSTUDIO_PAIRING_CODE,undefined);
 assert.equal(env.AWS_SECRET_ACCESS_KEY,undefined);
 assert.equal(env.HTTP_PROXY,undefined);
 assert.equal(env.HYPERFRAMES_NO_TELEMETRY,'1');
 assert.deepEqual(Object.keys(env).sort(),['PATH','HOME','HYPERFRAMES_NO_TELEMETRY','HYPERFRAMES_NO_UPDATE_CHECK','DO_NOT_TRACK'].sort());
});
test('FI-03 Windows child process inherits environment required for Chromium process startup',()=>{
 const env=sanitizedRendererEnv({Path:'C:\\Windows',SystemRoot:'C:\\Windows',TEMP:'C:\\Temp',USERPROFILE:'C:\\Users\\test'});
 assert.equal(env.SystemRoot,'C:\\Windows');assert.equal(env.USERPROFILE,'C:\\Users\\test');
});
