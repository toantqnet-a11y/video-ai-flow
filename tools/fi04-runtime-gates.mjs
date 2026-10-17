#!/usr/bin/env node
/** FI-04-02/03: honest dependency and live frontend/API evidence.
 * --inspect is read-only and offline; --verify performs fixed local checks,
 * never npm installs, invokes cloud AI, or treats mocks as live Fastify.
 */
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyWorkspaceLock} from './fi02-lock-policy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export function safeGateReportPath(root,path){
 const target=resolve(root,path),rel=relative(join(root,'docs','evidence'),target);
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||!target.endsWith('.json'))throw new Error('FI04_UNSAFE_REPORT_PATH');
 return target;
}
export function classifyDependencyGate({lockStatus,installed}){
 if(lockStatus==='FAIL')return 'FAIL';
 return lockStatus!=='PASS'||!installed?'BLOCKED':'PASS';
}
export function moduleInstalled(packageRoot,moduleName){
 try{const r=createRequire(join(packageRoot,'package.json'));r.resolve(`${moduleName}/package.json`);return true;}
 catch(e){
  // Packages can hide package.json behind exports: verify main entry too.
  try{return !!createRequire(join(packageRoot,'package.json')).resolve(moduleName)}catch{return false}
 }
}
export async function inspectRuntime(rootPath=root){
 const lock=await verifyWorkspaceLock(rootPath);
 const vite=moduleInstalled(join(rootPath,'apps','web'),'vite');
 const fastify=moduleInstalled(join(rootPath,'apps','api'),'fastify');
 const hf=moduleInstalled(rootPath,'hyperframes');
 return {lock:{status:lock.status,reason:lock.reason},node:{status:(Number(process.versions.node.split('.')[0])>22||Number(process.versions.node.split('.')[0])===22&&Number(process.versions.node.split('.')[1])>=13)?'PASS':'FAIL',version:process.versions.node},
  vite:{status:classifyDependencyGate({lockStatus:lock.status,installed:vite})},
  fastify:{status:classifyDependencyGate({lockStatus:lock.status,installed:fastify})},
  hyperframes:{status:classifyDependencyGate({lockStatus:lock.status,installed:hf})}};
}
function command(file,args,timeoutMs){
 const start=Date.now(),isNpm=file==='npm';const cmd=isNpm&&process.platform==='win32'?'npm.cmd':file;
 const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:timeoutMs,shell:isNpm&&process.platform==='win32',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,CI:'1'}});
 return {status:r.status===0&&!r.error?'PASS':'FAIL',exitCode:r.status??null,errorCode:r.error?.code??null,elapsedMs:Date.now()-start};
}
export function acceptanceStatus(gates){return Object.values(gates).every(x=>x.status==='PASS')?'PASS':'NOT_READY';}
async function main(){
 const argv=process.argv.slice(2),valid=['--inspect','--verify','--strict'];
 if(argv.some(s=>!valid.includes(s)&&!s.startsWith('--report='))||argv.filter(x=>['--inspect','--verify'].includes(x)).length>1||argv.filter(x=>x.startsWith('--report=')).length>1)throw new Error('FI04_UNSUPPORTED_ARGUMENTS');
 const verify=argv.includes('--verify'),strict=argv.includes('--strict');const reportArg=argv.find(x=>x.startsWith('--report='))?.slice(9);
 const deps=await inspectRuntime(root);
 const gates={node:deps.node,dependencyLock:deps.lock,vite:deps.vite,fastify:deps.fastify,hyperframes:deps.hyperframes};
 // --verify checks real commands only when all prerequisites are verified.
 // Merely having an offline code smoke is NOT frontend/HTTP acceptance.
 for(const id of ['frontendBuild','liveFastifyHttp'])gates[id]={status:'BLOCKED',detail:'Not executed; run --verify with verified npm dependencies'};
 if(verify){
  if(['dependencyLock','vite','fastify','hyperframes'].every(k=>gates[k].status==='PASS')){
   gates.frontendBuild=command('npm',['run','build:web'],180000);
   gates.liveFastifyHttp=command('npm',['run','test:live-http'],180000);
  }else{
   gates.frontendBuild.detail='Dependency/lock prerequisites BLOCKED, not a fake build success';
   gates.liveFastifyHttp.detail='Dependency/lock prerequisites BLOCKED, not an offline mock';
  }
 }
 const status=acceptanceStatus(gates);
 const report={schemaVersion:1,task:'FI-04-02/FI-04-03',timestamp:new Date().toISOString(),platform:process.platform,mode:verify?'verify':'inspect',status,gates,
  caveat:'This is only dependency/build/live-HTTP acceptance, NOT HyperFrames render, Windows UX, provider or 35min release certification.'};
 if(reportArg){const target=safeGateReportPath(root,reportArg);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2)+'\n')}
 console.log(JSON.stringify(report,null,2));
 if(strict&&status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
