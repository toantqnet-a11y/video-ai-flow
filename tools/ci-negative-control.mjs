/** R0-14: prove CI does not silently swallow a failing test. */
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--test','tools/fixtures/intentional-failure.test.mjs'],{
  encoding:'utf8',env:process.env
});
if(result.error||result.status===0||!/not ok/.test(result.stdout??'')) {
 console.error('FAIL: the deliberate regression was not detected');process.exit(1);
}
console.log('PASS: deliberate regression produced a nonzero test exit and a TAP "not ok" result.');
