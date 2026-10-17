/**
 * Minimal framework-neutral HTTP read layer for a future Fastify backend.
 * GET reconciliation is authoritative; outbox SSE allows missed-event replay.
 * This PoC intentionally does not expose write operations or secrets over HTTP.
 */
import { createServer } from 'node:http';

export function createQueueServer(store, { pollMs = 250 } = {}) {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, data) => {
      res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      res.end(JSON.stringify(data));
    };
    if (req.method !== 'GET') return json(405, { error:'METHOD_NOT_ALLOWED' });
    if (url.pathname === '/api/jobs/summary') return json(200, store.countByStatus());
    if (url.pathname === '/api/jobs') return json(200,store.list({ status:url.searchParams.get('status') || undefined,limit:Math.min(500,Number(url.searchParams.get('limit')||100)) }));
    if (url.pathname === '/api/events') {
      const after = Number(url.searchParams.get('after') || 0);
      if (!Number.isSafeInteger(after) || after<0) return json(400,{error:'BAD_CURSOR'});
      return json(200,{events:store.events({after,limit:200})});
    }
    if (url.pathname !== '/api/events/stream') return json(404,{error:'NOT_FOUND'});
    // EventSource automatically sends Last-Event-ID on reconnect; query cursor
    // allows clients that previously persisted their cursor to resume too.
    const rawCursor = req.headers['last-event-id'] || url.searchParams.get('after') || '0';
    let cursor = Number(rawCursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0) return json(400,{error:'BAD_CURSOR'});
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','connection':'keep-alive'});
    const flush = () => {
      try {
        for (const e of store.events({after:cursor,limit:1000})) {
          res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
          cursor=e.seq;
        }
        res.write(': heartbeat\n\n');
      } catch { res.end(); }
    };
    flush();
    const interval = setInterval(flush,pollMs);
    req.on('close',()=>clearInterval(interval));
  });
}
