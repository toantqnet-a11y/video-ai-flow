/** FI-02 workspace lock policy: root renderer pin alone is insufficient.
 * Check each workspace's declared deps and npm link against package-lock.
 * npm ci remains the final resolver on the target host.
 */
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {dependencyReproducibility} from './fi01-release-preconditions.mjs';
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const equal=(x,y)=>JSON.stringify(Object.entries(x??{}).sort())===JSON.stringify(Object.entries(y??{}).sort());
export async function verifyWorkspaceLock(root){
 const base=await dependencyReproducibility(root);
 if(base.lock!=='PASS')return {status:base.lock,reason:base.reason,verifiedWorkspaces:0};
 let manifest,lock;
 try{manifest=await readJson(join(root,'package.json'));lock=await readJson(join(root,'package-lock.json'));}
 catch{return {status:'FAIL',reason:'Invalid manifest or npm lock',verifiedWorkspaces:0};}
 const patterns=manifest.workspaces;
 if(!Array.isArray(patterns)||!patterns.length||patterns.some(x=>!['apps/*','packages/*'].includes(x))){
  return {status:'FAIL',reason:'Unexpected or absent npm workspace declaration',verifiedWorkspaces:0};
 }
 let verified=0;
 try{
  for(const pattern of patterns){
   const baseDir=pattern.slice(0,-2);
   for(const name of (await readdir(join(root,baseDir))).sort()){
    const folder=`${baseDir}/${name}`;
    let workspace;
    try{workspace=await readJson(join(root,folder,'package.json'));}
    catch(e){if(e.code==='ENOENT')continue;throw e;}
    const entry=lock.packages?.[folder];
    const link=lock.packages?.[`node_modules/${workspace.name}`];
    if(!workspace.name||!entry||!link||link.link!==true||link.resolved!==folder||
       !equal(workspace.dependencies,entry.dependencies)||
       !equal(workspace.devDependencies,entry.devDependencies)){
      return {status:'FAIL',reason:'Workspace package manifest, lock entry, or npm link differs',verifiedWorkspaces:verified};
    }
    verified++;
   }
  }
 }catch{return {status:'FAIL',reason:'Cannot read or validate one or more workspaces',verifiedWorkspaces:verified};}
 return {status:verified?'PASS':'FAIL',reason:verified?'All workspace manifests and links match lockfile':'No workspace entries found',verifiedWorkspaces:verified};
}
