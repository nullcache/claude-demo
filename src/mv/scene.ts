import {bump, clamp, DEG, E, lerp, prog, ss} from '../lib/math';
import {BEAT, CUE, DOWNBEAT} from './config';
import {add, mul, norm, path1, path3, sph, sub, V3, cross, len, dot} from './v3';

// ───────────── 世界 ─────────────
// 一座世界大小的网状鸟笼（半球穹顶，经纬线 = 网），纸鹤（那颗渴望自由的心）贴着网壁；
// 歌声从穹顶外的那颗星传来，把网结一颗颗点成星；一根光线穿过“没空隙的网”，
// 纸鹤从缺口飞出，沿着光线化成的银河铁道去追那颗星。

export const R = 24; // 穹顶半径
// 缺口中心放在一个网格的正中（方位 1.25°、仰角 15°），撑开时四周的线被推成圆
export const GAP_DIR: V3 = sph(1.25 * DEG, 15 * DEG);
export const CRANE_DIR: V3 = sph(1.25 * DEG, 14.4 * DEG);
export const C0: V3 = mul(CRANE_DIR, R - 1.0); // 纸鹤停在网壁内侧
export const GAP: V3 = mul(GAP_DIR, R);
export const STAR: V3 = [0, 34, 0]; // 唱歌的那颗星（穹顶正上方，网外）

// ───────────── 网的状态 ─────────────
/** 三层网：0 粗（10°/8°）→ 1（5°/4°）→ 2 细（2.5°/2°），从纸鹤处向外“织”开 */
export const netWeave = (lv: number, s: number) => {
  const t0 = [CUE.c2, CUE.c2 + 0.55, CUE.c2 + 1.1][lv]; // 「困在一张」织出粗网，「没空隙」织满
  return (s - t0) * [62, 80, 95][lv] * DEG; // 已织到的角半径
};
/** 撞网：「太耀眼」时纸鹤冲向光，在「灼」字撞上网，被弹回 */
export const T_HIT = CUE.c4 + 1.5;
export const bulge = (s: number) => {
  if (s < T_HIT - 0.2) return 0;
  const x = s - T_HIT;
  if (x < 0) return 0.95 * E.o2(prog(s, T_HIT - 0.2, T_HIT));
  return 0.95 * Math.exp(-2.6 * x) * Math.cos(5.2 * x);
};
/** 网上的缺口：光线穿过之后，以穿过点为圆心慢慢撑开 */
export const holeOpen = (s: number) => E.io3(prog(s, CUE.bridge + 5.0, CUE.v1 - 1.8));
export const HOLE_R = 3.4 * DEG;
/** 歌声光环：从穹顶顶点向下扫，每扫过一圈纬线就点亮那一圈网结 */
export const RINGS = [CUE.c7, CUE.c7 + 2 * BEAT, CUE.c8, CUE.c8 + 2 * BEAT]; // 落在拍点上
export const RING_SPEED = 38 * DEG; // 每秒下扫的角度
export const ringEl = (k: number, s: number) => Math.PI / 2 - (s - RINGS[k]) * RING_SPEED;
/** 网线的亮度系数（点亮成星后网线退成星座连线） */
export const netLineVis = (s: number) => lerp(1, 0.38, ss(CUE.c8, CUE.post + 1.5, s)) * lerp(1, 0.55, ss(CUE.v1, CUE.v1 + 6, s));
/** 外圈楼群的窗：「我们的周围并非没光亮」时一栋栋亮起来 */
export const towerLights = (s: number, seed: number) => {
  const t0 = CUE.c3 + 0.1 + seed * 1.7;
  const tt = s - t0;
  if (tt < 0) return 0.22;
  if (tt < 0.06) return 0.9;
  if (tt < 0.12) return 0.3;
  if (tt < 0.18) return 1;
  return 1;
};
/** 「太耀眼」：整体曝光推高，撞网那一下闪白 */
export const exposure = (s: number) => 1 + 0.7 * ss(CUE.c4, T_HIT, s) * (1 - ss(T_HIT, T_HIT + 0.5, s));
export const whiteFlash = (s: number) => {
  const hit = s >= T_HIT ? Math.exp(-(s - T_HIT) * 9) : 0;
  const star = s >= CUE.c6 ? 0.45 * Math.exp(-(s - CUE.c6) * 6) : 0;
  const train = s >= CUE.train ? 0.25 * Math.exp(-(s - CUE.train) * 8) : 0;
  return Math.max(hit, star, train);
};
/** 网外真实天空的可见度 */
export const skyVis = (s: number) => 0.1 + 0.9 * ss(CUE.c8 + 0.5, CUE.post + 4, s);

