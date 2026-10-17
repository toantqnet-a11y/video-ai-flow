/**
 * Pure video-override draft helpers. R0-11 keeps all editing in-memory until
 * a preview+save; no changed setting can trigger provider jobs on keystrokes.
 */
export const editableVideoConfig=[
  ['content','style','Văn phong','text'],
  ['content','tone','Giọng điệu','text'],
  ['content','targetMinutes','Thời lượng mục tiêu (phút)','number'],
  ['content','basePrompt','Prompt bổ sung cho video','textarea'],
  ['voice','voice','Giọng đọc','voice'],
  ['voice','speed','Tốc độ đọc','decimal'],
  ['media','mode','Loại media','mode'],
  ['media','style','Phong cách hình ảnh','text'],
  ['media','sceneSeconds','Scene mặc định (giây)','number'],
  ['render','fps','FPS','fps'],
  ['render','subtitles','Hiển thị phụ đề','boolean'],
];
export const cloneOverrides=(value={})=>structuredClone(value);
export function setVideoOverride(overrides,group,key,value,sourcePreset){
  const draft=cloneOverrides(overrides);
  if(value===undefined||JSON.stringify(value)===JSON.stringify(sourcePreset[group]?.[key])){
    if(draft[group]){delete draft[group][key];if(!Object.keys(draft[group]).length)delete draft[group];}
  }else draft[group]={...draft[group],[key]:value};
  return draft;
}
export function currentOverrideValue(config,overrides,group,key){
  return Object.hasOwn(overrides[group]??{},key)?overrides[group][key]:config.sourcePreset[group][key];
}
