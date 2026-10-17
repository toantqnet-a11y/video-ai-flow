/** Authenticated scene image bytes. No publicly served data directory. */
import {DomainError} from '../../../packages/core/src/index.mjs';
export function registerSceneImageFileRoute(app,controllers){
  app.get('/api/scenes/:id/image/file',async(req,reply)=>{
    try{
      const {bytes,format}=await controllers.sceneImageBytes(req.params.id);
      const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[format];
      if(!mime)throw new DomainError('INVALID_IMAGE_FORMAT',409);
      return reply.header('cache-control','no-store, private')
        .header('content-disposition','inline')
        .header('x-content-type-options','nosniff').type(mime).send(bytes);
    }catch(error){
      const status=error instanceof DomainError?error.status:500;
      const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
      req.log?.warn?.({code},'image preview rejected');
      return reply.code(status).header('cache-control','no-store').send({error:code});
    }
  });
}
