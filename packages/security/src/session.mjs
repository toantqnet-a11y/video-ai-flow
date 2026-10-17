/**
 * Local-only pairing for a browser UI. The one-time 16-char startup code is
 * shown only in the foreground terminal (not log files or HTTP pages). The
 * browser exchanges it once for random memory-only bearer/CSRF tokens.
 * The user must pair again after server restart; no permanent secrets in JS.
 */
import {randomBytes,timingSafeEqual} from 'node:crypto';

const randomSecret=(n=24)=>randomBytes(n).toString('base64url');
const secureEqual=(a,b)=>{
  if(typeof a!=='string'||typeof b!=='string') return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
};
export function createSecurityGate({port=4311,devFrontend=false}={}) {
  const pairCode=randomSecret(12),bearer=randomSecret(),csrf=randomSecret();
  let paired=false,attempts=0;
  const canonical=`http://127.0.0.1:${port}`;
  return {
    // Do not expose this value to any HTTP response or persistent debug log.
    pairingCodeForTerminal:()=>paired?null:pairCode,
    verifyTransport({host,origin,peer,forwarded}) {
      if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)) return 'NOT_LOOPBACK';
      if(host!==`127.0.0.1:${port}`) return 'BAD_HOST';
      if(forwarded) return 'FORWARDED_HEADERS_NOT_ALLOWED';
      if(origin&&origin!==canonical&&!(devFrontend&&origin==='http://127.0.0.1:5173')) return 'INVALID_ORIGIN';
      return null;
    },
    pair(code) {
      if (paired) return {error:'ALREADY_PAIRED',status:409};
      if (attempts>=5) return {error:'PAIRING_LOCKED',status:429};
      attempts++;
      if (!secureEqual(code,pairCode)) return {error:'INVALID_PAIR_CODE',status:401};
      paired=true;
      return {bearer,csrf};
    },
    authorize({authorization,csrfHeader,method}) {
      if(!paired||!secureEqual(authorization,`Bearer ${bearer}`)) return 'AUTH_REQUIRED';
      if(!['GET','HEAD'].includes(method)&&!secureEqual(csrfHeader,csrf)) return 'CSRF_REQUIRED';
      return null;
    }
  };
}
