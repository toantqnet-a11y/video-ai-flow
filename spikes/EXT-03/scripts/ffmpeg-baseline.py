"""A genuine offline-only FFmpeg smoke-test. NOT a Remotion/HyperFrames benchmark."""
import json,subprocess,time,os,platform,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'manifest.json').read_text())
scene_files=[]
started=time.monotonic()
for s in m['scenes']:
    out=root/'outputs'/f'baseline-{s["id"]}.mp4'
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-threads','2','-y',
        '-loop','1','-framerate',str(m['fps']),'-t',str(s['durationFrames']/m['fps']),
        '-i',str(root/'assets'/s['image']),'-i',str(root/'assets'/s['audio']),
        '-vf','format=yuv420p','-c:v','libx264','-preset','ultrafast','-crf','24',
        '-c:a','aac','-b:a','96k','-af','apad', '-t',str(s['durationFrames']/m['fps']),
        '-r',str(m['fps']),'-movflags','+faststart',str(out)]
    subprocess.run(cmd,check=True)
    scene_files.append(out)
concat=root/'outputs'/'ffmpeg-list.txt'
concat.write_text(''.join("file '"+str(f).replace("'","'\\''")+"'\n" for f in scene_files))
output=root/'outputs'/'baseline-ffmpeg.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy',str(output)],check=True)
seconds=round(time.monotonic()-started,3)
info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-show_streams','-of','json',str(output)]))
metrics={'engine':'FFmpeg baseline only','status':'PASS','render_seconds':seconds,'target_seconds':m['durationSeconds'],
         'actual_seconds':float(info['format']['duration']),'filesize_bytes':output.stat().st_size,
         'video':next(x for x in info['streams'] if x['codec_type']=='video'),
         'has_audio':any(x['codec_type']=='audio' for x in info['streams'])}
(root/'outputs'/'baseline-results.json').write_text(json.dumps(metrics,indent=2))
print(json.dumps({k:v for k,v in metrics.items() if k!='video'},indent=2))
