import test from 'node:test';
import assert from 'node:assert/strict';
import {planLauncherInstall} from './fi03-launcher-install.mjs';

test('FI-03 locked and dependency-free launch invokes deterministic npm ci',()=>{
  assert.deepEqual(planLauncherInstall({status:'PASS'},{dependenciesPresent:false}),['ci','--no-audit','--no-fund']);
});
test('FI-03 preinstalled dependencies avoid reinstall only when lock is valid',()=>{
  assert.equal(planLauncherInstall({status:'PASS'},{dependenciesPresent:true}),null);
  for(const status of ['FAIL','BLOCKED'])assert.throws(()=>planLauncherInstall({status},{dependenciesPresent:true}),{code:'PACKAGE_LOCK_UNVERIFIED'});
});
test('FI-03 unknown/missing lock status cannot turn into an install plan',()=>{
  for(const value of [null,{}, {lock:'PASS'},{status:'READY'}]){
    assert.throws(()=>planLauncherInstall(value),{code:'LOCK_CHECK_INVALID'});
  }
  assert.throws(()=>planLauncherInstall({status:'PASS'},{skipInstall:true}),{code:'DEPENDENCIES_MISSING_SKIP_INSTALL'});
});
