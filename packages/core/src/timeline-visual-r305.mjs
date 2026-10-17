/** R3-05 UI-only quantization: scene position is never modified by trim. */
export function snapVisualWindow(value,{durationMs,fps=30,markers=[],thresholdMs=120}={}){
 if(!Number.isFinite(value)||!Number.isInteger(durationMs)||durationMs<200||![24,25,30,60].includes(fps))throw Error('INVALID_VISUAL_SNAP');
 const clamped=Math.max(0,Math.min(durationMs,value));
 const frame=Math.round(clamped*fps/1000)*1000/fps;
 const candidates=[0,durationMs,...markers.filter(x=>Number.isFinite(x)&&x>=0&&x<=durationMs)];
 const nearby=candidates.reduce((best,x)=>Math.abs(x-clamped)<Math.abs(best-clamped)?x:best,candidates[0]);
 const snapped=Math.abs(nearby-clamped)<=thresholdMs?nearby:frame;
 return Math.max(0,Math.min(durationMs,Math.round(snapped)));
}
