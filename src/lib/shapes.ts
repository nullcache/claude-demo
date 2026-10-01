import {clamp, P, TAU, V} from './math';

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** 圆（顺时针绕序，与 hull 一致，nonzero 填充即并集） */
export const circleD = (x: number, y: number, r: number) =>
  r <= 0.05
    ? ''
    : `M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x + r)} ${f(y)}Z`;

/** 两圆外公切线四边形 */
function hullD(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d < 1e-6 || d <= Math.abs(r1 - r2)) return '';
  const ux = dx / d, uy = dy / d;
  const g = Math.acos(clamp((r1 - r2) / d, -1, 1));
  const c = Math.cos(g), s = Math.sin(g);
  const ax = ux * c - uy * s, ay = ux * s + uy * c;
  const bx = ux * c + uy * s, by = -ux * s + uy * c;
  const q: P[] = [
    [x1 + r1 * ax, y1 + r1 * ay],
    [x2 + r2 * ax, y2 + r2 * ay],
    [x2 + r2 * bx, y2 + r2 * by],
    [x1 + r1 * bx, y1 + r1 * by],
  ];
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
  if (area < 0) q.reverse();
  return `M${f(q[0][0])} ${f(q[0][1])}L${f(q[1][0])} ${f(q[1][1])}L${f(q[2][0])} ${f(q[2][1])}L${f(q[3][0])} ${f(q[3][1])}Z`;
}

/** 变宽胶囊链（沿折线、每点半径不同）→ 平滑的流体带 / 橡皮管肢体 */
export function chainD(pts: P[], rs: number[]) {
  let d = '';
  for (let i = 0; i < pts.length; i++) d += circleD(pts[i][0], pts[i][1], rs[i]);
  for (let i = 0; i < pts.length - 1; i++) {
    d += hullD(pts[i][0], pts[i][1], Math.max(rs[i], 0.01), pts[i + 1][0], pts[i + 1][1], Math.max(rs[i + 1], 0.01));
  }
  return d;
}
export const ribbonD = (pts: P[], widths: number[]) => chainD(pts, widths.map(w => Math.max(0, w / 2)));

/** 过点的闭合 Catmull-Rom 平滑曲线 */
export function smoothD(pts: P[]) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(
      p2[1] - (p3[1] - p1[1]) / 6,
    )} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

/** 有机流体团块 */
export function blobPts(cx: number, cy: number, rx: number, ry: number, t: number, seed: number, amp: number, n = 14, rot = 0): P[] {
  const pts: P[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k =
      1 +
      amp *
        (0.55 * Math.sin(2 * a + t * 1.7 + seed) +
          0.3 * Math.sin(3 * a - t * 1.3 + seed * 1.7) +
          0.15 * Math.sin(5 * a + t * 2.3 + seed * 0.7));
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}
export const blobD = (cx: number, cy: number, rx: number, ry: number, t: number, seed: number, amp: number, n = 14, rot = 0) =>
  rx <= 0.1 || ry <= 0.1 ? '' : smoothD(blobPts(cx, cy, rx, ry, t, seed, amp, n, rot));

/**
 * 橡皮管（RubberHose）曲线：A→B，管长 L，按 sgn 侧弯曲。
 * 二次贝塞尔控制点沿法线偏移，二分求解使弧长≈L；距离超过 L 时伸直（允许轻微拉伸）。
 */
export function hose(A: P, B: P, L: number, sgn: number, n = 20): P[] {
  const d = V.sub(B, A);
  const dl = Math.hypot(d[0], d[1]) || 1e-6;
  const M = V.lerp(A, B, 0.5);
  const nrm: P = sgn > 0 ? [-d[1] / dl, d[0] / dl] : [d[1] / dl, -d[0] / dl];
  const quad = (C: P, s: number): P => {
    const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
    return [a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]];
  };
  const qlen = (h: number) => {
    const C = V.add(M, V.mul(nrm, h));
    let l = 0, prev = A;
    for (let i = 1; i <= 12; i++) {
      const p = quad(C, i / 12);
      l += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    return l;
  };
  let h = 0;
  if (dl < L) {
    let lo = 0, hi = L;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (qlen(mid) < L) lo = mid;
      else hi = mid;
    }
    h = (lo + hi) / 2;
  }
  const C = V.add(M, V.mul(nrm, h));
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) pts.push(quad(C, i / n));
  return pts;
}

/**
 * 两段式 IK 肢体（大腿/小腿、上臂/前臂），关节处做圆角过渡：
 * 比纯橡皮管更有“膝/肘”的结构感，又保持矢量 MG 的顺滑。
 * sgn 同 hose：腿 -1（膝盖朝前），手臂 +1（手肘朝后）。超出总长时允许轻微拉伸。
 */
export function limb(A: P, B: P, L1: number, L2: number, sgn: number, n = 24, round = 0.42): P[] {
  const d = V.sub(B, A);
  const dl = Math.max(1e-6, Math.hypot(d[0], d[1]));
  const k = dl > (L1 + L2) * 0.999 ? dl / ((L1 + L2) * 0.999) : 1;
  const l1 = L1 * k, l2 = L2 * k;
  const a = Math.acos(clamp((l1 * l1 + dl * dl - l2 * l2) / (2 * l1 * dl), -1, 1));
  const ang = Math.atan2(d[1], d[0]) + sgn * a;
  const K: P = [A[0] + Math.cos(ang) * l1, A[1] + Math.sin(ang) * l1];
  const rf = Math.min(l1, l2) * round;
  const u1 = V.norm(V.sub(K, A)), u2 = V.norm(V.sub(B, K));
  const P1 = V.sub(K, V.mul(u1, rf)), P2 = V.add(K, V.mul(u2, rf));
  const dense: P[] = [];
  for (let i = 0; i <= 16; i++) dense.push(V.lerp(A, P1, i / 16));
  for (let i = 1; i <= 16; i++) {
    const s = i / 16, q = 1 - s;
    dense.push([q * q * P1[0] + 2 * q * s * K[0] + s * s * P2[0], q * q * P1[1] + 2 * q * s * K[1] + s * s * P2[1]]);
  }
  for (let i = 1; i <= 16; i++) dense.push(V.lerp(P2, B, i / 16));
  return resample(dense, n);
}

/** 按弧长均匀重采样 */
export function resample(pts: P[], n: number): P[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const out: P[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (j < pts.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    out.push(V.lerp(pts[j], pts[j + 1], clamp((target - cum[j]) / seg)));
  }
  return out;
}

/** 折线终点切向 */
export const endDir = (pts: P[]): P => V.norm(V.sub(pts[pts.length - 1], pts[pts.length - 2]));

/** 取折线的一段 [s0, s1]（按点序参数） */
export function subPts(pts: P[], s0: number, s1: number, n = 10): P[] {
  const at = (s: number): P => {
    const x = s * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(x));
    return V.lerp(pts[i], pts[i + 1], x - i);
  };
  const out: P[] = [];
  for (let i = 0; i <= n; i++) out.push(at(s0 + ((s1 - s0) * i) / n));
  return out;
}
