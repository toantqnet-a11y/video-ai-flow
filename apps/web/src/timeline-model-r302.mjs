/** R3-02: viewport virtualization uses absolute times, not 500 scene DOM nodes.
 * This module is browser-independent so large manifests can be stress-tested.
 */
export const formatTimelineTime=ms=>{
 const seconds=Math.floor(Math.max(0,ms)/1000),tenths=Math.floor((Math.max(0,ms)%1000)/100);
 return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}.${tenths}`;
};
export function sceneAtTime(scenes,ms){
 if(!scenes?.length)return null;
 const position=Math.max(0,Math.min(ms,scenes[scenes.length-1].endMs));
 let low=0,high=scenes.length-1;
 while(low<=high){const mid=(low+high)>>1,s=scenes[mid];
  if(position<s.startMs)high=mid-1;
  else if(position>=s.endMs&&mid<scenes.length-1)low=mid+1;
  else return s;
 }
 return scenes.at(-1);
}
export function visibleTimelineScenes(scenes,{scrollLeft=0,viewportWidth=900,pixelsPerSecond=45,overscanPx=600}={}){
 if(!Number.isFinite(pixelsPerSecond)||pixelsPerSecond<=0)throw Error('INVALID_TIMELINE_SCALE');
 const pxPerMs=pixelsPerSecond/1000;
 const left=Math.max(0,(scrollLeft-overscanPx)/pxPerMs),right=(scrollLeft+viewportWidth+overscanPx)/pxPerMs;
 let low=0,high=scenes.length;
 while(low<high){const mid=(low+high)>>1;if(scenes[mid].endMs<left)low=mid+1;else high=mid;}
 const first=low,visible=[];
 for(let i=first;i<scenes.length&&scenes[i].startMs<=right;i++)visible.push(scenes[i]);
 return visible;
}
export function moveSceneOrder(order,fromId,toId){
 if(!order.includes(fromId)||!order.includes(toId))throw Error('SCENE_NOT_FOUND');
 if(fromId===toId)return [...order];
 const next=order.filter(id=>id!==fromId);
 next.splice(next.indexOf(toId),0,fromId);
 return next;
}
export function moveSceneByOffset(order,id,delta){
 const from=order.indexOf(id);if(from<0)throw Error('SCENE_NOT_FOUND');
 const to=Math.max(0,Math.min(order.length-1,from+delta));
 if(from===to)return [...order];
 const next=[...order];next.splice(to,0,next.splice(from,1)[0]);return next;
}
/** A draft can be previewed and reverted, but no save changes source scene idx. */
export function orderManifest(manifest,order){
 const lookup=new Map(manifest.scenes.map(s=>[s.id,s]));
 let cursor=0;
 return {...manifest,scenes:order.map((id,index)=>{
  const scene=lookup.get(id);if(!scene)throw Error('TIMELINE_ORDER_MISMATCH');
  const startMs=cursor;cursor+=scene.durationMs;
  return {...scene,index,startMs,endMs:cursor};
 }),totalDurationMs:cursor};
}
