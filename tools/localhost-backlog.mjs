/**
 * Project scope adapter for the canonical 69-task FI-04 backlog.
 * Keep historical source roadmaps and GitHub-hosted Windows evidence intact;
 * normalize only live release prerequisites for a browser-served localhost app.
 */
export function normalizeLocalhostBacklog(legacy,policy){
 if(!legacy || !Array.isArray(legacy.tasks) || legacy.tasks.length!==69 ||
    legacy.taskCount!==legacy.tasks.length) throw new Error('LOCALHOST_BAD_SOURCE_BACKLOG');
 if(!policy || !Array.isArray(policy.gateReplacements) ||
    !Array.isArray(policy.statusReplacements) || !policy.taskOverrides)
  throw new Error('LOCALHOST_BAD_POLICY');
 const seen=new Set();
 const tasks=legacy.tasks.map(task=>{
  if(!task?.id || seen.has(task.id)) throw new Error('LOCALHOST_DUPLICATE_TASK');
  seen.add(task.id);
  // Status records keep prior hosted-CI evidence; only pending target-host
  // labels are rewritten. Do not turn historical PASS into a new local PASS.
  let status=task.status;
  for(const [from,to] of policy.statusReplacements) status=status.replaceAll(from,to);
  const gates=(task.remainingGate||[]).map(original=>{
   let gate=original;
   for(const [from,to] of policy.gateReplacements)gate=gate.replaceAll(from,to);
   return gate;
  });
  const override=policy.taskOverrides[task.id]||{};
  return {...task,status,remainingGate:gates,...override};
 });
 const unknown=Object.keys(policy.taskOverrides).filter(id=>!seen.has(id));
 if(unknown.length)throw new Error('LOCALHOST_UNKNOWN_TASK_OVERRIDE: '+unknown.join(','));
 for(const milestone of policy.milestones||[]){
  if((milestone.required||[]).some(id=>!seen.has(id)))
   throw new Error('LOCALHOST_UNKNOWN_MILESTONE_DEPENDENCY: '+milestone.name);
 }
 for(const task of tasks){
  if((task.remainingGate||[]).some(gate=>/Windows(?: 10| 11)?/i.test(gate)))
   throw new Error('LOCALHOST_OS_SPECIFIC_RELEASE_GATE: '+task.id);
 }
 const constraints=[...new Set([...(legacy.constraints||[]).filter(c=>!policy.constraintsRemove.includes(c)),...policy.constraintsAdd])];
 // WI IDs are retained for history, but they now represent local-web runtime
 // acceptance rather than Windows-specific release requirements.
 const {windowsAcceptance,...existingGroups}=legacy.groups;
 const groups={...existingGroups,localRuntimeAcceptance:windowsAcceptance};
 return {...legacy,version:policy.version,status:policy.status,
  groups,constraints,scope:policy.scope,milestones:policy.milestones,
  taskCount:tasks.length,tasks,
  // Provenance is intentionally preserved: an old Windows CI success is not
  // proof of authenticated end-user browser acceptance on the local host.
  statusEvidence:{...legacy.statusEvidence,scopeReconciliation:'2026-10-18: historical Windows-hosted runs retained; localhost browser is the product acceptance target'},
  note:'Localhost React/Vite + Fastify web app (not a Windows desktop executable). Legacy task IDs and hosted-CI evidence retained. No release without real browser/media/AI (where enabled)/performance gates.'
 };
}
