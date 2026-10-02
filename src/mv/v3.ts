import {clamp, lerp} from '../lib/math';

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
/** 绕单位轴 k 旋转（Rodrigues） */
export function rotAxis(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross(k, v), d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}
/** 球面方向：方位角 az（绕 y，0 = +z）、仰角 el */
export const sph = (az: number, el: number): V3 => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];

/**
 * 带时间的 Hermite 样条（三维）。key = [t, 点, 速度系数?]
 * 速度系数 1 = Catmull-Rom 自动切线，0 = 在该点停稳（缓入缓出）
 */
export function path3(k: Array<[number, V3, number?]>) {
  const n = k.length;
  const tan: V3[] = k.map((key, i) => {
    const w = key[2] ?? 1;
    if (n < 2 || w === 0) return [0, 0, 0];
    const a = k[Math.max(0, i - 1)], b = k[Math.min(n - 1, i + 1)];
    return mul(sub(b[1], a[1]), w / (b[0] - a[0]));
  });
  tan[0] = k[0][2] === undefined ? [0, 0, 0] : tan[0];
  tan[n - 1] = k[n - 1][2] === undefined ? [0, 0, 0] : tan[n - 1];
  return (t: number): V3 => {
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (t > k[i + 1][0]) i++;
    const t0 = k[i][0], t1 = k[i + 1][0], h = t1 - t0;
    const u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const p0 = k[i][1], p1 = k[i + 1][1], m0 = tan[i], m1 = tan[i + 1];
    return [0, 1, 2].map(c => h00 * p0[c] + h10 * h * m0[c] + h01 * p1[c] + h11 * h * m1[c]) as V3;
  };
}

/** 一维同款样条 */
export function path1(k: Array<[number, number, number?]>) {
  const p = path3(k.map(([t, v, w]) => (w === undefined ? [t, [v, 0, 0]] : [t, [v, 0, 0], w]) as [number, V3, number?]));
  return (t: number) => p(t)[0];
}

// ───────────── 相机 ─────────────
export interface Cam {
  pos: V3;
  f: V3;
  r: V3;
  u: V3;
  focal: number;
  cx: number;
  cy: number;
  /** 对焦距离与光圈（假景深：弥散圈像素 = aperture * |1/z - 1/focus| * focal） */
  focus: number;
  aperture: number;
}

export function lookAt(pos: V3, target: V3, roll: number, fovDeg: number, W: number, H: number, focus = 10, aperture = 0): Cam {
  const f = norm(sub(target, pos));
  let r = cross(f, [0, 1, 0]);
  if (len(r) < 1e-6) r = [1, 0, 0];
  r = norm(r);
  let u = cross(r, f);
  if (roll) {
    r = rotAxis(r, f, roll);
    u = rotAxis(u, f, roll);
  }
  const focal = H / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return {pos, f, r, u, focal, cx: W / 2, cy: H / 2, focus, aperture};
}

export const NEAR = 0.05;
/** 投影：返回 [sx, sy, z]（z 为沿视线深度），z < NEAR 时 z 为负 */
export function project(c: Cam, p: V3): V3 {
  const dx = p[0] - c.pos[0], dy = p[1] - c.pos[1], dz = p[2] - c.pos[2];
  const z = dx * c.f[0] + dy * c.f[1] + dz * c.f[2];
  if (z < NEAR) return [0, 0, -1];
  const x = dx * c.r[0] + dy * c.r[1] + dz * c.r[2];
  const y = dx * c.u[0] + dy * c.u[1] + dz * c.u[2];
  return [c.cx + (c.focal * x) / z, c.cy - (c.focal * y) / z, z];
}
/** 无穷远方向（天空）的投影 */
export function projectDir(c: Cam, d: V3): V3 {
  const z = dot(d, c.f);
  if (z < 0.02) return [0, 0, -1];
  return [c.cx + (c.focal * dot(d, c.r)) / z, c.cy - (c.focal * dot(d, c.u)) / z, z];
}
/** 景深弥散圈（像素） */
export const coc = (c: Cam, z: number) => c.aperture * c.focal * Math.abs(1 / z - 1 / c.focus);

// ───────────── 随机 / 噪声 ─────────────
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 平滑一维噪声（-1..1） */
export function noise1(x: number, seed = 0) {
  const h = (i: number) => {
    const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x), u = x - i, w = u * u * (3 - 2 * u);
  return lerp(h(i), h(i + 1), w);
}
export const sat = clamp;
