/** WI-02 ephemeral Fastify worker. IPC communicates lifecycle only, never
 * pairing code, cookie, token, prompt or an API response. Parent drops stdout.
 * Uses the real API entrypoint, single SP-04 queue and a disposable SQLite DB.
 */
import {startApi} from '../apps/api/src/server.mjs';
let runtime=null,stopping=false;
async function stop(){
 if(stopping)return;
 stopping=true;
 try{await runtime?.app.close();process.send?.({type:'stopped'});process.exit(0)}
 catch{process.exit(1)}
}
process.on('message',msg=>{if(msg?.type==='stop')void stop()});
process.on('SIGTERM',()=>{void stop()});
try{
 runtime=await startApi({listen:true});
 if(stopping){await stop()}else process.send?.({type:'ready'});
}catch{
 // Detailed errors can include local paths or config; do not export secrets.
 process.send?.({type:'startup_error'});
 process.exit(2);
}
