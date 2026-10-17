/** R3-11 portable project ZIP exporter. No paid work, no new queue or DB table.
 * Export is based on an approved immutable Composition, not unsaved editor data.
 * Build completely into a private temp file before exposing a response stream.
 */
import {randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,realpath,lstat,rm} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {projectZipEntries,writeZip64} from '../../../packages/core/src/project-zip-r311.mjs';
import {DomainError} from '../../../packages/core/src/domain.mjs';
const bad=(code,status=409)=>{throw new DomainError(code,status)};
export class ProjectZipServiceR311{
 constructor({repo,compositions,manifest}){this.repo=repo;this.compositions=compositions;this.manifest=manifest;}
 async export(videoId,revision){
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(videoId??'')||!this.repo.getVideo(videoId))bad('PROJECT_ZIP_VIDEO_NOT_FOUND',404);
  if(!Number.isSafeInteger(revision)||revision<1)bad('PROJECT_ZIP_INVALID_REVISION',400);
  const snapshot=this.compositions.revision(videoId,revision);
  const document=snapshot.composition;
  if(document.videoId!==videoId)bad('PROJECT_ZIP_WRONG_VIDEO',404);
  const prepared=await projectZipEntries({composition:document,revision,dataRoot:this.manifest.dataRoot,
   videoTitle:this.repo.getVideo(videoId).title});
  const dataRoot=await realpath(this.manifest.dataRoot),dir=join(dataRoot,'exports',videoId);
  await mkdir(dir,{recursive:true,mode:0o700});
  // Never follow an attacker-planted symlink in the private export directory.
  const actualDir=await realpath(dir);
  if(actualDir!==dir||!actualDir.startsWith(dataRoot+sep))bad('PROJECT_ZIP_UNSAFE_DIRECTORY');
  const archive=join(dir,`.project-${randomUUID()}.zip`);
  try{
   const result=await writeZip64(prepared.entries,archive);
   const file=await lstat(archive);
   if(!file.isFile()||file.isSymbolicLink()||BigInt(file.size)!==result.bytes)bad('PROJECT_ZIP_INVALID_OUTPUT');
   // The stream is created only after verifying the entire archive is complete.
   return {path:archive,stream:createReadStream(archive),size:file.size,
     filename:`ContentStudio-${videoId}-r${revision}.zip`,items:result.entries};
  }catch(error){await rm(archive,{force:true}).catch(()=>{});throw error;}
 }
}
