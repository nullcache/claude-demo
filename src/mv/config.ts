// 《反乌托邦》（乌托邦P / 星尘 Infinity · 诗岸）片段 MV「网中星」
// 片段：原曲 0:39「只因为」→ 1:28 第二段主歌「请你等等我」句尾，约 48.9 秒。
// 所有镜头时间都写成「原曲时间」，换了音源版本只需要改 SONG_IN / SONG_OUT（或整体平移 CUE）。

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** 原曲入点 / 出点（秒）。「只因为」从 39.5 起唱；出点落在下一段预副歌的强拍上 */
export const SONG_IN = 39.15;
export const SONG_OUT = 88.0;
export const DURATION = SONG_OUT - SONG_IN;

/** 实测 120.02 BPM，拍点落在整秒/半秒；副歌第一个强拍（「你那」）在 40.0 */
export const BEAT = 60 / 120.02;
export const DOWNBEAT = 40.0;

/** 段落强拍（原曲时间，按实测节拍网格）；逐字时间见 timing.json */
export const CUE = {
  zhiyin: 39.5, // 只因为
  c1: 40.0, // 你那渴望自由的心脏
  c2: 42.0, // 困在一张没空隙的网
  c3: 44.0, // 我们的周围并非没光亮
  c4: 46.0, // 只是太耀眼将我们灼伤
  c5: 48.0, // 在这个世界难免会迷茫
  c6: 50.0, // 但别再把小刀带在身上
  c7: 52.0, // 至少我还在为你而歌唱
  c8: 54.0, // 在黑暗漫长的反乌托邦
  post: 56.0, // 副歌后间奏（音量回落）
  bridge: 61.6, // 「即便我们都在这……」（62–64 全乐队爆发）
  v1: 72.0, // 第二段主歌（72–76 没有鼓和贝斯）
  v2: 74.0,
  train: 76.0, // 「列车……」——鼓和贝斯回来的那一拍
  v4: 78.0,
  v5: 80.0,
  v6: 82.0,
  please1: 84.0, // 「请你等等我」
  please2: 86.0, // 「请你等等我」（又抽空）
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
