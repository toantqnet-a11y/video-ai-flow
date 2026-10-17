"""Measure the two ACTUAL rendering CLIs; never substitute an estimated render time."""
import argparse, json, os, shutil, subprocess, time, sys, platform
from pathlib import Path
try: import psutil
except ImportError: psutil=None
ROOT=Path(__file__).resolve().parents[1]
M=json.loads((ROOT/'manifest.json').read_text())

def probe(path):
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-show_streams','-of','json',str(path)]))
    video=next((s for s in data['streams'] if s['codec_type']=='video'), {})
    audio=next((s for s in data['streams'] if s['codec_type']=='audio'),{})
    return {'duration_seconds':float(data['format']['duration']), 'bytes':path.stat().st_size,
            'video_codec':video.get('codec_name'),'width':video.get('width'),'height':video.get('height'),
            'fps':video.get('r_frame_rate'),'audio_codec':audio.get('codec_name'),'has_audio':bool(audio)}

def run(engine):
    project=ROOT/engine
    output=ROOT/'outputs'/f'{engine}.mp4'
    output.unlink(missing_ok=True)
    exe='npm.cmd' if platform.system()=='Windows' else 'npm'
    install=(project/'node_modules').exists()
    if not install: return {'engine':engine,'status':'NOT_RUN','reason':'npm dependencies missing; run npm install in '+str(project)}
    if engine=='hyperframes':
        subprocess.run(['node', str(ROOT/'scripts'/'setup-hyperframes.mjs')],check=True)
    cmd=[exe,'run','render']
    start=time.monotonic();peak_rss=0
    log=ROOT/'outputs'/f'{engine}.log'
    with log.open('w',encoding='utf8') as out:
        proc=subprocess.Popen(cmd,cwd=project,stdout=out,stderr=subprocess.STDOUT)
        while proc.poll() is None:
            if psutil:
                try:
                    ps=psutil.Process(proc.pid)
                    descendants=[ps,*ps.children(recursive=True)]
                    rss=0
                    for p in descendants:
                        try: rss+=p.memory_info().rss
                        except (psutil.NoSuchProcess,psutil.AccessDenied): pass
                    peak_rss=max(peak_rss,rss)
                except psutil.NoSuchProcess: pass
            time.sleep(.2)
        code=proc.returncode
    seconds=round(time.monotonic()-start,3)
    result={'engine':engine,'status':'PASS' if code==0 and output.exists() else 'FAIL',
            'elapsed_seconds':seconds,'peak_process_tree_rss_mb':round(peak_rss/1024**2,1) if peak_rss else None,
            'exit_code':code,'log':str(log.relative_to(ROOT))}
    if output.exists():
        result.update(probe(output))
        result['realtime_factor']=round(seconds/M['durationSeconds'],3)
        result['duration_delta_seconds']=round(result['duration_seconds']-M['durationSeconds'],4)
        result['checks']={'resolution':result['width']==M['width'] and result['height']==M['height'],
                'audio_present':result['has_audio'],
                'duration_tolerance':abs(result['duration_delta_seconds'])<0.15}
        if not all(result['checks'].values()):result['status']='FAIL_QA'
    return result

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--engine',choices=['both','remotion','hyperframes'],default='both');args=ap.parse_args()
    engines=['remotion','hyperframes'] if args.engine=='both' else [args.engine]
    results={'environment':{'os':platform.platform(),'python':platform.python_version(),
              'cpu_count':os.cpu_count(),'psutil_available':bool(psutil)},
             'fixture':{'duration':M['durationSeconds'],'fps':M['fps'],
               'resolution':[M['width'],M['height']],'scenes':len(M['scenes'])},'runs':[]}
    for engine in engines:
        result=run(engine); results['runs'].append(result)
        print(engine, result['status'], 'elapsed',result.get('elapsed_seconds'), 's')
    (ROOT/'benchmark-results.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
    if not all(r['status']=='PASS' for r in results['runs']):sys.exit(1)
if __name__=='__main__':main()