// ───────────── 星 ─────────────
export const starOn = (s: number) => {
  const ig = prog(s, CUE.c6 - 0.02, CUE.c6 + 0.5);
  return ig <= 0 ? 0 : E.o3(ig);
};
export const starFlash = (s: number) => bump(s, CUE.c6 - 0.02, CUE.c6 + 0.12, CUE.c6 + 0.2, CUE.c6 + 1.4);

// ───────────── 铁道（光线化成的轨道）─────────────
// 从缺口外侧出发，绕着穹顶外壁螺旋上升，最后卷进那颗星
function railRaw(u: number): V3 {
  const y = lerp(GAP[1], STAR[1], Math.pow(u, 0.9));
  const rd = Math.sqrt(Math.max(0, R * R - y * y) + 6);
  const clear = 1.9 + 3.2 * Math.pow(Math.sin(Math.PI * Math.min(u, 0.999)), 0.8);
  const r = (rd + clear) * (1 - ss(0.74, 1, u));
  const az = 1.25 * DEG - 4.0 * Math.pow(u, 1.7); // 下段几乎竖直贴着穹顶垂下来，上段盘旋
  return [r * Math.sin(az), y, r * Math.cos(az)];
}
const RN = 900;
const RAIL_PTS: V3[] = [];
const RAIL_LEN: number[] = [];
{
  let acc = 0;
  for (let i = 0; i <= RN; i++) {
    const p = railRaw(i / RN);
    if (i > 0) acc += len(sub(p, RAIL_PTS[i - 1]));
    RAIL_PTS.push(p);
    RAIL_LEN.push(acc);
  }
}
export const RAIL_TOTAL = RAIL_LEN[RN];
export const railPts = RAIL_PTS;
/** 按弧长取点（0..RAIL_TOTAL） */
export function railAt(d: number): V3 {
  d = clamp(d, 0, RAIL_TOTAL);
  let lo = 0, hi = RN;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (RAIL_LEN[m] < d) lo = m;
    else hi = m;
  }
  const u = (d - RAIL_LEN[lo]) / Math.max(1e-6, RAIL_LEN[hi] - RAIL_LEN[lo]);
  const a = RAIL_PTS[lo], b = RAIL_PTS[hi];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}
/** 轨道的局部坐标系：T 切向、N 水平向外、B 上 */
export function railFrame(d: number) {
  const p = railAt(d);
  const T = norm(sub(railAt(d + 0.6), railAt(d - 0.6)));
  let N = norm([p[0], 0, p[2]]);
  if (len([p[0], 0, p[2]]) < 0.5) N = [0, 0, 1];
  const B = norm(cross(N, T));
  N = norm(cross(T, B));
  return {p, T, N, B};
}

/** 光线（尾奏前从星垂下来）：可见段从轨道顶端 → 弧长 threadTip */
export const threadTip = (s: number) => RAIL_TOTAL * (1 - E.io2(prog(s, CUE.bridge - 0.2, CUE.bridge + 4.2)));
/** 光线最后一段：轨道起点 → 穿过网 → 纸鹤喙 */
export const threadLast = (s: number) => E.io2(prog(s, CUE.bridge + 4.0, CUE.bridge + 4.7));
export const threadVis = (s: number) => ss(CUE.bridge - 0.3, CUE.bridge + 0.4, s) * (1 - 0.35 * ss(CUE.train - 1, CUE.train + 1, s));

