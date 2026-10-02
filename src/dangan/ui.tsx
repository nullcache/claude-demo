import React from 'react';
import {P, TAU, V} from '../lib/math';
import {ribbonD, smoothD} from '../lib/shapes';
import {backOut, C, clamp, expoOut, F, H, lerp, prog, rng, W} from './core';

const f2 = (n: number) => Math.round(n * 10) / 10;
export const poly = (pts: P[]) => 'M' + pts.map(p => `${f2(p[0])} ${f2(p[1])}`).join('L') + 'Z';
export const line = (pts: P[]) => 'M' + pts.map(p => `${f2(p[0])} ${f2(p[1])}`).join('L');

// ───────────── 文字 ─────────────
interface TxtProps {
  x: number;
  y: number;
  size: number;
  children: React.ReactNode;
  font?: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  anchor?: 'start' | 'middle' | 'end';
  ls?: number; // letter-spacing（px）
  rot?: number;
  skew?: number;
  sx?: number;
  sy?: number;
  /** 立体挤出：层数、每层偏移、颜色 */
  depth?: [number, number, number, string];
  /** 色差分离（px） */
  rgb?: number;
  opacity?: number;
  weight?: number;
  style?: React.CSSProperties;
}
export const Txt: React.FC<TxtProps> = p => {
  const {x, y, size, children, font = F.sans, fill = C.white, stroke, sw = 0, anchor = 'middle', ls = 0} = p;
  const tf = `translate(${f2(x)} ${f2(y)}) rotate(${p.rot ?? 0}) skewX(${p.skew ?? 0}) scale(${p.sx ?? 1} ${p.sy ?? 1})`;
  const base = (fx: number, fy: number, col: string, st?: string, key?: string, extra?: React.SVGProps<SVGTextElement>) => (
    <text
      key={key}
      x={fx}
      y={fy}
      fontFamily={font}
      fontSize={size}
      fill={col}
      stroke={st}
      strokeWidth={st ? sw : undefined}
      strokeLinejoin="round"
      paintOrder="stroke"
      textAnchor={anchor}
      dominantBaseline="central"
      style={{letterSpacing: ls, fontKerning: 'normal', ...p.style}}
      {...extra}
    >
      {children}
    </text>
  );
  const layers: React.ReactNode[] = [];
  if (p.depth) {
    const [n, dx, dy, col] = p.depth;
    for (let i = n; i >= 1; i--) layers.push(base(dx * i, dy * i, col, sw ? col : undefined, `d${i}`));
  }
  if (p.rgb) {
    layers.push(base(-p.rgb, 0, C.cyan, undefined, 'rc', {style: {mixBlendMode: 'screen', letterSpacing: ls}, opacity: 0.85}));
    layers.push(base(p.rgb, 0, C.pink, undefined, 'rp', {style: {mixBlendMode: 'screen', letterSpacing: ls}, opacity: 0.85}));
  }
  layers.push(base(0, 0, fill, stroke, 'm'));
  return (
    <g transform={tf} opacity={p.opacity}>
      {layers}
    </g>
  );
};

// ───────────── 背景图形 ─────────────
/** 放射光芒（交替色扇形） */
export const Rays: React.FC<{cx: number; cy: number; n: number; rot: number; col: string; R?: number}> = ({cx, cy, n, rot, col, R = 2600}) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * TAU, a1 = a0 + (0.5 / n) * TAU;
    d += `M${cx} ${cy}L${f2(cx + Math.cos(a0) * R)} ${f2(cy + Math.sin(a0) * R)}L${f2(cx + Math.cos(a1) * R)} ${f2(cy + Math.sin(a1) * R)}Z`;
  }
  return <path d={d} fill={col} />;
};

/** 漫画集中线：每 2 帧重新抖动 */
export const SpeedLines: React.FC<{
  cx: number;
  cy: number;
  t: number;
  n?: number;
  inner?: number;
  col?: string;
  seed?: number;
  width?: number;
  opacity?: number;
}> = ({cx, cy, t, n = 90, inner = 330, col = C.white, seed = 1, width = 14, opacity = 1}) => {
  const r = rng(seed * 1000 + Math.floor(t * 30));
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const w = (0.2 + r() * r()) * width * 0.0013;
    const ri = inner * (0.85 + r() * 0.9);
    const R = 2400;
    d += `M${f2(cx + Math.cos(a) * ri)} ${f2(cy + Math.sin(a) * ri)}L${f2(cx + Math.cos(a - w) * R)} ${f2(cy + Math.sin(a - w) * R)}L${f2(
      cx + Math.cos(a + w) * R,
    )} ${f2(cy + Math.sin(a + w) * R)}Z`;
  }
  return <path d={d} fill={col} opacity={opacity} />;
};

