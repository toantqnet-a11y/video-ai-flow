/** Test-only fixtures simulate server outputs; they are NOT generative video. */
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

export const fixtureWorkflow = {
  '10': {class_type:'CLIPTextEncode', inputs:{text:'original'}},
  '21': {class_type:'EmptyVideoLatent', inputs:{length:10, seed:1, width:512, height:288}},
  '31': {class_type:'LoadImage',inputs:{image:'fixture.png'}},
};
export const bindings = {prompt:{nodeId:'10', input:'text'}, durationSeconds:{nodeId:'21',input:'length',transform:'frames'},
  seed:{nodeId:'21',input:'seed'},image:{nodeId:'31',input:'image'}};
export const minimalPng = Buffer.from('89504e470d0a1a0a' + '0000000d49484452000000010000000108060000001f15c489' +
  '0000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');

export async function createVideoFixture() {
  const root = await mkdtemp(join(tmpdir(),'spvid01-'));
  const inputPath = join(root,'mock-provider-video.mp4');
  await run('ffmpeg', ['-v','error','-y','-f','lavfi','-i','color=c=blue:s=256x144:r=12', '-t','1',
    '-an','-c:v','mpeg4','-q:v','5','-pix_fmt','yuv420p',inputPath]);
  return {root,inputPath,bytes:await readFile(inputPath)};
}
export async function fakeComfy({bytes, onPrompt, onHistory, onView, status=200} = {}) {
  const calls = [];
  const server = createServer(async (req,res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const chunks=[];
    for await (const x of req) chunks.push(x);
    const body=Buffer.concat(chunks);
    calls.push({method:req.method,url:url.pathname+url.search,body});
    const writeJson = (obj, code=200) => {res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(obj));};
    if (url.pathname === '/prompt' && req.method === 'POST') {
      if (onPrompt) return onPrompt({req,res,body,calls,writeJson});
      return writeJson({prompt_id:'12345678-1234-1234-1234-123456789123'});
    }
    if (url.pathname === '/upload/image') return writeJson({name:'reference.png', subfolder:'', type:'input'});
    if (url.pathname.startsWith('/history/')) {
      if (onHistory) return onHistory({req,res,body,calls,writeJson});
      const id=url.pathname.split('/').at(-1);
      return writeJson({[id]:{status:{status_str:'success'},outputs:{'88':{gifs:[{filename:'video_00001.mp4',subfolder:'',type:'output'}]}}}});
    }
    if (url.pathname === '/view') {
      if (onView) return onView({req,res,body,calls,writeJson});
      res.writeHead(status,{'content-type':'video/mp4','content-length':bytes.length});res.end(bytes);return;
    }
    if (url.pathname === '/system_stats') return writeJson({devices:[{name:'mock device',type:'cuda',vram_total:1}]});
    return writeJson({error:'not found'},404);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`, calls,
    close:()=>new Promise(resolve=>server.close(resolve))};
}
