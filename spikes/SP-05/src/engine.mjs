/**
 * SP-05 virtual timeline engine (no framework or DOM dependency).
 * All authoritative timing is integer milliseconds; pixel positions are derived,
 * so zoom/scroll never mutate the saved edit decision list.
 */

export const TRACKS = Object.freeze(['media', 'text', 'voice', 'music']);
export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = 30000;

export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/** Returns immutable demo scenes covering exactly 35 minutes with 500 distinct IDs. */
export function createDemoScenes(count = 500) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw Error('invalid scene count');
  const titles = ['Khởi đầu hành trình', 'Một góc nhìn mới', 'Chi tiết đáng chú ý', 'Góc nhìn chuyên gia', 'Câu chuyện phía sau', 'Điều cần ghi nhớ', 'Dữ liệu và thực tế', 'Bước chuyển tiếp'];
  const palette = ['#6b79da', '#43b5b6', '#d79869', '#b176d2', '#e17f92', '#6ca7d0', '#83ae7f', '#b9a266'];
  return Array.from({length: count}, (_, i) => ({
    id: `SC-${String(i + 1).padStart(3, '0')}`,
    title: titles[i % titles.length],
    text: `${titles[i % titles.length]}. Đây là lời dẫn minh họa cho cảnh số ${i + 1}; nội dung thật sẽ được đồng bộ từ kịch bản chuẩn.`,
    imagePrompt: `Cinematic documentary, scene ${i + 1}, soft lighting, coherent visual identity`,
    durationMs: 4200,
    color: palette[i % palette.length],
    mediaKind: i % 7 === 0 ? 'AI VIDEO' : 'IMAGE',
    voiceState: 'demo',
    imageState: 'demo',
  }));
}

/** Prefix times are O(N), then viewport queries use binary search O(log N + visible). */
export function buildTimeline(scenes) {
  let totalMs = 0;
  const startsMs = scenes.map((s) => {
    if (!Number.isInteger(s.durationMs) || s.durationMs < MIN_DURATION_MS || s.durationMs > MAX_DURATION_MS) throw Error(`invalid duration ${s.id}`);
    const start = totalMs;
    totalMs += s.durationMs;
    return start;
  });
  return {startsMs, totalMs};
}

export function lowerBound(arr, value) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] < value) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Search only intersecting clips plus overscan in pixels for smooth scrolling. */
export function getVisibleRange(scenes, timeline, scrollLeft, viewportWidth, pxPerSec, overscanPx = 700) {
  if (!(pxPerSec > 0) || viewportWidth < 0) throw Error('invalid viewport');
  const leftMs = Math.max(0, (scrollLeft - overscanPx) * 1000 / pxPerSec);
  const rightMs = (scrollLeft + viewportWidth + overscanPx) * 1000 / pxPerSec;
  const n = scenes.length;
  const first = Math.max(0, lowerBound(timeline.startsMs, leftMs) - 1);
  const end = Math.min(n, lowerBound(timeline.startsMs, rightMs) + 1);
  return {first, end, count: Math.max(0, end - first)};
}

export function getSceneAtTime(scenes, timeline, timeMs) {
  if (!scenes.length) return -1;
  return clamp(lowerBound(timeline.startsMs, Math.max(0, timeMs) + 1) - 1, 0, scenes.length - 1);
}

export function reorderScenes(scenes, fromIndex, toIndex) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= scenes.length || toIndex >= scenes.length) throw Error('invalid reorder');
  if (fromIndex === toIndex) return scenes;
  const next = [...scenes];
  next.splice(toIndex, 0, ...next.splice(fromIndex, 1));
  return next;
}

/** Editing duration creates a new scene record; never changes text/voice asset automatically. */
export function trimScene(scenes, index, durationMs) {
  if (!Number.isInteger(index) || index < 0 || index >= scenes.length || !Number.isFinite(durationMs)) throw Error('invalid trim');
  const next = [...scenes];
  next[index] = {...next[index], durationMs: clamp(Math.round(durationMs / 100) * 100, MIN_DURATION_MS, MAX_DURATION_MS)};
  return next;
}

export function updateScene(scenes, index, patch) {
  if (index < 0 || index >= scenes.length) throw Error('invalid scene index');
  const allowed = ['text', 'imagePrompt', 'title'];
  for (const key of Object.keys(patch)) if (!allowed.includes(key) || typeof patch[key] !== 'string') throw Error('invalid field');
  const next = [...scenes];
  next[index] = {...next[index], ...patch,
    voiceState: patch.text !== undefined && patch.text !== next[index].text ? 'needs-regen' : next[index].voiceState,
    imageState: patch.imagePrompt !== undefined && patch.imagePrompt !== next[index].imagePrompt ? 'needs-regen' : next[index].imageState};
  return next;
}

export function formatTime(ms, withMs = false) {
  const t = Math.max(0, Math.floor(ms));
  const m = Math.floor(t / 60000), s = Math.floor(t % 60000 / 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${withMs ? `.${String(t % 1000).padStart(3,'0')}` : ''}`;
}

/** Convert AudioBuffer PCM to per-pixel peak envelope. Falls back to demo only in the UI. */
export function extractWavePeaks(channelData, bins = 96) {
  if (!channelData?.length || !Number.isInteger(bins) || bins < 1) throw Error('invalid audio input');
  const peaks = new Array(bins);
  for (let i = 0; i < bins; i++) {
    const from = Math.floor(i * channelData.length / bins);
    const to = Math.max(from + 1, Math.floor((i + 1) * channelData.length / bins));
    let max = 0;
    for (let k = from; k < to; k++) max = Math.max(max, Math.abs(channelData[k]));
    peaks[i] = Math.min(1, max);
  }
  return peaks;
}