/** 列车：车头所在弧长 */
export const trainHead = path1([
  [CUE.train - 1.2, -6],
  [CUE.train + 2.2, 14, 1],
  [CUE.please1, RAIL_TOTAL * 0.82, 1],
  [CUE.please2 + 1.2, RAIL_TOTAL + 14],
]);
export const trainVis = (s: number) => ss(CUE.train - 1.0, CUE.train + 0.6, s);
export const CAR_LEN = 2.1;
export const CARS = 6;

// ───────────── 纸鹤 ─────────────
/** 纸鹤沿轨道飞行时的弧长 */
const craneRail = path1([
  [CUE.v1 + 0.2, 1.5, 1],
  [CUE.train, 10, 1],
  [CUE.v4 + 0.6, 17, 1],
  [CUE.v6, RAIL_TOTAL * 0.55, 1],
  [CUE.please2, RAIL_TOTAL * 0.86, 1],
  [CUE.please2 + 2.2, RAIL_TOTAL * 0.93],
]);
const railOffset = (s: number): V3 => [lerp(1.3, 0.9, ss(CUE.v4, CUE.v6, s)), 0.75 + 0.5 * ss(CUE.v6, CUE.please2, s), 0];
function craneOnRail(s: number): V3 {
  const f = railFrame(craneRail(s));
  const o = railOffset(s);
  return add(f.p, add(mul(f.N, o[0]), mul(f.B, o[1])));
}

const N_OUT = GAP_DIR;
const cranePre = path3([
  [CUE.zhiyin - 0.3, C0],
  [CUE.c4 - 0.1, add(C0, [0, -0.03, -0.28]), 0], // 蓄力后退
  [T_HIT, add(C0, mul(N_OUT, 0.92)), 0.6], // 撞网
  [T_HIT + 0.8, add(C0, [0, -0.5, -0.9]), 0], // 弹回
  [CUE.c6 - 0.1, add(C0, [0, -1.3, -1.1]), 0], // 「迷茫」里往下沉
  [CUE.c7 - 0.2, add(C0, [0, -0.9, -0.8]), 0], // 看见星，慢慢浮起
  [CUE.post, add(C0, [0, -0.6, -0.5]), 0],
  [CUE.bridge, add(C0, [0, -0.3, -0.3]), 0],
  [CUE.bridge + 3.8, add(C0, [0, 0.0, -0.1]), 0],
  [CUE.v1 - 2.4, add(C0, [0, 0.06, 0.05]), 0],
  [CUE.v1 - 0.9, add(GAP, mul(N_OUT, -0.3)), 1],
]);
// 出口之后：用轨道采样出关键帧，和前段拼成一条连续样条
const craneKeys: Array<[number, V3, number?]> = [
  [CUE.v1 - 2.4, cranePre(CUE.v1 - 2.4), 0],
  [CUE.v1 - 0.9, cranePre(CUE.v1 - 0.9), 1],
  [CUE.v1 + 0.2, add(GAP, mul(N_OUT, 1.9)), 1],
];
for (let s = CUE.v1 + 1.4; s < CUE.please2 + 2.4; s += 0.8) craneKeys.push([s, craneOnRail(s), 1]);
const cranePost = path3(craneKeys);
export const cranePos = (s: number): V3 => (s < CUE.v1 - 2.4 ? cranePre(s) : cranePost(s));