/** 真·半调网点：半径由函数决定 */
export const Halftone: React.FC<{
  step?: number;
  fn: (x: number, y: number) => number;
  col: string;
  x0?: number;
  y0?: number;
  w?: number;
  h?: number;
  angle?: number;
}> = ({step = 26, fn, col, x0 = 0, y0 = 0, w = W, h = H, angle = 0}) => {
  let d = '';
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const span = Math.hypot(w, h) / 2 + step;
  for (let gy = -span; gy <= span; gy += step) {
    for (let gx = -span; gx <= span; gx += step) {
      const x = cx + gx * ca - gy * sa, y = cy + gx * sa + gy * ca;
      if (x < x0 - step || x > x0 + w + step || y < y0 - step || y > y0 + h + step) continue;
      const rr = fn(x, y) * step * 0.62;
      if (rr < 0.6) continue;
      d += `M${f2(x + rr)} ${f2(y)}a${f2(rr)} ${f2(rr)} 0 1 0 ${f2(-2 * rr)} 0a${f2(rr)} ${f2(rr)} 0 1 0 ${f2(2 * rr)} 0`;
    }
  }
  return <path d={d} fill={col} />;
};

/** 锯齿裂缝（“希望 / 绝望”分割线） */
export function zigzag(x: number, y0: number, y1: number, amp: number, seg: number, seed = 3): P[] {
  const r = rng(seed);
  const pts: P[] = [];
  let i = 0;
  for (let y = y0; y <= y1 + seg; y += seg, i++) pts.push([x + (i % 2 ? 1 : -1) * amp * (0.6 + 0.4 * r()), Math.min(y, y1)]);
  return pts;
}

