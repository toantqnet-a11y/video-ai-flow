import test from 'node:test';
import assert from 'node:assert/strict';
import {createSecurityGate} from '../../../packages/security/src/session.mjs';
import {handleOperatorCommand} from '../src/operator-console.mjs';

test('only local pair command rotates credentials; browser old sessions revoked',()=>{
 const security=createSecurityGate(),oldCode=security.pairingCodeForTerminal();
 const old=security.pair(oldCode);
 const lines=[],write=part=>lines.push(part);
 assert.equal(handleOperatorCommand('help',{security,write}),'HELP');
 assert.equal(handleOperatorCommand('  ',{security,write}),'IGNORED');
 assert.equal(handleOperatorCommand('PAIR',{security,write}),'REARMED');
 const newCode=security.pairingCodeForTerminal();
 assert.ok(newCode&&newCode!==oldCode);
 assert.equal(security.authorize({authorization:`Bearer ${old.bearer}`,method:'GET'}),'AUTH_REQUIRED');
 assert.ok(lines.join('').includes(newCode),'new code is shown only in local operator output');
 const newer=security.pair(newCode);
 assert.ok(newer.bearer!==old.bearer);
});
test('unknown terminal commands never echo pasted secrets or rearm',()=>{
 const security=createSecurityGate(),firstCode=security.pairingCodeForTerminal();
 const output=[];const secret='secret-pasted-credential-123456';
 assert.equal(handleOperatorCommand(secret,{security,write:x=>output.push(x)}),'IGNORED');
 assert.equal(security.pairingCodeForTerminal(),firstCode);
 assert.ok(!output.join('').includes(secret));
 assert.throws(()=>handleOperatorCommand(null,{security,write:()=>{}}),/OPERATOR_CONSOLE_INVALID/);
});