/** 朝向：停留时朝网外（+z），飞行时朝速度方向，并按弯道倾侧 */
export function craneFrame(s: number) {
  const p = cranePos(s);
  const dt = 0.05;
  const v = mul(sub(cranePos(s + dt), cranePos(s - dt)), 1 / (2 * dt));
  const sp = len(v);
  const fly = ss(CUE.v1 - 1.6, CUE.v1 - 0.6, s);
  const idle = norm(add(N_OUT, [0.05 * Math.sin(s * 0.7), 0.06 * craneHead(s), 0]));
  let fwd = sp > 0.05 && fly > 0 ? norm(add(mul(idle, 1 - fly), mul(norm(v), fly))) : idle;
  fwd = norm([fwd[0], fwd[1] * 0.75, fwd[2]]);
  // 倾侧：横向加速度
  const a = mul(add(sub(cranePos(s + dt), mul(p, 2)), cranePos(s - dt)), 1 / (dt * dt));
  const side = norm(cross(fwd, [0, 1, 0]));
  const bank = clamp(dot(a, side) * 0.05, -0.5, 0.5) * fly;
  return {p, fwd, bank, speed: sp};
}

/** 低头/抬头（-1..1） */
export const craneHead = path1([
  [CUE.c1, 0.1],
  [CUE.c2, 0.25],
  [CUE.c4, 0.5],
  [T_HIT, 0.6],
  [T_HIT + 0.8, -0.4],
  [CUE.c6 - 0.1, -0.85],
  [CUE.c6 + 0.4, 0.2],
  [CUE.c6 + 1.0, 0.9], // 抬头看见那颗星
  [CUE.c8 + 1.0, 0.8],
  [CUE.post + 2.0, 0.5],
  [CUE.bridge, 0.9],
  [CUE.bridge + 3.0, 0.8],
  [CUE.bridge + 4.0, 0.25],
  [CUE.v1 - 1.5, 0.05],
  [CUE.v1 + 1, 0.2],
  [CUE.please1, 0.45],
]);

/** 翅膀抬起角（弧度，正 = 向上），含扇动 */
export function craneWing(s: number) {
  const rest = path1([
    [CUE.zhiyin, 0.42],
    [CUE.c2, 0.55],
    [CUE.c4 - 0.2, 0.62],
    [CUE.c4 + 0.1, 0.15],
    [T_HIT + 0.1, 0.2],
    [T_HIT + 0.8, 0.9],
    [CUE.c6 - 0.1, 0.25],
    [CUE.c6 + 1, 0.5],
    [CUE.c7 + 1, 0.6],
    [CUE.post + 2, 0.2],
    [CUE.bridge + 4.4, 0.35],
    [CUE.v1 - 1.6, 0.95],
    [CUE.v1 - 0.4, 0.85],
    [CUE.v1 + 0.6, 0.15],
  ])(s);
  // 撞网前的两下急扇、出网后的慢扇（两拍一下）
  const lunge = bump(s, CUE.c4 - 0.1, CUE.c4 + 0.1, T_HIT + 0.05, T_HIT + 0.4) * 0.72 * Math.sin(((s - CUE.c4) / BEAT) * 2 * Math.PI); // 一拍一扇
  const flyW = ss(CUE.v1 + 0.2, CUE.v1 + 1.2, s) * (1 - 0.6 * bump(s, CUE.please2 - 0.4, CUE.please2 + 0.4, 99, 100));
  const flap = flyW * 0.62 * Math.sin(((s - DOWNBEAT) / (BEAT * 2)) * 2 * Math.PI);
  const breathe = 0.06 * Math.sin(s * 1.7);
  return {base: rest + lunge + breathe, flap};
}

/** 心跳：两拍一次 lub-dub */
export function heartbeat(s: number) {
  const ph = (((s - DOWNBEAT) / (BEAT * 2)) % 1 + 1) % 1;
  const p = (x: number, w: number) => Math.exp(-((x * x) / (w * w)));
  return p(ph, 0.05) + 0.6 * p(ph - 0.2, 0.05) + p(ph - 1, 0.05);
}
/** 心光整体强度 */
export const heartGlow = (s: number) =>
  E.o3(prog(s, CUE.zhiyin - 0.05, CUE.zhiyin + 0.55)) * (1 + 0.25 * ss(CUE.v1, CUE.v1 + 1, s));

export {lerp, ss};
