/** R4-04: client-side summaries only from PUBLIC job DTOs; never queue payload. */
export function summarizeJobsR404(jobs=[]){
 if(!Array.isArray(jobs))throw new TypeError('INVALID_JOBS');
 const groups=new Map();const now=Date.now();
 for(const job of jobs){
  if(!job||typeof job.kind!=='string'||typeof job.status!=='string')continue;
  const key=job.kind.split(':')[0]||'unknown';const group=groups.get(key)??{kind:key,total:0,failed:0,running:0,retryable:0,stale:0};
  group.total++;if(job.status==='failed'){group.failed++;group.retryable++;}
  if(job.status==='running')group.running++;
  if(job.status==='pending'&&Number.isFinite(job.availableAt)&&job.availableAt<now-3600000)group.stale++;
  groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>b.failed-a.failed||b.total-a.total||a.kind.localeCompare(b.kind));
}
export function filterPublicJobs(jobs,{search='',kind='all',status='all'}={}){
 const q=search.toLowerCase().trim();if(q.length>100)throw new Error('INVALID_SEARCH');
 return jobs.filter(j=>(kind==='all'||j.kind.split(':')[0]===kind)&&(status==='all'||j.status===status)&&
  (!q||j.id.toLowerCase().includes(q)||j.kind.toLowerCase().includes(q)||String(j.sceneId??'').toLowerCase().includes(q)));
}
