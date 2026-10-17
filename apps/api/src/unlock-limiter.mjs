/**
 * Sliding-window unlock throttle. WHY: the vault's scrypt verification is
 * intentionally CPU-expensive, so unauthenticated repeated unlock attempts
 * could be abused to exhaust CPU after session pairing. Lockouts expire
 * (unlike a process-lifetime counter). Requests are serialized separately by
 * the route to stop parallel wrong passwords bypassing the attempt budget.
 */
export function createUnlockLimiter({maxFailures=5,windowMs=60_000,clock=()=>Date.now()}={}) {
  let failures=[];
  return {
    blocked() {
      const now=clock();failures=failures.filter(t=>now-t<windowMs);
      return failures.length>=maxFailures;
    },
    failed() {failures.push(clock());},
    succeeded() {failures=[];},
    status() {return {attemptsRemaining:Math.max(0,maxFailures-failures.length)};}
  };
}
