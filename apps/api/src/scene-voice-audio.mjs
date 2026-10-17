/** Authenticated, no-store audio playback; no public asset filesystem URLs. */
import {DomainError} from '../../../packages/core/src/index.mjs';
export function registerSceneVoiceAudioRoute(app,voices){
  app.get('/api/scenes/:id/voice/audio',async(req,reply)=>{
    try{
      const {bytes,format}=await voices.audio(req.params.id);
      return reply.header('cache-control','no-store, private')
        .header('content-disposition','inline').header('x-content-type-options','nosniff')
        .type(format==='mp3'?'audio/mpeg':'audio/wav').send(bytes);
    }catch(error){
      const status=error instanceof DomainError?error.status:500;
      const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
      req.log?.warn?.({code},'voice playback rejected');
      return reply.code(status).header('cache-control','no-store').send({error:code});
    }
  });
}
