import {clamp, E, lerp, prog} from '../lib/math';

export const FPS = 60;
export const W = 1920;
export const H = 1080;

// ───────────── 节拍网格 ─────────────
// 144 BPM：一拍 = 25 帧（60fps），一小节 = 100 帧；12 小节 = 1200 帧 = 20 秒。所有剪辑点落在拍点上。
export const BPM = 144;
export const BEAT = 60 / BPM;
export const BARS = 12;
export const DURATION_FRAMES = BARS * 4 * 25;
/** 第 n 拍对应的秒数（可为小数，0.5 = 八分音符） */
export const b = (n: number) => n * BEAT;

// ───────────── 色彩脚本 ─────────────
export const C = {
  ink: '#0A090D',
  ink2: '#17141C',
  paper: '#F6F3EE',
  white: '#FFFFFF',
  pink: '#FF2D7E', // 粉色血液
  pinkHot: '#FF4F98',
  pinkDeep: '#B3004F',
  pinkDark: '#4A0022',
  yellow: '#FFD31A', // 弱点 / 言弹
  orange: '#FF8A00',
  cyan: '#27E3FF',
  red: '#F0122D', // 黑白熊红眼
  violet: '#2A1240',
  violetDeep: '#140822',
  steel: '#3C3A45',
  steelHi: '#8E8B9A',
};

export const F = {
  sans: 'DR Sans', // Noto Sans SC Black
  serif: 'DR Serif', // Noto Serif SC Black
  pop: 'DR Pop', // ZCOOL QingKe HuangYou
  latin: 'DR Latin', // Anton
  pixel: 'DR Pixel', // Press Start 2P
  mid: 'DR Mid', // Noto Sans SC Medium
};

// ───────────── 工具 ─────────────
export {clamp, E, lerp, prog};

/** 指数缓出：冲击感最强的入场曲线 */
export const expoOut = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
export const expoIn = (x: number) => (x <= 0 ? 0 : Math.pow(2, 10 * (clamp(x) - 1)));
export const expoIO = (x: number) => {
  x = clamp(x);
  if (x === 0 || x === 1) return x;
  return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
};
/** 回弹缓出 */
export const backOut = (x: number, s = 2.2) => {
  x = clamp(x);
  return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
/** 在 [a, a+d] 内由 0→1 */
export const win = (t: number, a: number, d: number) => prog(t, a, a + d);

/** 确定性伪随机（mulberry32） */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** 平滑一维噪声 */
export function noise1(x: number, seed = 0) {
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

/** 镜头冲击：拍点上的震动脉冲（时间、强度、衰减） */
export type Hit = [number, number, number?];
export const HITS: Hit[] = [
  [b(0), 10, 0.25],
  [b(1), 14],
  [b(2), 18],
  [b(4), 10],
  [b(6), 22],
  [b(7), 26],
  [b(8), 16],
  [b(12), 40, 0.5],
  [b(16), 46, 0.55],
  [b(27), 20, 0.2],
  [b(28), 50, 0.45],
  [b(29), 24],
  [b(32), 70, 0.7],
  [b(34), 26],
  [b(36), 18],
  [b(38), 24],
  [b(40), 40, 0.5],
  [b(42), 34, 0.4],
];
export function shake(t: number): [number, number, number] {
  let x = 0, y = 0, r = 0;
  for (const [t0, amp, dec = 0.32] of HITS) {
    const dt = t - t0;
    if (dt < 0 || dt > dec * 2.5) continue;
    const k = amp * Math.exp(-dt / (dec * 0.35));
    x += k * noise1(dt * 38, t0 * 7.1);
    y += k * noise1(dt * 41, t0 * 3.3 + 9);
    r += k * 0.02 * noise1(dt * 29, t0 + 4);
  }
  return [x, y, r];
}

/** 1~2 帧的冲击闪白/反色帧 */
export const FLASH: Array<[number, number, 'white' | 'invert' | 'pink' | 'black']> = [
  [b(12), 2, 'white'],
  [b(16), 3, 'white'],
  [b(28), 3, 'invert'],
  [b(32), 2, 'white'],
  [b(32) + 2 / FPS, 3, 'invert'],
  [b(40), 2, 'white'],
  [b(42), 2, 'invert'],
];
