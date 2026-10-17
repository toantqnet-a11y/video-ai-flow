import test from 'node:test';import assert from 'node:assert/strict';
import {bytesLabel,assetCanRestore,assetPlanLabel} from './asset-library-view.mjs';
test('R2-09 never offers restore of corrupt, missing or already-selected revisions',()=>{
 assert.equal(assetCanRestore({kind:'image',state:'committed',health:'healthy',selected:false}),true);
 for(const health of ['missing','corrupt','unsafe','unknown'])assert.equal(assetCanRestore({kind:'image',state:'committed',health,selected:false}),false);
 assert.equal(assetCanRestore({kind:'voice',state:'committed',health:'healthy'}),false);
 assert.equal(assetCanRestore({kind:'image',state:'committed',health:'healthy',selected:true}),false);
});
test('R2-09 readable size and state labels',()=>{
 assert.equal(bytesLabel(1024),'1 KiB');assert.equal(bytesLabel(1048576),'1.0 MiB');
 assert.equal(assetPlanLabel.manual_preserved,'Giữ ảnh thủ công');
});
