/** R3-VID-01: deterministic scene-to-source clip clock mapping.
 * Only the single narrator/audio controller owns playback position. This
 * function never changes voice duration, captions, source media or scene order.
 * Source clip audio must be MUTED in the browser and removed in FFmpeg.
 */
const finite = n => typeof n==='number' && Number.isFinite(n);
const positive = n => finite(n)&&n>0&&n<=300000;
const whole = n => Number.isSafeInteger(n)&&n>=0;
const fail = code => {const e=new Error(code); e.code=code; throw e;};

/** Translate a global timeline clock into a private video-element seek target.
 * 'loop' repeats the source inside the allowed visual window; 'hold' freezes
 * its last decoded frame. The source is never requested to play outside its
 * actual duration; near-end epsilon avoids seeking to end/black frame.
 *
 * visualInMs/visualOutMs are SCENE-LOCAL ranges (not source trim offsets).
 * Position before the active window shows frame zero; position afterward
 * shows the last active frame; narration continues for the entire scene.
 */
export function fitSceneClip({positionMs,startMs,durationMs,sourceDurationMs,
 visualInMs=0,visualOutMs=durationMs,fit='loop'}={}){
 if(!finite(positionMs)||!whole(startMs)||!positive(durationMs)||
   !positive(sourceDurationMs)||!whole(visualInMs)||!whole(visualOutMs)||
   visualOutMs>durationMs||visualOutMs<=visualInMs||
   !['loop','hold'].includes(fit))fail('CLIP_FIT_INVALID');
 const sceneOffsetMs=Math.min(durationMs,Math.max(0,positionMs-startMs));
 const inWindow=sceneOffsetMs>=visualInMs&&sceneOffsetMs<visualOutMs;
 const elapsed=Math.max(0,Math.min(sceneOffsetMs-visualInMs,visualOutMs-visualInMs));
 const safeLast=Math.max(0,sourceDurationMs-40);
 // A selected visual window always holds outside the window; a shorter clip
 // loops *inside* the window if explicitly requested.
 const sourceMs=sceneOffsetMs<visualInMs?0:
   fit==='loop'?Math.min(elapsed%sourceDurationMs,safeLast):Math.min(elapsed,safeLast);
 return {sceneOffsetMs,sourceTimeSeconds:sourceMs/1000,
  shouldPlay:inWindow&&(fit==='loop'||elapsed<safeLast),
  muted:true,fit,sourceDurationMs,visualInMs,visualOutMs,
  cycles:fit==='loop'?Math.max(1,Math.ceil((visualOutMs-visualInMs)/sourceDurationMs)):1,
  voiceDurationPreserved:true};
}

/** Pick predictable offline fit rules identical to FFmpeg's normalization.
 * A saved visual window is meaningful: play inside, hold edges, no implicit
 * source looping; full-scene clips loop to narration length by default.
 */
export function resolveClipFit(scene){
 if(!scene||!whole(scene.durationMs)||scene.durationMs<200||
  !whole(scene.visualInMs??0)||!whole(scene.visualOutMs??scene.durationMs))fail('CLIP_FIT_INVALID');
 const changed=(scene.visualInMs??0)!==0||
  (scene.visualOutMs??scene.durationMs)!==scene.durationMs;
 return {fit:changed?'hold':'loop',visualInMs:scene.visualInMs??0,
  visualOutMs:scene.visualOutMs??scene.durationMs};
}
