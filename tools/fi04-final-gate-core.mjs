/** FI-04-06..10 common fail-closed evidence helpers. These helpers never turn
 * an inspect-only result, an imported media file or historical TAP log into
 * proof that a production renderer/provider was exercised this invocation. */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {safeGateReportPath} from './fi04-runtime-gates.mjs';
export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function sha256File(path){return new Promise((yes,no)=>{const h=createHash('sha256');const file=createReadStream(path);file.on('data',d=>h.update(d));file.on('error',no);file.on('end',()=>yes(h.digest('hex')));});}
export function gate(pass,detail){return {status:pass?'PASS':'BLOCKED',detail};}
export function options(argv,flags,values=[]){
 const out={};for(const x of argv){if(!x.startsWith('--'))throw Error('FI04_UNSUPPORTED_ARGUMENT');
  const pos=x.indexOf('='),key=x.slice(2,pos<0?undefined:pos),val=pos<0?true:x.slice(pos+1);
  if(out[key]!==undefined||!flags.includes(key)&&!values.includes(key)||flags.includes(key)&&val!==true||values.includes(key)&&(!val||val===true))throw Error('FI04_UNSUPPORTED_ARGUMENT');out[key]=val;
 }return out;
}
export async function reportFile(name,report){if(!name)return;const target=safeGateReportPath(ROOT,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2)+'\n',{mode:0o600});}
export function sanitizeError(e){return String(e?.code??e?.message??'FI04_UNEXPECTED').replace(/[^A-Z0-9_]/g,'_').slice(0,90);}
export function output(report,strict=true){console.log(JSON.stringify(report,null,2));if(strict&&report.status!=='PASS')process.exitCode=1;}
export function timestamp(){return new Date().toISOString();}
