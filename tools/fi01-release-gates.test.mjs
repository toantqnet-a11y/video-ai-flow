import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dependencyReproducibility} from './fi01-release-preconditions.mjs';
import {REQUIRED_RUNTIME_PACKAGES} from './launcher-core.mjs';

test('FI-01 missing lockfile is BLOCKED, never PASS',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi01-prereq-'));
 try{
  await writeFile(join(root,'package.json'),JSON.stringify({name:'demo',devDependencies:{hyperframes:'0.8.159'}}));
  const r=await dependencyReproducibility(root);assert.equal(r.rendererPin,'PASS');assert.equal(r.lock,'BLOCKED');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('FI-01 stale package lock is FAIL, verified lock may PASS',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi01-prereq-'));
 try{
  await writeFile(join(root,'package.json'),JSON.stringify({name:'demo',devDependencies:{hyperframes:'0.8.159'}}));
  const lock={name:'demo',lockfileVersion:3,packages:{'':{devDependencies:{hyperframes:'0.8.159'}},'node_modules/hyperframes':{version:'0.8.158'}}};
  await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
  assert.equal((await dependencyReproducibility(root)).lock,'FAIL');
  lock.packages['node_modules/hyperframes'].version='0.8.159';
  await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
  assert.equal((await dependencyReproducibility(root)).lock,'PASS');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('FI-01 reject floating latest or range HyperFrames dependency as non-reproducible',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi01-prereq-'));
 try{
  await writeFile(join(root,'package.json'),JSON.stringify({name:'demo',devDependencies:{hyperframes:'^0.8.159'}}));
  const r=await dependencyReproducibility(root);assert.equal(r.rendererPin,'FAIL');assert.equal(r.lock,'BLOCKED');
 }finally{await rm(root,{recursive:true,force:true})}
});

test('FI-01 launcher refuses to call app ready without pinned HyperFrames package',()=>{
 assert.ok(REQUIRED_RUNTIME_PACKAGES.includes('hyperframes'));
 assert.ok(REQUIRED_RUNTIME_PACKAGES.includes('fastify'));
 assert.ok(REQUIRED_RUNTIME_PACKAGES.includes('vite'));
});
