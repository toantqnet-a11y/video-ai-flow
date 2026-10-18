import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {flowState,flowTarget,navigationWarning,productionStages,sceneDraftUnsaved} from './production-flow.mjs';
const src=async file=>readFile(new URL(file,import.meta.url),'utf8');

test('local web flow is four steps; Render goes to existing Timeline instead of a fake route',()=>{
 assert.deepEqual(productionStages.map(s=>s.id),['content','scenes','timeline','render']);
 assert.equal(flowTarget('render'),'timeline');
 assert.equal(flowTarget('unknown'),null);
});
test('flow never claims a master, saved scene or final video without persisted evidence',()=>{
 const unknown=flowState();
 assert.equal(unknown[0].status,'unknown');assert.equal(unknown[1].status,'unknown');
 assert.equal(unknown[2].status,'review');assert.equal(unknown[3].status,'review');
 const approved=flowState({masterApproved:true,sceneRevision:0,sceneCount:5});
 assert.equal(approved[0].status,'done');assert.equal(approved[1].status,'pending');
 const saved=flowState({masterApproved:true,sceneRevision:2,sceneCount:5});
 assert.equal(saved[1].status,'done');assert.match(saved[1].hint,/5 scene/);
 assert.equal(saved[3].status,'review'); // MP4 is not produced by navigation.
 assert.equal(flowState({masterApproved:false,sceneRevision:2,sceneCount:5})[1].status,'pending');
});
test('new auto-split proposal blocks leaving and generation until explicitly saved',async()=>{
 assert.equal(sceneDraftUnsaved(),false);
 assert.equal(sceneDraftUnsaved({changed:false,previewPending:true}),true);
 assert.equal(sceneDraftUnsaved({changed:true,previewPending:false}),true);
 const builder=await src('./SceneBuilderWorkspace.jsx');
 assert.match(builder,/setPreviewPending\(true\)/);
 assert.match(builder,/sceneBuilderDirty:unsaved/);
 assert.match(builder,/disabled=\{unsaved\|\|!state\?\.sceneRevision/);
});
test('leaving unsaved Brief, Master, Scene Builder or Timeline requires confirmation',()=>{
 assert.match(navigationWarning('scenes','content',{contentBriefDirty:true}),/chưa lưu/);
 assert.match(navigationWarning('scenes','content',{masterScriptDirty:true}),/chưa lưu/);
 assert.match(navigationWarning('timeline','scenes',{sceneBuilderDirty:true}),/chưa lưu/);
 assert.match(navigationWarning('scenes','timeline',{timelineWorkspaceDirty:true}),/chưa lưu/);
 assert.equal(navigationWarning('timeline','timeline',{timelineWorkspaceDirty:true}),'');
 assert.equal(navigationWarning('scenes','content',{contentBriefDirty:false}),'');
});
test('Master Script opens server-backed builder; guided Render only scrolls to real drawer',async()=>{
 const master=await src('./MasterScriptWorkspace.jsx');
 const main=await src('./main.jsx');
 const timeline=await src('./TimelineRenderWorkspace.jsx');
 assert.match(master,/onOpenSceneBuilder/);
 assert.doesNotMatch(master,/onCreateScenes/);
 assert.match(main,/onOpenSceneBuilder=/);
 assert.doesNotMatch(main,/useStudio\.getState\(\)\.makeScenes\(/);
 assert.match(main,/<ProductionFlowGuide/);
 assert.match(timeline,/ref=\{renderSectionRef\}/);
 assert.match(timeline,/<RenderDrawerR312/);
});
