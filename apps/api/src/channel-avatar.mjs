/** R0 release gap: avatars are read only via paired API, not static /data. */
import {DomainError} from '../../../packages/core/src/index.mjs';
export function registerChannelAvatarRoutes(app,avatar){
  const guard=fn=>async(req,reply)=>{
    try{return await fn(req,reply);}catch(error){
      const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
      const status=error instanceof DomainError?error.status:500;
      req.log.warn({code},'channel avatar request rejected');
      return reply.code(status).send({error:code});
    }
  };
  app.put('/api/channels/:id/avatar',guard(req=>avatar.save(req.params.id,req.body)));
  app.get('/api/channels/:id/avatar',guard((req,reply)=>{
    const data=avatar.read(req.params.id);
    return reply.header('cache-control','private,no-store').header('x-content-type-options','nosniff')
      .type(data.mimeType).send(data.bytes);
  }));
}
