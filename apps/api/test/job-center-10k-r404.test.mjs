import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createJobCenter} from '../src/job-center.mjs';

/** R4-04: load test against real indexed SQLite queries; no fake provider calls.
 * Private prompt/provider fields may exist in queued jobs but MUST NOT leave
 * the sanitized public job projection under filters or pagination.
 */
test('R4-04 10k-job list maintains bounded paging and public metadata only',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE jobs(id TEXT PRIMARY KEY,kind TEXT,status TEXT,priority INTEGER,attempt INTEGER,max_attempts INTEGER,created_at INTEGER,updated_at INTEGER,available_at INTEGER,last_error TEXT,payload_json TEXT)');
  db.exec('CREATE INDEX idx_jobs_created ON jobs(created_at DESC,id DESC)');
  const insert=db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for(let i=0;i<10000;i++)insert.run('job-'+String(i).padStart(5,'0'),'render:ffmpeg',i%7?'succeeded':'failed',0,1,2,i,i,i,null,
   JSON.stringify({projectId:'video-'+(i%3),sceneId:'scene-'+(i%20),prompt:'private prompt',apiKey:'private key',workerLease:'secret'}));
  db.exec('COMMIT');
  const store={
   db,fromRow:r=>({...r,payload:JSON.parse(r.payload_json)}),
   countByStatus:()=>({total:10000}),
   get:id=>null
  };
  const center=createJobCenter(store);
  const first=center.list({limit:'100',cursor:'0'});
  assert.equal(first.items.length,100);assert.equal(first.nextCursor,'100');
  assert.equal(first.items[0].id,'job-09999');
  const last=center.list({limit:'100',cursor:'9900'});
  assert.equal(last.items.length,100);assert.equal(last.nextCursor,null);
  assert.equal(last.items[99].id,'job-00000');
  assert.equal(new Set([...first.items,...last.items].map(x=>x.id)).size,200);
  assert.ok(!JSON.stringify(first.items).includes('private'));
  const filtered=center.list({videoId:'video-1',status:'failed',limit:'80'});
  assert.ok(filtered.items.length>0&&filtered.items.length<=80);
  assert.ok(filtered.items.every(x=>x.projectId==='video-1'&&x.status==='failed'));
  assert.ok(!JSON.stringify(filtered.items).includes('apiKey'));
  assert.throws(()=>center.list({cursor:'1000001'}),{code:'INVALID_JOB_CURSOR'});
  assert.throws(()=>center.list({limit:'101'}),{code:'INVALID_JOB_LIMIT'});
 }finally{db.close()}
});
