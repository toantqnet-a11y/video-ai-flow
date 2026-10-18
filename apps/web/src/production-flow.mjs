/** Localhost browser production guide. Labels never infer render/AI success from a mock or from mere navigation. */
export const productionStages=Object.freeze([
 {id:'content',tab:'content',label:'Nội dung'},
 {id:'scenes',tab:'scenes',label:'Scenes & Media'},
 {id:'timeline',tab:'timeline',label:'Timeline'},
 {id:'render',tab:'timeline',label:'Xuất MP4'}
]);
export function flowTarget(stage){return productionStages.find(x=>x.id===stage)?.tab??null;}
export function flowState({masterApproved=null,sceneRevision=null,sceneCount=0}={}){
 const content=masterApproved===true;
 const scenes=content&&Number.isInteger(sceneRevision)&&sceneRevision>0&&Number.isInteger(sceneCount)&&sceneCount>0;
 return productionStages.map(stage=>{
  if(stage.id==='content')return {...stage,status:content?'done':masterApproved===null?'unknown':'pending',
   hint:content?'Bản chuẩn đã duyệt':'Duyệt Bản chuẩn trước khi tách scene'};
  if(stage.id==='scenes')return {...stage,status:scenes?'done':sceneRevision===null?'unknown':'pending',
   hint:scenes?String(sceneCount)+' scene đã lưu; tiếp tục tạo voice/media':'Lưu Scene Builder và tạo voice/media'};
  if(stage.id==='timeline')return {...stage,status:'review',
   hint:'Chỉnh sửa, kiểm tra voice/media và phê duyệt Composition'};
  return {...stage,status:'review',hint:'Chỉ xuất khi preflight đạt và bạn chủ động bấm Render'};
 });
}
/** Only leaving an editor risks losing local drafts. Jumping to its render section does not unmount it. */
export function navigationWarning(destination,currentTab,dirty={}){
 if(destination===currentTab)return '';
 if(currentTab==='content'&&(dirty.contentBriefDirty||dirty.masterScriptDirty))return 'Nội dung đang có thay đổi chưa lưu. Rời màn hình?';
 if(currentTab==='scenes'&&dirty.sceneBuilderDirty)return 'Scene Builder đang có thay đổi chưa lưu. Rời màn hình?';
 if(currentTab==='timeline'&&dirty.timelineWorkspaceDirty)return 'Timeline/Inspector có thay đổi chưa lưu. Rời màn hình?';
 return '';
}
