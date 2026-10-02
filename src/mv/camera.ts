import {DEG, ss} from '../lib/math';
import {CUE, H, W} from './config';
import {C0, cranePos, GAP, railAt, railFrame, STAR} from './scene';
import {add, Cam, lookAt, mix, mul, norm, path1, path3, sub, V3} from './v3';

// 一镜到底：前半段（笼内）用世界坐标关键帧，出笼后跟拍纸鹤

const c = (x: number, y: number, z: number): V3 => add(C0, [x, y, z]);

const preKeys: Array<[number, V3, V3, number?]> = [
  // t, 机位, 看向, 速度系数
  [CUE.zhiyin - 0.25, c(3.0, 1.15, 1.0), c(0, 0.18, 0.12)],
  [CUE.c1, c(2.85, 1.0, 0.65), c(0, 0.18, 0.15)],
  [CUE.c2, c(2.6, 0.55, -2.2), c(-1.32, 0.95, 0.5)],
  [CUE.c3, c(2.0, 0.85, -3.5), c(-1.42, 1.05, 0.66)],
  [CUE.c4, c(2.8, 1.6, -6.6), c(-1.0, 1.1, 0.7)],
  [CUE.c5, [5.5, 9.5, 6.0], c(0, -1.6, -1.5)],
  [CUE.c6, [3.2, 5.2, 2.8], [0, 21, 12]],
  [CUE.c7, [1.2, 4.2, 0.8], [0, 30, 1.5]],
  [CUE.c8, [-0.2, 4.0, -0.2], [-0.6, 30, -0.8]],
  [CUE.post, [-0.4, 4.4, -1.0], [-0.2, 23, 7]],
  [CUE.post + 2.8, [-0.2, 5.4, 1.5], c(0, 2.6, 0)],
  [CUE.bridge, [1.2, 5.8, 8.5], c(0, 2.2, 0)],
  [CUE.bridge + 2.8, c(3.6, 1.6, -6.4), c(0, 2.4, 1.0)],
  [CUE.bridge + 4.6, c(2.8, 0.55, -1.4), c(0, 0.45, 0.5)],
  [CUE.bridge + 7.0, c(2.1, 0.7, -2.6), c(-0.05, 0.3, 1.2)],
  [CUE.v1 - 1.4, c(0.7, 0.8, -2.4), add(GAP, [0, 0.25, 1.2])],
];
const prePos = path3(preKeys.map(([t, p, , w]) => (w === undefined ? [t, p, 1] : [t, p, w]) as [number, V3, number]));
const preTgt = path3(preKeys.map(([t, , q, w]) => (w === undefined ? [t, q, 1] : [t, q, w]) as [number, V3, number]));
// 首尾停稳
const preRoll = path1([
  [CUE.zhiyin, 0],
  [CUE.c6, 0.05],
  [CUE.c7, 0.22],
  [CUE.c8, 0.5],
  [CUE.post, 0.35],
  [CUE.post + 2.8, 0],
  [CUE.bridge + 4.6, -0.03],
  [CUE.v1, 0.05],
]);
const preFov = path1([
  [CUE.zhiyin, 34],
  [CUE.c2, 42],
  [CUE.c4, 50],
  [CUE.c6, 62],
  [CUE.c8, 68],
  [CUE.post + 2.8, 56],
  [CUE.bridge + 4.6, 42],
  [CUE.v1, 50],
]);

// 出笼后：相对纸鹤的偏移（轨道局部系 T/N/B 的系数），以及看向点的偏移
const postOff = path3([
  [CUE.v1 - 0.6, [-2.2, 0.2, 0.7], 0],
  [CUE.v1 + 1.2, [-3.6, 0.9, 1.1]],
  [CUE.v2 + 0.8, [-2.6, 4.2, 2.2]],
  [CUE.train + 0.6, [1.5, 8.5, 2.4]],
  [CUE.v4 + 0.6, [3.5, 5.0, -0.6]],
  [CUE.v5 + 0.8, [-1.0, 6.5, -2.4]],
  [CUE.v6 + 1.0, [-4.6, 2.6, -1.2]],
  [CUE.please1 + 0.8, [-4.2, 1.0, 0.0]],
  [CUE.please2 + 2, [-5.4, 0.6, 0.5]],
]);
const postFov = path1([
  [CUE.v1, 50],
  [CUE.v2, 56],
  [CUE.train, 62],
  [CUE.v5, 58],
  [CUE.please1, 46],
  [CUE.please2 + 2, 40],
]);
// 看向：纸鹤 → 纸鹤与星之间
const lookStar = path1([
  [CUE.v1, 0],
  [CUE.v2, 0.04],
  [CUE.train, 0.1],
  [CUE.v4, 0.08],
  [CUE.v6, 0.22],
  [CUE.please1, 0.45],
  [CUE.please2 + 1.5, 0.62],
]);

const railD = (p: V3) => {
  // 用纸鹤所在弧长取局部系：采样找最近点（足够精确）
  let best = 0, bd = 1e9;
  for (let d = 0; d < 140; d += 0.5) {
    const q = railAt(d);
    const e = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
    if (e < bd) {
      bd = e;
      best = d;
    }
  }
  return best;
};

export function camera(s: number): Cam {
  const k = ss(CUE.v1 - 1.2, CUE.v1 + 0.2, s);
  let pos = prePos(s), tgt = preTgt(s), roll = preRoll(s), fov = preFov(s);
  if (k > 0) {
    // 用滞后的纸鹤位置做跟拍，镜头更柔
    const cp = cranePos(s - 0.25);
    const fr = railFrame(railD(cp));
    const o = postOff(s);
    const pp = add(cp, add(add(mul(fr.T, o[0]), mul(fr.N, o[1])), mul(fr.B, o[2])));
    const tt = mix(cranePos(s), STAR, lookStar(s));
    pos = mix(pos, pp, k);
    tgt = mix(tgt, tt, k);
    roll = roll * (1 - k);
    fov = fov + (postFov(s) - fov) * k;
  }
  const focusD = Math.hypot(...sub(cranePos(s), pos));
  // 轻微手持漂浮感（很慢的低频）
  const drift: V3 = [
    0.03 * Math.sin(s * 0.53) + 0.02 * Math.sin(s * 1.31),
    0.025 * Math.sin(s * 0.71 + 1),
    0.03 * Math.sin(s * 0.47 + 2),
  ];
  return lookAt(add(pos, drift), tgt, roll, fov, W, H, focusD, 0.012);
}

export {norm, DEG};
