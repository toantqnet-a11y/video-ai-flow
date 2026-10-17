/** Localhost-only preview server. This spike intentionally has no public network interface. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wav':'audio/wav'};
const port = Number(process.env.PORT || 4175);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) {res.writeHead(403); return res.end();}
    const data = await readFile(target);
    res.writeHead(200, {'Content-Type': types[path.extname(target)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.end(data);
  } catch {res.writeHead(404); res.end('Not found');}
}).listen(port, '127.0.0.1', () => console.log(`SP-05 preview: http://127.0.0.1:${port}`));
