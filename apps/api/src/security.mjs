/**
 * Local Fastify security boundary. The same onRequest hook guards domain,
 * vault, job and SSE routes: adding a new /api/* route cannot bypass auth.
 * Authentication uses a one-time console pairing code; no tokens in URLs,
 * cookies, disk, application logs, or browser localStorage.
 */
import {createSecurityGate} from '../../../packages/security/src/index.mjs';
import {inspectIncomingRequest} from './request-policy.mjs';

export function installSecurity(app,{port,devFrontend=false}={}) {
  const gate=createSecurityGate({port,devFrontend});
  app.addHook('onRequest',async(request,reply)=>{
    const problem=inspectIncomingRequest(request.raw,{port,gate});
    if(problem) return reply.code(403).send({error:problem});
    // This is the one unauthenticated API route. Check exact HTTP method and
    // canonical path; requests with query parameters were rejected above.
    if(request.url==='/health'||(request.method==='POST'&&request.url==='/api/session/pair')) return;
    if(!request.url.startsWith('/api/')) return; // built static UI is read-only.
    const denied=gate.authorize({authorization:request.raw.headers.authorization,
      csrfHeader:request.raw.headers['x-contentstudio-csrf'],method:request.method});
    if(denied) return reply.code(denied==='AUTH_REQUIRED'?401:403).send({error:denied});
  });
  app.post('/api/session/pair',async(req,reply)=>{
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||typeof body.code!=='string')
      return reply.code(400).send({error:'INVALID_PAIR_REQUEST'});
    const result=gate.pair(body.code);
    if(result.error) return reply.code(result.status).send({error:result.error});
    return reply.header('cache-control','no-store').send(result);
  });
  return gate;
}
