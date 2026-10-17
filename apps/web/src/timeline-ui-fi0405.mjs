/** FI-04-05: browser-independent safety rules for a keyboard-operable timeline.
 * Seek never mutates source media or produces render jobs; visual/order changes
 * are saved independently under existing optimistic revision contracts.
 */
export function timelineKeyboardSeek(key,{positionMs=0,totalDurationMs=0,shiftKey=false}={}){
 if(!Number.isFinite(positionMs)||!Number.isFinite(totalDurationMs)||totalDurationMs<0)return null;
 const delta=shiftKey?5000:1000;
 const target=key==='ArrowLeft'?positionMs-delta:key==='ArrowRight'?positionMs+delta:
  key==='Home'?0:key==='End'?totalDurationMs:null;
 return target===null?null:Math.max(0,Math.min(totalDurationMs,Math.round(target)));
}
export function canEditTimeline({locked=false,busy=false,orderDirty=false,trimDirty=false}={},kind){
 if(locked||busy)return false;
 // Two independent PATCH contracts cannot be submitted in the same revision.
 return kind==='reorder'?!trimDirty:kind==='trim'?!orderDirty:false;
}
export function zoomScrollAnchor({scrollLeft=0,viewportWidth=900,positionMs=0,oldZoom=42,newZoom=42,totalDurationMs=0}){
 if(![scrollLeft,viewportWidth,positionMs,oldZoom,newZoom,totalDurationMs].every(Number.isFinite)||
  oldZoom<=0||newZoom<=0||viewportWidth<=0||totalDurationMs<0)throw Error('INVALID_ZOOM_ANCHOR');
 // Keep the playhead in the same screen position, or anchor to viewport center
 // when playhead is outside the visible range. Never scroll beyond duration.
 const previousX=positionMs*oldZoom/1000-scrollLeft;
 const anchor=previousX>=0&&previousX<=viewportWidth?previousX:viewportWidth/2;
 const desired=positionMs*newZoom/1000-anchor;
 const maxScroll=Math.max(0,totalDurationMs*newZoom/1000-viewportWidth);
 return Math.round(Math.max(0,Math.min(maxScroll,desired)));
}
