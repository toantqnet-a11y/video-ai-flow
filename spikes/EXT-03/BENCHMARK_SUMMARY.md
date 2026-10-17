# EXT-03 · Actual-render benchmark gate

Overall: **NOT_RUN**

A PASS requires actual engine MP4 from both engines across three fixtures, ≥3 repeats and QA.
FFmpeg baseline is excluded from the comparison.

| Workload | Remotion passed/repeats | HyperFrames passed/repeats | Median Remotion (s) | Median HyperFrames (s) |
|---|---:|---:|---:|---:|
| short | 0/3 | 0/3 | NOT_MEASURED | NOT_MEASURED |
| standard | 0/3 | 0/3 | NOT_MEASURED | NOT_MEASURED |
| medium | 0/3 | 0/3 | NOT_MEASURED | NOT_MEASURED |

## Blockers
- remotion: missing node_modules/remotion; npm install explicitly required
- hyperframes: missing node_modules/hyperframes; npm install explicitly required

## Safety
- No network/API calls or paid provider selection in `--prepare-only`.
- Real CLI render has not been witnessed unless `PASS` rows are present.
- Audio WAV samples are ENGLISH, despite Vietnamese visual test captions. Thus Vietnamese narration sync is NOT validated.
- Inspect rendered frames and listen to actual audio before final engine selection.
- Do not decide a winner from absent or incomplete measurements.
