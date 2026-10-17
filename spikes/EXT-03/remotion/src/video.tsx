import React from 'react';
import {AbsoluteFill, Sequence, Img, Audio, staticFile, useCurrentFrame} from 'remotion';
import manifest from './manifest.json';

type Scene = (typeof manifest.scenes)[number];
const SceneView: React.FC<{scene: Scene}> = ({scene}) => {
  // Keep scene-local motion deterministic so both renderers can seek any frame.
  const frame = useCurrentFrame();
  const elapsed = frame / manifest.fps;
  const total = scene.durationFrames / manifest.fps;
  const zoom = 1 + 0.025 * Math.min(1, elapsed / total);
  return <AbsoluteFill style={{backgroundColor:'#000', overflow:'hidden',fontFamily:'"Noto Sans",Arial,sans-serif'}}>
    <Img src={staticFile(scene.image)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${zoom})`}} />
    {/* Caption ends at the measured audio boundary; no invented word timing. */}
    {elapsed < scene.audioDurationSeconds && <div style={{position:'absolute',top:'77%',left:'6%',width:'88%',minHeight:160,
      boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',
      padding:22,background:'rgba(4,12,27,.78)',borderRadius:24,color:'white',fontSize:48,fontWeight:700}}>{scene.text}</div>}
    <Audio src={staticFile(scene.audio)} />
  </AbsoluteFill>;
};

export const Video: React.FC = () => <AbsoluteFill style={{backgroundColor:'#000'}}>
  {manifest.scenes.map((scene) => <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
    <SceneView scene={scene}/>
  </Sequence>)}
</AbsoluteFill>;
