/** R2-VID-05: private selected MP4 preview. Built-in same-origin bearer
 * security hook applies before the route; never serve /data statically.
 */
import {DomainError} from '../../../packages/core/src/index.mjs';
export function registerSceneClipFileRoute(app,controllers){
 app.get('/api/scenes/:id/video/file',async(req,reply)=>{
  try{
   const {bytes}=await controllers.videoClipFile(req.params.id);
   return reply.header('cache-control','private, no-store')
    .header('content-disposition','inline; filename="scene.mp4"')
    .header('x-content-type-options','nosniff')
    .header('content-length',bytes.length)
    .type('video/mp4').send(bytes);
  }catch(error){
   const status=error instanceof DomainError?error.status:500;
   const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
   req.log?.warn?.({code},'clip playback refused');
   return reply.code(status).header('cache-control','no-store').send({error:code});
  }
 });
}
