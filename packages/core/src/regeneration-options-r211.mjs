/** Stable, bounded R2-11 dedupe signature of user-supplied media options.
 * An already-used requestKey cannot silently change model/voice/seed/consent.
 */
import {createHash} from 'node:crypto';
export function regenerationOptionsHash(body){
  const entries=Object.entries(body).filter(([key])=>key!=='regenerationKey').sort(([a],[b])=>a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}
