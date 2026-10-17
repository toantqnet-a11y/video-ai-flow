"""Verifies identical scene manifest, duration, audio and source media for both render engines."""
from pathlib import Path
import json, hashlib, subprocess, math
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'manifest.json').read_text())
assert m['width']==1080 and m['height']==1920 and m['fps']==30
assert len(m['scenes'])==5
prev=0
for s in m['scenes']:
    assert s['startFrame']==prev
    prev+=s['durationFrames']
    assert s['durationFrames']>=math.ceil(s['audioDurationSeconds']*m['fps'])
    source=root/'assets'/s['image']; speech=root/'assets'/s['audio']
    assert source.is_file() and speech.is_file()
    for dir in ('remotion/public','hyperframes/assets'):
        for f in (source,speech):
            copied=root/dir/f.name
            assert copied.is_file() and hashlib.sha256(f.read_bytes()).digest()==hashlib.sha256(copied.read_bytes()).digest()
assert prev==m['totalFrames']
assert json.loads((root/'remotion/src/manifest.json').read_text())==m
print(f"PASS: {len(m['scenes'])} scenes, {m['totalFrames']} frames, {m['durationSeconds']}s, assets SHA256 match")
