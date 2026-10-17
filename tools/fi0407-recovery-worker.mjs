/** Disposable child used to test real OS process termination and SQLite lease recovery.
 * Never writes MP4, never contacts any provider. This is *not* long-render QA. */
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
const db=process.argv[2];if(!db)throw Error('FI0407_DB_REQUIRED');
const store=new JobStore({path:db,leaseMs:500,baseBackoffMs:0});
const runner=new JobRunner(store,{'render:hyperframes':async()=>new Promise(()=>{})},{concurrency:1,pollMs:20,heartbeatMs:100});
runner.start();
