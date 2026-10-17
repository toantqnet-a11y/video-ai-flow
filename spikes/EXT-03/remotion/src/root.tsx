import React from 'react';
import {Composition} from 'remotion';
import {Video} from './video';
import manifest from './manifest.json';

// Register a deterministic composition using exactly the shared fixture duration.
export const Root: React.FC = () => (
  <Composition id="VideoFlowPOC" component={Video}
    width={manifest.width} height={manifest.height}
    fps={manifest.fps} durationInFrames={manifest.totalFrames}/>
);
