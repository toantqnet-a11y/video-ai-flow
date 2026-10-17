#!/usr/bin/env python3
"""Fair, no-surprise benchmark gate: never substitute FFmpeg baseline for an engine run.

On a network-enabled workstation explicitly install dependencies then use --run.
Without --run this script validates assets, generates identical stimuli and reports blockers.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import math
import os
import platform
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

ROOT = Path(__file__).resolve().parents[1]
BASE = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
WORKLOADS = {'short': 1, 'standard': 5, 'medium': 15}
DISPLAY_LINES = [
    'Tạo video từ một ý tưởng đơn giản.',
    'Chuyển ý tưởng thành kịch bản rõ ràng.',
    'Đo thời lượng giọng đọc bằng FFprobe.',
    'Minh họa chuyển động và phụ đề tiếng Việt.',
    'Xuất video với hình ảnh và âm thanh đồng bộ.',
]


def command_output(cmd: list[str]) -> str | None:
    try:
        return subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=12, text=True).strip().splitlines()[0]
    except (OSError, subprocess.SubprocessError):
        return None


def probe(path: Path) -> dict:
    data = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ], text=True, timeout=45))
    v = next((s for s in data.get('streams', []) if s['codec_type'] == 'video'), None)
    a = next((s for s in data.get('streams', []) if s['codec_type'] == 'audio'), None)
    return {'duration': float(data['format']['duration']),
            'bytes': path.stat().st_size,
            'video_codec': v.get('codec_name') if v else None,
            'audio_codec': a.get('codec_name') if a else None,
            'width': v.get('width') if v else None,
            'height': v.get('height') if v else None,
            'fps': v.get('r_frame_rate') if v else None}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(count: int) -> dict:
    """Use real FFprobe duration, not text length or estimated spoken-word boundaries."""
    fps = BASE['fps']
    scenes = []
    start = 0
    for i in range(count):
        template = BASE['scenes'][i % len(BASE['scenes'])]
        img = ROOT / 'assets' / template['image']
        wav = ROOT / 'assets' / template['audio']
        if not img.is_file() or not wav.is_file():
            raise FileNotFoundError(f'Missing POC media: {img} / {wav}')
        duration = probe(wav)['duration']
        if not (0.1 < duration < 30):
            raise ValueError('Unexpected WAV duration')
        frames = math.ceil((duration + BASE['paddingSeconds']) * fps)
        scene = {'id': f'{i + 1:03}', 'text': DISPLAY_LINES[i % len(DISPLAY_LINES)],
                 'image': template['image'], 'audio': template['audio'],
                 'audioDurationSeconds': duration,
                 'startFrame': start, 'durationFrames': frames,
                 'imageSha256': digest(img), 'audioSha256': digest(wav)}
        scenes.append(scene)
        start += frames
    return {'compositionId': 'VideoFlowPOC', 'schemaVersion': 1,
            'fps': fps, 'width': BASE['width'], 'height': BASE['height'],
            'totalFrames': start, 'durationSeconds': start / fps,
            'sceneCount': count, 'scenes': scenes,
            'timingSource': 'ffprobe-measured-wav',
            'captionSource': 'visual-fixture-only-not-aligned-to-english-voice'}


def write_hyperframes(manifest: dict) -> str:
    """Emit seekable, scene-level captions; do not fabricate word-level timing."""
    fps = manifest['fps']
    w, h = manifest['width'], manifest['height']
    nodes = []
    tweens = []
    for s in manifest['scenes']:
        start = s['startFrame'] / fps
        duration = s['durationFrames'] / fps
        audio = s['audioDurationSeconds']
        sid = s['id']
        text = html.escape(s['text'], quote=True)
        nodes.append(
            f'<section id="scene-{sid}" class="clip" data-start="{start:.6f}" '
            f'data-duration="{duration:.6f}" data-track-index="0">'
            f'<img id="image-{sid}" class="bg" src="assets/{s["image"]}" alt=""/></section>\n'
            f'<audio id="voice-{sid}" data-start="{start:.6f}" data-duration="{audio:.6f}" '
            f'data-track-index="10" src="assets/{s["audio"]}"></audio>\n'
            f'<div class="clip" data-start="{start:.6f}" data-duration="{audio:.6f}" '
            f'data-track-index="3"><div class="captions">{text}</div></div>'
        )
        tweens.append(
            f' tl.fromTo("#image-{sid}", {{scale:1}}, '
            f'{{scale:1.025,duration:{duration:.6f},ease:"none",immediateRender:false}}, {start:.6f});'
        )
    return (f'<!doctype html><html lang="vi"><head><meta charset="utf-8"/>'
            '<style>html,body{margin:0;background:#000;width:100%;height:100%;'
            'font-family:"Noto Sans",Arial,sans-serif}'
            f'#stage{{width:{w}px;height:{h}px;position:relative;overflow:hidden;background:#000}}'
            '.clip{position:absolute;inset:0;overflow:hidden}.bg{width:100%;height:100%;object-fit:cover}'
            f'.captions{{position:absolute;top:77%;left:6%;width:88%;box-sizing:border-box;'
            'min-height:160px;display:flex;align-items:center;justify-content:center;'
            'text-align:center;padding:22px;background:rgba(4,12,27,.78);border-radius:24px;'
            'color:white;font-weight:700;font-size:48px}}</style></head><body>\n'
            f'<div id="stage" data-composition-id="VideoFlowPOC" data-start="0" '
            f'data-duration="{manifest["durationSeconds"]:.6f}" '
            f'data-width="{w}" data-height="{h}" data-fps="{fps}">\n'
            + '\n'.join(nodes) + '\n</div>\n'
            '<script src="assets/gsap.min.js"></script>\n<script>'
            'const tl=gsap.timeline({paused:true});\n' + '\n'.join(tweens) + '\n'
            'window.__timelines=window.__timelines||{};'
            'window.__timelines.VideoFlowPOC=tl;'
            '</script></body></html>')


def prepare_workload(name: str) -> dict:
    if name not in WORKLOADS:
        raise ValueError('Unknown workload')
    manifest = build_manifest(WORKLOADS[name])
    # Both renderers consume the same generated JSON/timing and the same input file hashes.
    out = ROOT / 'prepared' / name
    out.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    (out / 'manifest.json').write_text(payload, encoding='utf-8')
    (ROOT / 'remotion' / 'src' / 'manifest.json').write_text(payload, encoding='utf-8')
    (ROOT / 'hyperframes' / 'index.html').write_text(write_hyperframes(manifest), encoding='utf-8')
    return manifest


def setup_media() -> None:
    for name, destination in [('remotion', ROOT / 'remotion' / 'public'),
                              ('hyperframes', ROOT / 'hyperframes' / 'assets')]:
        destination.mkdir(parents=True, exist_ok=True)
        for src in (ROOT / 'assets').iterdir():
            if src.is_file() and src.suffix in ('.wav', '.png'):
                target = destination / src.name
                if not target.exists() or digest(src) != digest(target):
                    shutil.copy2(src, target)


def dependency_status(engine: str) -> tuple[bool, str]:
    path = ROOT / engine
    packages = {'remotion': ['remotion', '@remotion/cli', 'react'],
                'hyperframes': ['hyperframes', 'gsap']}[engine]
    for pkg in packages:
        if not (path / 'node_modules' / pkg / 'package.json').is_file():
            return False, f'{engine}: missing node_modules/{pkg}; npm install explicitly required'
    if engine == 'hyperframes':
        gsap = path / 'node_modules' / 'gsap' / 'dist' / 'gsap.min.js'
        if not gsap.is_file():
            return False, 'hyperframes: GSAP distribution not installed'
        shutil.copyfile(gsap, path / 'assets' / 'gsap.min.js')
    return True, 'installed'


def version_record(engine: str) -> dict:
    pkgs = {'remotion': ['remotion', '@remotion/cli'], 'hyperframes': ['hyperframes', 'gsap']}[engine]
    versions = {}
    for pkg in pkgs:
        path = ROOT / engine / 'node_modules' / pkg / 'package.json'
        if path.is_file():
            versions[pkg] = json.loads(path.read_text()).get('version')
        else:
            versions[pkg] = None
    return versions


def render(engine: str, workload: str, iteration: int, manifest: dict, timeout: int) -> dict:
    path = ROOT / engine
    dest = ROOT / 'outputs' / 'r2ext03' / f'{workload}_{engine}_{iteration:02}.mp4'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.unlink(missing_ok=True)
    logfile = dest.with_suffix('.log')
    bin_path = path / 'node_modules' / '.bin'
    executable = bin_path / (('remotion' if engine == 'remotion' else 'hyperframes') + ('.cmd' if os.name == 'nt' else ''))
    if engine == 'remotion':
        cmd = [str(executable), 'render', 'src/index.ts', 'VideoFlowPOC', str(dest),
               '--codec=h264', '--crf=20', '--concurrency=1']
    else:
        cmd = [str(executable), 'render', '--composition=index.html', '--fps=30', '--crf=20',
               '--workers=1', '--no-browser-gpu', f'--output={dest}']
    start = time.monotonic()
    peak = 0
    max_cpu = 0.0
    cpu_samples = []
    error = None
    with logfile.open('w', encoding='utf-8') as log:
        try:
            proc = subprocess.Popen(cmd, cwd=path, stdout=log, stderr=subprocess.STDOUT)
            try:
                while proc.poll() is None:
                    if psutil:
                        try:
                            parent = psutil.Process(proc.pid)
                            members = [parent, *parent.children(recursive=True)]
                            total_rss = 0
                            sample_cpu = 0.0
                            for p in members:
                                try:
                                    total_rss += p.memory_info().rss
                                    sample_cpu += p.cpu_percent(interval=None)
                                except (psutil.NoSuchProcess, psutil.AccessDenied):
                                    pass
                            peak = max(peak, total_rss)
                            max_cpu = max(max_cpu, sample_cpu)
                            cpu_samples.append(sample_cpu)
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    if time.monotonic() - start > timeout:
                        # Avoid claiming success after deadline; stop the entire process tree.
                        if psutil:
                            try:
                                parent = psutil.Process(proc.pid)
                                for child in parent.children(recursive=True):
                                    child.kill()
                            except psutil.Error:
                                pass
                        proc.kill()
                        error = f'timeout after {timeout}s'
                        break
                    time.sleep(.2)
                code = proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
                code = proc.wait()
                error = 'timeout waiting for subprocess'
        except (OSError, subprocess.SubprocessError) as e:
            code = -1
            error = str(e)
    result = {'engine': engine, 'workload': workload, 'iteration': iteration,
              'status': 'FAILED', 'elapsedSeconds': round(time.monotonic() - start, 3),
              'peakProcessTreeRssMB': round(peak / 1048576, 1) if peak else None,
              'sampledPeakProcessTreeCPUPercent': round(max_cpu, 1) if cpu_samples else None,
              'exitCode': code, 'log': str(logfile.relative_to(ROOT))}
    if error:
        result['reason'] = error
    if code != 0 or not dest.is_file():
        result.setdefault('reason', 'renderer returned nonzero or produced no MP4')
        return result
    try:
        media = probe(dest)
        expected_duration = manifest['totalFrames'] / manifest['fps']
        checks = {'resolution': media['width'] == manifest['width'] and media['height'] == manifest['height'],
                  'duration': abs(media['duration'] - expected_duration) <= 0.125,
                  'fps': media['fps'] in ('30/1', '30'),
                  'H264': media['video_codec'] == 'h264',
                  'audio': media['audio_codec'] in ('aac', 'mp3', 'pcm_s16le')}
        result.update({'media': media, 'checks': checks, 'status': 'PASS' if all(checks.values()) else 'FAIL_QA'})
    except Exception as e:
        result['reason'] = 'ffprobe failed: ' + str(e)
    return result


def machine() -> dict:
    return {'os': platform.platform(), 'python': platform.python_version(),
            'node': command_output(['node', '--version']),
            'npm': command_output(['npm', '--version']),
            'ffmpeg': command_output(['ffmpeg', '-version']),
            'ffprobe': command_output(['ffprobe', '-version']),
            'chromium': command_output(['chromium', '--version']),
            'cpuCount': os.cpu_count(),
            'memoryGB': round(psutil.virtual_memory().total / 2**30, 2) if psutil else None,
            'psutil': bool(psutil)}


def summarize(results: dict) -> str:
    lines = ['# EXT-03 · Actual-render benchmark gate', '',
             f'Overall: **{results["status"]}**', '',
             'A PASS requires actual engine MP4 from both engines across three fixtures, ≥3 repeats and QA.',
             'FFmpeg baseline is excluded from the comparison.', '',
             '| Workload | Remotion passed/repeats | HyperFrames passed/repeats | Median Remotion (s) | Median HyperFrames (s) |',
             '|---|---:|---:|---:|---:|']
    for wk in WORKLOADS:
        series = {e: [r for r in results['runs'] if r['workload'] == wk and r['engine'] == e] for e in ('remotion', 'hyperframes')}
        def metrics(e):
            sub = series[e]
            passed = [r['elapsedSeconds'] for r in sub if r['status'] == 'PASS']
            return f'{len(passed)}/{len(sub)}', f'{statistics.median(passed):.3f}' if len(passed) >= 3 else 'NOT_MEASURED'
        a, ta = metrics('remotion')
        b, tb = metrics('hyperframes')
        lines.append(f'| {wk} | {a} | {b} | {ta} | {tb} |')
    if results['blockers']:
        lines.extend(['', '## Blockers', *['- ' + x for x in results['blockers']]])
    lines.extend(['', '## Safety',
                  '- No network/API calls or paid provider selection in `--prepare-only`.',
                  '- Real CLI render has not been witnessed unless `PASS` rows are present.',
                  '- Audio WAV samples are ENGLISH, despite Vietnamese visual test captions. Thus Vietnamese narration sync is NOT validated.',
                  '- Inspect rendered frames and listen to actual audio before final engine selection.',
                  '- Do not decide a winner from absent or incomplete measurements.', ''])
    return '\n'.join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Run real engines ONLY if local dependencies exist (no auto-install)')
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('--prepare-only', action='store_true', help='Explicitly refuse to run engines')
    args = parser.parse_args()
    if args.repeats < 3:
        parser.error('minimum 3 repeats for a comparative performance claim')
    if not shutil.which('ffprobe'):
        parser.error('ffprobe required to create measured fixtures')
    setup_media()
    workloads = {wk: build_manifest(n) for wk, n in WORKLOADS.items()}
    blockers = []
    dependencies = {engine: dependency_status(engine) for engine in ('remotion', 'hyperframes')}
    for engine, (ok, reason) in dependencies.items():
        if not ok:
            blockers.append(reason)
    results = {'status': 'NOT_RUN', 'protocol': '3 workloads x 3 repeats x 2 engines; deterministic AB/BA order',
               'environment': machine(),
               'versionPins': {e: version_record(e) for e in ('remotion', 'hyperframes')},
               'workloads': {wk: {'scenes': m['sceneCount'], 'frames': m['totalFrames'],
                                 'seconds': m['durationSeconds']} for wk, m in workloads.items()},
               'blockers': blockers, 'runs': []}
    can_run = args.run and not args.prepare_only and not blockers
    for wk, fixture in workloads.items():
        prepare_workload(wk)
        for i in range(args.repeats):
            order = ('remotion', 'hyperframes') if i % 2 == 0 else ('hyperframes', 'remotion')
            for engine in order:
                if can_run:
                    row = render(engine, wk, i + 1, fixture, args.timeout)
                else:
                    row = {'engine': engine, 'workload': wk, 'iteration': i + 1,
                           'status': 'NOT_RUN', 'reason': 'missing installed dependencies or --run not selected'}
                results['runs'].append(row)
                print(wk, f'run {i+1}', engine, row['status'])
    if can_run:
        results['status'] = 'PASS' if all(r['status'] == 'PASS' for r in results['runs']) else 'FAIL_OR_INCOMPLETE'
    elif not blockers:
        results['blockers'].append('prepared-only: actual engine CLI renders not requested')
    (ROOT / 'benchmark-results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    (ROOT / 'BENCHMARK_SUMMARY.md').write_text(summarize(results), encoding='utf-8')
    return 0 if not args.run or results['status'] == 'PASS' else 2


if __name__ == '__main__':
    sys.exit(main())
