"""Pure fixture/benchmark-protocol checks; these are NOT proof of engine rendering."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

MODULE = Path(__file__).parent / 'benchmark-r2ext03.py'
spec = importlib.util.spec_from_file_location('bench_ext03', MODULE)
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)

class BenchmarkProtocolTests(unittest.TestCase):
    def test_three_representative_workloads(self):
        self.assertEqual(bench.WORKLOADS, {'short':1,'standard':5,'medium':15})

    def test_shared_frame_timing_and_measured_voice(self):
        for n in (1,5,15):
            manifest = bench.build_manifest(n)
            self.assertEqual(manifest['totalFrames'],sum(s['durationFrames'] for s in manifest['scenes']))
            for s in manifest['scenes']:
                self.assertGreater(s['audioDurationSeconds'], 0)
                self.assertGreater(s['durationFrames']/manifest['fps'], s['audioDurationSeconds'])
                self.assertEqual(len(s['imageSha256']), 64)
                self.assertEqual(len(s['audioSha256']), 64)
                self.assertNotIn('wordSlots', s)  # No made-up word timestamps
                self.assertIn('tiếng Việt' if n==15 else 'Tạo', ' '.join(x['text'] for x in manifest['scenes']) if n==15 else manifest['scenes'][0]['text'])

    def test_monotonic_nonoverlapping_frame_windows(self):
        m = bench.build_manifest(15)
        self.assertEqual(m['scenes'][0]['startFrame'],0)
        for left,right in zip(m['scenes'],m['scenes'][1:]):
            self.assertEqual(right['startFrame'], left['startFrame']+left['durationFrames'])

    def test_hyperframes_uses_same_scene_level_caption_and_audio_windows(self):
        m=bench.build_manifest(5)
        page=bench.write_hyperframes(m)
        self.assertIn('data-composition-id="VideoFlowPOC"',page)
        self.assertEqual(page.count('data-track-index="10"'),5)
        self.assertEqual(page.count('data-track-index="3"'),5)
        self.assertEqual(page.count('tl.fromTo('),5)
        self.assertIn('Tiếng',page) if 'Tiếng' in ' '.join(x['text'] for x in m['scenes']) else self.assertIn('Tạo video',page)
        self.assertNotIn('wordSlots',page)

    def test_sanitizes_caption_html(self):
        m=bench.build_manifest(1)
        m['scenes'][0]['text']='<script>alert("x")</script>'
        page=bench.write_hyperframes(m)
        self.assertIn('&lt;script&gt;',page)
        self.assertNotIn('<script>alert',page)

    def test_no_false_benchmark_pass(self):
        results={'status':'NOT_RUN','runs':[{'workload':wk,'engine':e,'status':'NOT_RUN'} for wk in bench.WORKLOADS for e in ('remotion','hyperframes')], 'blockers':['npm unavailable']}
        s=bench.summarize(results)
        self.assertIn('NOT_MEASURED',s)
        self.assertIn('Overall: **NOT_RUN**',s)

    def test_baseline_is_not_an_engine_run(self):
        p = bench.ROOT/'outputs'/'baseline-ffmpeg.mp4'
        media=bench.probe(p)
        self.assertEqual(media['video_codec'],'h264')
        self.assertTrue(media['duration'] > 10)
        self.assertEqual(media['width'],1080)
        self.assertEqual(media['height'],1920)

if __name__ == '__main__':
    unittest.main(verbosity=2)
