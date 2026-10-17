/** Operator-only CLI: do not launch paid/remote generation or silently install models. */
import { ComfyVideoAdapter } from './comfy-video.mjs';
const command = process.argv[2] ?? 'help';
if (command === 'help') {
  console.log(`SP-VID-01: ComfyUI local video protocol prototype\n  node src/cli.mjs diagnose\nNo automatic model downloads. To generate a clip, provide an API-exported workflow + node bindings in your own integration script.`);
} else if (command === 'diagnose') {
  const adapter = new ComfyVideoAdapter({origin:process.env.COMFYUI_URL || 'http://127.0.0.1:8188'});
  try {console.log(JSON.stringify(await adapter.status(), null, 2));}
  catch (err) {console.log(JSON.stringify({providerId:adapter.id, reachable:false, errorCode:err.code ?? 'UNKNOWN', realInferenceVerified:false}));}
} else {console.error('Unknown command'); process.exitCode=2;}
