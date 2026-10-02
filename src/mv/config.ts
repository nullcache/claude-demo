// 《反乌托邦》（乌托邦P / 星尘 Infinity · 诗岸）片段 MV「网中星」
// 片段：原曲 0:39「只因为」→ 1:27 第二段主歌「请你…请你…」句尾，约 48.6 秒。
// 所有镜头时间都写成「原曲时间」，换了音源版本只需要改 SONG_IN / SONG_OUT（或整体平移 CUE）。

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** 原曲入点 / 出点（秒）。「只因」在 39.36，留一点点气口 */
export const SONG_IN = 39.15;
export const SONG_OUT = 87.75;
export const DURATION = SONG_OUT - SONG_IN;

/** 原曲 120 BPM：一小节 2 秒、一拍 0.5 秒；副歌第一个强拍（「你那」）在 39.99 */
export const BEAT = 0.5;
export const DOWNBEAT = 39.99;

/** 原曲时间轴上的关键点（来自 LRC 时间戳） */
export const CUE = {
  zhiyin: 39.36, // 只因为
  c1: 39.99, // 你那渴望自由的心脏
  c2: 41.94, // 困在一张没空隙的网
  c3: 43.92,
  c4: 45.93,
  c5: 47.94,
  c6: 49.95,
  c7: 51.93, // 至少我还在为你而歌唱
  c8: 53.94, // 在黑暗漫长的反乌托邦
  post: 55.92, // 副歌后间奏
  bridge: 61.65, // 「即便…」
  v1: 71.97, // 第二段主歌
  v2: 73.83,
  train: 75.87, // 「列车…」
  v4: 77.85,
  v5: 79.98,
  v6: 81.78,
  please1: 83.79, // 「请你…」
  please2: 85.74, // 「请你…」
};

export const COL = {
  night0: '#04050d',
  night1: '#0a0f26',
  night2: '#151a3d',
  net: [150, 172, 226] as const, // 冷银蓝的网
  netLit: [235, 214, 196] as const,
  star: [255, 246, 228] as const,
  starCool: [206, 222, 255] as const,
  ring: [214, 206, 255] as const,
  heart: [255, 122, 138] as const,
  paper: [255, 243, 228] as const,
  paperShade: [255, 196, 160] as const,
  thread: [255, 186, 200] as const,
  rail: [255, 214, 150] as const,
  window: [255, 206, 140] as const,
  singer: [222, 236, 255] as const,
  singerHalo: [176, 160, 255] as const,
  ember: [255, 150, 92] as const,
  ink: '#f3ecdf',
  cell: [214, 104, 92] as const, // 稿纸格的朱红
};

export const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`;
