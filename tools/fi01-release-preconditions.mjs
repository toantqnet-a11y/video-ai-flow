/** FI-01: reproducible dependency/renderer prerequisites, independent of
 * machine, npm registry availability, or prior success reports.
 * Status BLOCKED is evidence of a missing step, never a test PASS.
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const json=async file=>JSON.parse(await readFile(file,'utf8'));
export async function dependencyReproducibility(root){
 let manifest;
 try{manifest=await json(join(root,'package.json'));}catch{return {manifest:'FAIL',lock:'BLOCKED',rendererPin:'BLOCKED',reason:'Root package.json is missing or invalid'};}
 const version=manifest.devDependencies?.hyperframes??manifest.dependencies?.hyperframes;
 const rendererPin=typeof version==='string'&&/^\d+\.\d+\.\d+$/.test(version)?'PASS':'FAIL';
 let lock;
 try{lock=await json(join(root,'package-lock.json'));}catch{return {manifest:'PASS',lock:'BLOCKED',rendererPin,rendererVersion:rendererPin==='PASS'?version:null,
  reason:'No committed npm package-lock.json. npm ci is not reproducible until it is generated online and committed.'};}
 // npm workspaces require the lock root entry AND the pinned HyperFrames version
 // in the lock's resolved package, not only in the editable manifest.
 const declared=lock.packages?.['']?.devDependencies?.hyperframes??lock.packages?.['']?.dependencies?.hyperframes;
 const installed=lock.packages?.['node_modules/hyperframes']?.version;
 const consistent=lock.lockfileVersion>=2&&lock.name===manifest.name&&
   declared===version&&installed===version&&rendererPin==='PASS';
 return {manifest:'PASS',lock:consistent?'PASS':'FAIL',rendererPin,
  rendererVersion:rendererPin==='PASS'?version:null,
  reason:consistent?'Committed lockfile matches exact local HyperFrames version':'Lockfile absent, stale, or does not pin the correct HyperFrames package'};
}
