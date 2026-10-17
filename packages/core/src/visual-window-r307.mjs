/** R3-05 render-time visual window. All boundaries are scene-relative integer
 * frames. Narration, caption cues and overall scene clocks are NEVER cut.
 * Old Composition v2 snapshots without visualWindow remain unmodified.
 */
export function visualWindowFrames(scene){
  return scene.visualWindow??{inFrame:0,outFrame:scene.durationFrames};
}
export function hasVisualWindow(scene){return scene.visualWindow!==undefined;}
/** The last active frame repeats until the scene ends. Input starts at frame
 * zero at inFrame; frame zero is held before inFrame. Do not loop short clips:
 * insufficient source frames are a hard error after local preprocessing.
 */
export function videoWindowFilter(scene,{width,height,fps}){
  const {inFrame,outFrame}=visualWindowFrames(scene);
  const active=outFrame-inFrame,tail=scene.durationFrames-outFrame;
  if(active<=0||inFrame<0||tail<0)throw Error('INVALID_VISUAL_WINDOW');
  const cover=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  return `fps=${fps},trim=end_frame=${active},setpts=PTS-STARTPTS,tpad=start_mode=clone:start=${inFrame}:stop_mode=clone:stop=${tail},trim=end_frame=${scene.durationFrames},setpts=N/(${fps}*TB),${cover},format=yuv420p`;
}
/** The window is a progress interval for still-image motion, not a destructive
 * crop: freeze the initial pose before inFrame and final pose after outFrame. */
export function visualMotionProgress(scene,variable='on'){
  const {inFrame,outFrame}=visualWindowFrames(scene);
  const span=Math.max(1,outFrame-inFrame-1);
  return `max(0,min((${variable}-${inFrame})/${span},1))`;
}
/** HyperFrames image keyframes use absolute scene progress with constant poses
 * outside the active interval. The CSS keyframes and FFmpeg both model hold.
 */
export function imageMotionKeyframes(scene,motion){
  const {inFrame,outFrame}=visualWindowFrames(scene);
  const duration=Math.max(1,scene.durationFrames-1);
  const start=Number((100*inFrame/duration).toFixed(5));
  const end=Number((100*Math.min(scene.durationFrames-1,outFrame-1)/duration).toFixed(5));
  const poses={
    zoom:['scale(1)','scale(1.04)'],
    ken_burns:['scale(1.02) translateX(-0.5%)','scale(1.08) translateX(0.5%)'],
    pan:['scale(1.05) translateX(-1%)','scale(1.05) translateX(1%)']
  };
  const pair=poses[motion];
  if(!pair)return null;
  return `0%,${start}%{transform:${pair[0]}} ${end}%,100%{transform:${pair[1]}}`;
}