// ───────────── 粉色血迹 ─────────────
interface SplatGeom {
  body: P[];
  drops: Array<{a: number; d: number; r: number; e: number}>;
  spikes: Array<{a: number; len: number; w: number}>;
  drips: Array<{x: number; w: number; len: number; delay: number}>;
}
export function splatGeom(seed: number, R: number): SplatGeom {
  const r = rng(seed);
  const body: P[] = [];
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.08;
    let k = 0.78 + r() * 0.3;
    if (r() < 0.28) k = 1.25 + r() * 0.55; // 触须
    body.push([Math.cos(a) * R * k, Math.sin(a) * R * k * 0.92]);
  }
  const drops = Array.from({length: 46}, () => {
    const d = 1.15 + Math.pow(r(), 1.6) * 1.9;
    return {a: r() * TAU, d, r: R * (0.11 - 0.035 * d) * (0.4 + r() * 0.8), e: 1 + r() * 1.4};
  });
  const spikes = Array.from({length: 11}, () => ({a: r() * TAU, len: R * (1.6 + r() * 1.3), w: R * (0.07 + r() * 0.08)}));
  const drips = Array.from({length: 6}, () => ({x: (r() - 0.5) * R * 1.4, w: R * (0.06 + r() * 0.07), len: R * (0.6 + r() * 1.6), delay: r() * 0.3}));
  return {body, drops, spikes, drips};
}
export const Splat: React.FC<{g: SplatGeom; x: number; y: number; p: number; drip?: number; col?: string; rot?: number; s?: number}> = ({
  g,
  x,
  y,
  p,
  drip = 0,
  col = C.pink,
  rot = 0,
  s = 1,
}) => {
  if (p <= 0) return null;
  const k = backOut(clamp(p * 1.6), 1.4);
  const fly = expoOut(p);
  const body = g.body.map(([px, py]) => [px * k, py * k] as P);
  let d = smoothD(body);
  for (const sp of g.spikes) {
    const L = sp.len * fly;
    const dir: P = [Math.cos(sp.a), Math.sin(sp.a)];
    const pts: P[] = [], ws: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push(V.mul(dir, lerp(sp.len * 0.25, L, u)));
      ws.push(sp.w * 2 * (1 - u * 0.92));
    }
    d += ribbonD(pts, ws);
    const tip = V.mul(dir, L + sp.w * 1.4);
    const tr = sp.w * 0.9 * fly;
    d += `M${f2(tip[0] + tr)} ${f2(tip[1])}a${f2(tr)} ${f2(tr)} 0 1 0 ${f2(-2 * tr)} 0a${f2(tr)} ${f2(tr)} 0 1 0 ${f2(2 * tr)} 0`;
  }
  const R0 = Math.hypot(g.body[0][0], g.body[0][1]);
  const drops = g.drops.map((dp, i) => {
    const dd = R0 * lerp(0.6, dp.d, fly);
    const cx = Math.cos(dp.a) * dd, cy = Math.sin(dp.a) * dd;
    const e = lerp(1, dp.e, fly);
    return <ellipse key={i} cx={f2(cx)} cy={f2(cy)} rx={f2(dp.r * e)} ry={f2(dp.r / Math.sqrt(e))} transform={`rotate(${f2((dp.a * 180) / Math.PI)} ${f2(cx)} ${f2(cy)})`} />;
  });
  const drips = g.drips.map((dr, i) => {
    const u = clamp((drip - dr.delay) / (1 - dr.delay));
    if (u <= 0) return null;
    const L = dr.len * Math.pow(u, 0.7);
    const y0 = R0 * 0.55;
    const pts: P[] = [[dr.x, y0], [dr.x, y0 + L * 0.5], [dr.x, y0 + L]];
    return (
      <g key={'d' + i}>
        <path d={ribbonD(pts, [dr.w * 2, dr.w * 1.3, dr.w * 1.1])} />
        <circle cx={dr.x} cy={y0 + L} r={dr.w * 1.05} />
      </g>
    );
  });
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) rotate(${rot}) scale(${s})`} fill={col}>
      <path d={d} />
      {drops}
      {drips}
    </g>
  );
};

// ───────────── 玻璃碎裂 ─────────────
export interface Shard {
  pts: P[];
  c: P;
  rnd: number;
  rnd2: number;
  ring: number;
}
/** 由冲击点放射的蛛网状裂片（真实玻璃破裂结构） */
export function glassShards(cx: number, cy: number, seed: number, rays = 14, rings = [0, 70, 170, 320, 540, 860, 1500]): Shard[] {
  const r = rng(seed);
  const angs = Array.from({length: rays}, (_, i) => ((i + (r() - 0.5) * 0.7) / rays) * TAU);
  const rad = rings.map((R, j) => angs.map(() => (j === 0 ? 0 : R * (0.82 + r() * 0.36))));
  const at = (i: number, j: number): P => {
    const a = angs[i % rays];
    const R = rad[j][i % rays];
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  };
  const out: Shard[] = [];
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < rays; i++) {
      const quad: P[] = j === 0 ? [at(i, 0), at(i, 1), at(i + 1, 1)] : [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)];
      const pieces: P[][] = quad.length === 4 && r() < 0.55 ? (r() < 0.5 ? [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] : [[quad[0], quad[1], quad[3]], [quad[1], quad[2], quad[3]]]) : [quad];
      for (const pc of pieces) {
        const c: P = [pc.reduce((s, p) => s + p[0], 0) / pc.length, pc.reduce((s, p) => s + p[1], 0) / pc.length];
        out.push({pts: pc, c, rnd: r(), rnd2: r(), ring: j});
      }
    }
  }
  return out;
}
/** 裂纹线（按从中心向外的顺序显现） */
export const Cracks: React.FC<{shards: Shard[]; cx: number; cy: number; p: number; col?: string; w?: number; maxR?: number}> = ({
  shards,
  cx,
  cy,
  p,
  col = C.white,
  w = 3,
  maxR = 1300,
}) => {
  if (p <= 0) return null;
  let d = '';
  const lim = p * maxR;
  for (const s of shards) {
    for (let i = 0; i < s.pts.length; i++) {
      const a = s.pts[i], q = s.pts[(i + 1) % s.pts.length];
      const da = Math.hypot(a[0] - cx, a[1] - cy), dq = Math.hypot(q[0] - cx, q[1] - cy);
      if (Math.min(da, dq) > lim) continue;
      const near = da < dq ? a : q, far = da < dq ? q : a;
      const u = clamp((lim - Math.min(da, dq)) / (Math.abs(dq - da) + 1));
      const e = V.lerp(near, far, u);
      d += `M${f2(near[0])} ${f2(near[1])}L${f2(e[0])} ${f2(e[1])}`;
    }
  }
  return <path d={d} stroke={col} strokeWidth={w} fill="none" strokeLinecap="round" />;
};

/** 弹孔放射裂纹：带折角与分叉的锥形裂线 + 内圈碎环 */
export function bulletCracks(seed: number, n = 15): Array<{pts: P[]; w: number}> {
  const r = rng(seed);
  const out: Array<{pts: P[]; w: number}> = [];
  for (let i = 0; i < n; i++) {
    let a = (i / n) * TAU + (r() - 0.5) * 0.3;
    const L = 70 + Math.pow(r(), 0.7) * 230;
    const segs = 4 + Math.floor(r() * 3);
    const pts: P[] = [[Math.cos(a) * 26, Math.sin(a) * 26]];
    for (let k = 1; k <= segs; k++) {
      a += (r() - 0.5) * 0.45;
      const d = 26 + (L * k) / segs;
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
      if (k === 2 && r() < 0.6) {
        const ba = a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.4);
        const p0 = pts[pts.length - 1];
        out.push({pts: [p0, [p0[0] + Math.cos(ba) * L * 0.3, p0[1] + Math.sin(ba) * L * 0.3]], w: 1.6});
      }
    }
    out.push({pts, w: 3.2});
  }
  for (let i = 0; i < 6; i++) {
    const a0 = r() * TAU, rad = 34 + r() * 40;
    const pts: P[] = Array.from({length: 5}, (_, k) => {
      const a = a0 + k * 0.12;
      return [Math.cos(a) * rad, Math.sin(a) * rad] as P;
    });
    out.push({pts, w: 1.8});
  }
  return out;
}

/** 爆炸对白框（漫画锯齿气泡） */
export function burstPts(cx: number, cy: number, rx: number, ry: number, n: number, seed: number, inner = 0.72): P[] {
  const r = rng(seed);
  const pts: P[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU;
    const k = i % 2 === 0 ? 1 + r() * 0.22 : inner + r() * 0.08;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

// ───────────── HUD ─────────────
/** 准星：lock 0→1 时收紧并变色 */
export const Reticle: React.FC<{x: number; y: number; t: number; lock: number; s?: number}> = ({x, y, t, lock, s = 1}) => {
  const R = lerp(120, 64, expoOut(lock)) * s;
  const col = lock > 0.5 ? C.yellow : C.white;
  const ticks = [0, 1, 2, 3].map(i => {
    const a = (i * TAU) / 4 + lock * 0.785;
    return (
      <path
        key={i}
        d={`M${f2(Math.cos(a) * (R + 10))} ${f2(Math.sin(a) * (R + 10))}L${f2(Math.cos(a) * (R + 38))} ${f2(Math.sin(a) * (R + 38))}`}
        stroke={col}
        strokeWidth={6}
        strokeLinecap="square"
      />
    );
  });
  return (
    <g transform={`translate(${f2(x)} ${f2(y)})`}>
      <circle r={R} fill="none" stroke={col} strokeWidth={5} />
      <circle r={R + 22} fill="none" stroke={col} strokeWidth={2.5} strokeDasharray="18 14" transform={`rotate(${t * 140})`} opacity={0.8} />
      {ticks}
      <circle r={6} fill={col} />
    </g>
  );
};

/** 游戏内对话框 + 名牌 */
export const DialogueBox: React.FC<{name: string; text: string; p: number; chars: number; y?: number}> = ({name, text, p, chars, y = 846}) => {
  if (p <= 0) return null;
  const e = expoOut(p);
  const shown = text.slice(0, Math.max(0, Math.floor(chars)));
  return (
    <g opacity={e} transform={`translate(0 ${f2((1 - e) * 40)})`}>
      <path d={`M150 ${y}L1790 ${y}L1770 ${y + 172}L130 ${y + 172}Z`} fill={C.ink} opacity={0.88} />
      <path d={`M150 ${y}L1790 ${y}L1770 ${y + 172}L130 ${y + 172}Z`} fill="none" stroke={C.white} strokeWidth={2} opacity={0.5} />
      <path d={`M178 ${y - 34}L478 ${y - 34}L460 ${y + 22}L160 ${y + 22}Z`} fill={C.pink} />
      <Txt x={318} y={y - 6} size={36} font={F.sans} fill={C.white} ls={6}>
        {name}
      </Txt>
      <Txt x={210} y={y + 98} size={50} font={F.mid} fill={C.white} anchor="start" ls={2}>
        {shown}
      </Txt>
    </g>
  );
};

/** 定向运动模糊滤镜（仅 x 或 y 方向） */
export const MBlur: React.FC<{id: string; x?: number; y?: number; children: React.ReactNode}> = ({id, x = 0, y = 0, children}) => {
  if (x < 0.3 && y < 0.3) return <>{children}</>;
  return (
    <g filter={`url(#${id})`}>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={`${f2(x)} ${f2(y)}`} />
        </filter>
      </defs>
      {children}
    </g>
  );
};

export const Glow: React.FC<{id: string; r: number; children: React.ReactNode; strength?: number}> = ({id, r, children, strength = 1}) => (
  <g>
    <defs>
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={r} result="b" />
        <feComponentTransfer in="b" result="bb">
          <feFuncA type="linear" slope={strength} />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="bb" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter={`url(#${id})`}>{children}</g>
  </g>
);

/** 镜头光斑十字星 */
export const Glint: React.FC<{x: number; y: number; s: number; col?: string; rot?: number}> = ({x, y, s, col = C.white, rot = 0}) => {
  if (s <= 0.01) return null;
  const L = 120 * s, w = 7 * s;
  const d = `M${-L} 0Q0 ${-w} ${L} 0Q0 ${w} ${-L} 0ZM0 ${-L}Q${w} 0 0 ${L}Q${-w} 0 0 ${-L}Z`;
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) rotate(${rot})`}>
      <path d={d} fill={col} />
      <path d={d} fill={col} transform="rotate(45) scale(0.45)" />
      <circle r={9 * s} fill={col} />
    </g>
  );
};

export const progs = prog;
