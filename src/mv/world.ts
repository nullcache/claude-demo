import {bump, clamp, DEG, E, lerp, prog, ss, TAU} from '../lib/math';
import {COL, CUE, rgba} from './config';
import {
  bulge, CAR_LEN, CARS, CRANE_DIR, GAP, GAP_DIR, HOLE_R, holeOpen, netLineVis, netWeave, R, railAt, railFrame, railPts,
  RAIL_TOTAL, RINGS, RING_SPEED, ringEl, skyVis, STAR, starFlash, starOn, threadLast, threadTip, threadVis, trainHead,
  trainVis,
} from './scene';
import {blit, bokeh, flare, glow} from './sprites';
import {add, Cam, coc, cross, dot, len, mul, noise1, norm, project, projectDir, rng, rotAxis, sph, sub, V3} from './v3';

type Ctx = CanvasRenderingContext2D;

// ═════════════ 网 ═════════════
const AZ_STEP = 2.5 * DEG, EL_STEP = 2 * DEG;
const NM = 144, NP = 44; // 经线 144 根、纬线 0..86°
const lvOf = (i: number) => (i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2);
const MER_TOP = [86, 76, 62].map(x => x * DEG); // 细的经线不升到顶，避免顶点过密
const SPACING = [4, 2, 1]; // 各层的近似网格边长（世界单位）

interface Line {
  lv: number;
  pts: Array<[number, number]>; // (az, el)
  isPar: boolean;
  j: number;
}
const LINES: Line[] = [];
for (let i = 0; i < NM; i++) {
  const lv = lvOf(i), az = i * AZ_STEP, top = MER_TOP[lv];
  const pts: Array<[number, number]> = [];
  for (let e = 0; e <= top + 1e-6; e += 1 * DEG) pts.push([az, e]);
  LINES.push({lv, pts, isPar: false, j: -1});
}
for (let j = 0; j < NP; j++) {
  const lv = lvOf(j), el = j * EL_STEP;
  const pts: Array<[number, number]> = [];
  for (let a = 0; a <= 360; a += 1) pts.push([a * DEG, el]);
  LINES.push({lv, pts, isPar: true, j});
}
interface Knot {
  az: number;
  el: number;
  lv: number;
  jit: number;
  tw: number;
  ph: number;
  warm: boolean;
}
const KNOTS: Knot[] = [];
{
  const r = rng(77);
  for (let i = 0; i < NM; i++)
    for (let j = 0; j < NP; j++) {
      const el = j * EL_STEP;
      if (el > MER_TOP[lvOf(i)] + 1e-6) continue;
      KNOTS.push({az: i * AZ_STEP, el, lv: Math.max(lvOf(i), lvOf(j)), jit: r(), tw: 0.6 + 2.2 * r(), ph: r() * TAU, warm: r() < 0.72});
    }
}

const angDist = (a: V3, b: V3) => Math.acos(clamp(dot(a, b), -1, 1));

/** 网上一点的世界坐标（含撞网鼓包、缺口撑开、手工编织的微小不规则） */
export function netPoint(az: number, el: number, s: number, bul: number, hole: number): V3 {
  const jaz = az + 0.05 * DEG * Math.sin(el * 37 + az * 11);
  const jel = el + 0.05 * DEG * Math.sin(az * 29 + el * 13);
  let d = sph(jaz, jel);
  let r = R;
  if (bul !== 0) {
    const dl = angDist(d, CRANE_DIR);
    r += bul * Math.exp(-((dl / (6.5 * DEG)) ** 2));
  }
  if (hole > 0) {
    const dg = angDist(d, GAP_DIR);
    const inf = HOLE_R * 3.2;
    if (dg < inf && dg > 1e-5) {
      const nd = dg + hole * HOLE_R * (1 - dg / inf) ** 2;
      const ax = norm(cross(GAP_DIR, d));
      d = rotAxis(d, ax, nd - dg);
      r += hole * 0.18 * (1 - dg / inf); // 缺口边缘被往外顶一点
    }
  }
  return mul(d, r);
}

/** 一个网结被歌声点亮的时刻 */
const litAt = (k: Knot, ring: number) => RINGS[ring] + (Math.PI / 2 - k.el) / RING_SPEED + k.jit * 0.12;
const parLit = (el: number, s: number) => ss(RINGS[0] + (Math.PI / 2 - el) / RING_SPEED, RINGS[0] + (Math.PI / 2 - el) / RING_SPEED + 0.4, s);

interface NetSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
  a: number;
  w: number;
  warm: number;
}

/** 预计算本帧的网线段，按深度分到 far / near 两组（以纸鹤深度为界） */
export function buildNet(cam: Cam, s: number) {
  const segs: NetSeg[] = [];
  const bul = bulge(s), hole = holeOpen(s), vis = netLineVis(s);
  for (const L of LINES) {
    const reach = netWeave(L.lv, s);
    if (reach <= 0) continue;
    const base = [0.62, 0.46, 0.34][L.lv] * vis;
    let prev: V3 | null = null;
    let prevOk = false;
    let prevD = 0;
    for (const [az, el] of L.pts) {
      const w = netPoint(az, el, s, bul, hole);
      const dc = angDist(norm(w), CRANE_DIR);
      const ok = dc <= reach;
      const p = project(cam, w);
      if (prev && ok && prevOk && p[2] > 0 && prev[2] > 0) {
        const z = (p[2] + prev[2]) / 2;
        const lod = ss(2.2, 9, (SPACING[L.lv] * cam.focal) / z);
        // 编织前沿：刚织好的那一圈更亮
        const front = 1 + 2.2 * Math.exp(-(((reach - (dc + prevD) / 2) / (2.2 * DEG)) ** 2)) * (1 - ss(0, 2.5, reach - 40 * DEG));
        const fog = 1 / (1 + z * 0.02);
        const b = coc(cam, z);
        const lit = L.isPar ? parLit(el, s) : parLit(Math.max(el, 10 * DEG), s) * 0.8;
        const a = base * lod * fog * front / (1 + b * 0.45);
        if (a > 0.008) segs.push({x0: prev[0], y0: prev[1], x1: p[0], y1: p[1], z, a, w: 1.05 + b * 0.7, warm: lit});
      }
      prev = p;
      prevOk = ok;
      prevD = dc;
    }
  }
  return segs;
}

export function drawNetSegs(ctx: Ctx, segs: NetSeg[], zMin: number, zMax: number) {
  // 分桶批量描边：颜色(冷/暖) × 透明度 × 线宽
  const buckets = new Map<number, Path2D>();
  for (const g of segs) {
    if (g.z < zMin || g.z >= zMax) continue;
    const ai = Math.min(23, Math.round(g.a * 24));
    if (ai <= 0) continue;
    const wi = Math.min(7, Math.round((g.w - 1) * 2));
    const ci = g.warm > 0.5 ? 1 : 0;
    const key = ci * 1000 + wi * 30 + ai;
    let p = buckets.get(key);
    if (!p) buckets.set(key, (p = new Path2D()));
    p.moveTo(g.x0, g.y0);
    p.lineTo(g.x1, g.y1);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const [key, p] of buckets) {
    const ci = Math.floor(key / 1000), wi = Math.floor((key % 1000) / 30), ai = key % 30;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(ci ? COL.netLit : COL.net, ai / 24);
    ctx.lineWidth = 1 + wi / 2;
    ctx.stroke(p);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** 网结（未点亮时是冷色小结，点亮后成星） */
export function drawKnots(ctx: Ctx, cam: Cam, s: number) {
  const bul = bulge(s), hole = holeOpen(s), vis = netLineVis(s);
  const weave = [0, 1, 2].map(l => netWeave(l, s));
  const gW = glow(COL.star, 0.7), gC = glow(COL.starCool, 0.7), fW = flare(COL.star), fC = flare(COL.starCool);
  const gN = glow(COL.net, 0.3);
  ctx.globalCompositeOperation = 'lighter';
  for (const k of KNOTS) {
    if (weave[k.lv] <= 0) continue;
    const w = netPoint(k.az, k.el, s, bul, hole);
    const dc = angDist(norm(w), CRANE_DIR);
    if (dc > weave[k.lv]) continue;
    const p = project(cam, w);
    if (p[2] <= 0 || p[0] < -60 || p[0] > cam.cx * 2 + 60 || p[1] < -60 || p[1] > cam.cy * 2 + 60) continue;
    const px = cam.focal / p[2];
    // 点亮
    const t0 = litAt(k, 0);
    let lit = ss(t0, t0 + 0.18, s);
    let flash = s > t0 ? Math.exp(-(s - t0) * 2.6) * 1.6 : 0;
    for (let r = 1; r < RINGS.length; r++) {
      const tr = litAt(k, r);
      if (s > tr) flash += 0.55 * Math.exp(-(s - tr) * 3.2);
    }
    const tw = 0.62 + 0.38 * Math.sin(s * k.tw + k.ph);
    const b = coc(cam, p[2]);
    if (lit > 0.01) {
      const lvK = [1, 0.72, 0.5][k.lv];
      const amp = lit * lvK * (tw + flash);
      const d = clamp(px * 0.22 * (0.6 + 0.6 * amp), 2.4, 46) + b * 0.8;
      blit(ctx, k.warm ? gW : gC, p[0], p[1], d * 2.2, (0.55 * amp) / (1 + b * 0.25));
      if (k.lv === 0 || flash > 0.3) blit(ctx, k.warm ? fW : fC, p[0], p[1], d * (2.4 + flash * 1.6), 0.5 * amp);
    }
    if (lit < 0.99 && k.lv < 2) {
      const d = clamp(px * 0.07, 1.6, 10);
      blit(ctx, gN, p[0], p[1], d * 2.4, 0.4 * vis * (1 - lit) * ss(2, 9, (SPACING[k.lv] * cam.focal) / p[2]));
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** 歌声光环：沿纬线向下扫的一圈光 */
export function drawRings(ctx: Ctx, cam: Cam, s: number) {
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < RINGS.length; k++) {
    const el = ringEl(k, s);
    if (el > Math.PI / 2 || el < -0.05) continue;
    const env = ss(Math.PI / 2, Math.PI / 2 - 0.15, el) * ss(-0.05, 0.25, el) * (k === 0 ? 1 : 0.6);
    for (const [wd, al] of [
      [10, 0.07],
      [3.2, 0.22],
      [1.3, 0.8],
    ] as const) {
      ctx.beginPath();
      let pen = false;
      for (let a = 0; a <= 360; a += 2) {
        const p = project(cam, mul(sph(a * DEG, el), R + 0.05));
        if (p[2] <= 0) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
      ctx.strokeStyle = rgba(COL.ring, al * env);
      ctx.lineWidth = wd;
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ═════════════ 天空 ═════════════
interface SkyStar {
  d: V3;
  m: number;
  tw: number;
  ph: number;
  c: number;
}
const SKY: SkyStar[] = [];
const NEB: Array<{d: V3; size: number; c: readonly number[]; a: number}> = [];
{
  const r = rng(4242);
  // 银河带所在大圆的法线
  const bn = norm([0.45, 0.62, -0.64]);
  const b1 = norm(cross(bn, [0, 1, 0])), b2 = cross(bn, b1);
  for (let i = 0; i < 5200; i++) {
    let d: V3;
    if (i < 2600) {
      const u = r() * 2 - 1, th = r() * TAU, q = Math.sqrt(1 - u * u);
      d = [q * Math.cos(th), Math.abs(u) * 0.95 + 0.05 * u, q * Math.sin(th)];
    } else {
      const th = r() * TAU, off = (r() + r() + r() - 1.5) * 0.16;
      d = norm(add(add(mul(b1, Math.cos(th)), mul(b2, Math.sin(th))), mul(bn, off)));
    }
    SKY.push({d: norm(d), m: Math.pow(r(), 5), tw: 1 + r() * 3, ph: r() * TAU, c: r()});
  }
  const cols = [
    [120, 90, 220],
    [70, 140, 220],
    [210, 110, 170],
    [90, 70, 180],
  ];
  for (let i = 0; i < 26; i++) {
    const th = r() * TAU, off = (r() - 0.5) * 0.22;
    NEB.push({
      d: norm(add(add(mul(b1, Math.cos(th)), mul(b2, Math.sin(th))), mul(bn, off))),
      size: 0.35 + r() * 0.6,
      c: cols[i % cols.length],
      a: 0.05 + r() * 0.07,
    });
  }
}

export function drawSky(ctx: Ctx, cam: Cam, s: number, fill = true) {
  const W = cam.cx * 2, H = cam.cy * 2;
  if (fill) {
    ctx.fillStyle = COL.night0;
    ctx.fillRect(0, 0, W, H);
  }
  // 地平线附近一圈极淡的雾光
  ctx.globalCompositeOperation = 'lighter';
  const hz = glow([40, 48, 110], 0);
  for (let a = 0; a < 360; a += 15) {
    const p = projectDir(cam, sph(a * DEG, 0.04));
    if (p[2] <= 0) continue;
    blit(ctx, hz, p[0], p[1], cam.focal * 1.4, 0.16);
  }
  const zn = projectDir(cam, [0, 1, 0]);
  if (zn[2] > 0) blit(ctx, glow([30, 26, 80], 0), zn[0], zn[1], cam.focal * 2.2, 0.22);
  const sv = skyVis(s);
  for (const n of NEB) {
    const p = projectDir(cam, n.d);
    if (p[2] <= 0) continue;
    blit(ctx, glow(n.c, 0), p[0], p[1], cam.focal * n.size, n.a * 0.35 * (0.35 + 0.65 * sv));
  }
  const gw = glow([255, 248, 236], 0.8), gc = glow([200, 216, 255], 0.8);
  for (const st of SKY) {
    const p = projectDir(cam, st.d);
    if (p[2] <= 0 || p[0] < -4 || p[0] > W + 4 || p[1] < -4 || p[1] > H + 4) continue;
    const tw = 0.7 + 0.3 * Math.sin(s * st.tw + st.ph);
    const a = (0.12 + 0.6 * st.m) * tw * sv;
    blit(ctx, st.c < 0.6 ? gw : gc, p[0], p[1], 3 + 7 * st.m, a);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ═════════════ 笼中的城（地面网格 + 楼 + 一盏盏困住的灯）═════════════
const TOWERS: Array<{x: number; z: number; h: number; win: Array<[number, number, number]>}> = [];
const EMBERS: Array<{p: V3; ph: number; f: number}> = [];
{
  const r = rng(99);
  while (TOWERS.length < 70) {
    const x = (r() * 2 - 1) * (R - 3), z = (r() * 2 - 1) * (R - 3);
    // 镜头走过的通道里不放楼
    if (Math.hypot(x, z) > R - 3.5 || (Math.abs(x) < 6 && z > -4) || Math.hypot(x - 6.5, z - 7.5) < 5) continue;
    const h = 1 + Math.pow(r(), 1.6) * 7;
    const win: Array<[number, number, number]> = [];
    for (let k = 0; k < h * 3; k++) win.push([(r() - 0.5) * 0.5, 0.3 + r() * (h - 0.4), r() * TAU]);
    TOWERS.push({x, z, h, win});
  }
  while (EMBERS.length < 320) {
    const x = (r() * 2 - 1) * R, z = (r() * 2 - 1) * R;
    if (Math.hypot(x, z) > R - 1.2) continue;
    EMBERS.push({p: [x, 0.08 + r() * 0.3, z], ph: r() * TAU, f: 0.4 + r() * 1.5});
  }
}

export function drawCity(ctx: Ctx, cam: Cam, s: number) {
  const vis = netWeave(0, s) > 0 ? ss(CUE.c2, CUE.c4, s) : 0;
  if (vis <= 0) return;
  // 地面方格
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  const step = 1.5;
  for (let g = -R; g <= R; g += step) {
    const h = Math.sqrt(Math.max(0, R * R - g * g));
    if (h < 0.5) continue;
    for (const vert of [false, true]) {
      let pen = false;
      for (let u = -h; u <= h + 1e-6; u += h / 12) {
        const p = project(cam, vert ? [g, 0, u] : [u, 0, g]);
        if (p[2] <= 0.3) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
    }
  }
  ctx.strokeStyle = rgba(COL.net, 0.035 * vis);
  ctx.lineWidth = 1;
  ctx.stroke();
  // 楼：竖线 + 零星窗光
  const gw = glow(COL.window, 0.2);
  const rise = 0.35 + 0.65 * ss(CUE.c7 + 0.5, CUE.post + 1, s);
  for (const t of TOWERS) {
    const p0 = project(cam, [t.x, 0, t.z]), p1 = project(cam, [t.x, t.h, t.z]);
    if (p0[2] <= 0.3 || p1[2] <= 0.3) continue;
    const px = cam.focal / p0[2];
    ctx.strokeStyle = rgba(COL.net, 0.16 * vis);
    ctx.lineWidth = clamp(px * 0.12, 1, 3);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const w of t.win) {
      const q = project(cam, [t.x + w[0], w[1], t.z]);
      if (q[2] <= 0.3) continue;
      const fl = 0.5 + 0.5 * Math.sin(s * 0.8 + w[2]);
      blit(ctx, gw, q[0], q[1], clamp(px * 0.35, 2, 14), 0.22 * vis * fl * rise);
    }
  }
  const ge = glow(COL.ember, 0.4);
  for (const e of EMBERS) {
    const p = project(cam, e.p);
    if (p[2] <= 0.3) continue;
    const fl = 0.55 + 0.45 * Math.sin(s * e.f + e.ph);
    blit(ctx, ge, p[0], p[1], clamp((cam.focal / p[2]) * 0.4, 2, 18), 0.3 * vis * fl * rise);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ═════════════ 那颗星 ═════════════
export function drawStar(ctx: Ctx, cam: Cam, s: number) {
  const on = starOn(s), fl = starFlash(s);
  if (on <= 0 && fl <= 0) return;
  const p = project(cam, STAR);
  if (p[2] <= 0) return;
  const px = cam.focal / p[2];
  const breath = 1 + 0.08 * Math.sin(s * 2.1) + 0.06 * Math.sin(((s - CUE.c1) / 0.5) * Math.PI);
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, glow(COL.singerHalo, 0), p[0], p[1], clamp(px * 22, 200, 1100) * breath, (0.16 * on + 0.3 * fl) * clamp(260 / (px * 22)));
  blit(ctx, glow(COL.singer, 0.4), p[0], p[1], clamp(px * 6, 60, 420) * breath, (0.5 * on + 0.5 * fl) * clamp(0.35 + 120 / (px * 6)));
  blit(ctx, glow([255, 255, 255], 1), p[0], p[1], clamp(px * 1.4, 16, 90), 0.95 * on + fl);
  // 慢慢转动的星芒
  const fr = flare(COL.singer);
  const d = clamp(px * 11, 140, 640) * (1 + 0.6 * fl) * breath;
  for (const [rot, a] of [
    [s * 0.05, 0.85],
    [Math.PI / 4 - s * 0.03, 0.4],
  ] as const) {
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(rot);
    blit(ctx, fr, 0, 0, d, a * (on + fl));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ═════════════ 光线 / 铁道 ═════════════
function strokePoly(ctx: Ctx, cam: Cam, pts: V3[], layers: Array<[number, readonly number[], number]>) {
  const pr = pts.map(p => project(cam, p));
  for (const [w, c, a] of layers) {
    if (a <= 0.003) continue;
    ctx.beginPath();
    let pen = false;
    for (const p of pr) {
      if (p[2] <= 0.2) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
      pen = true;
    }
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = w;
    ctx.stroke();
  }
}

export function drawThread(ctx: Ctx, cam: Cam, s: number, beak: V3) {
  const vis = threadVis(s);
  if (vis <= 0) return;
  const tip = threadTip(s);
  const sway = (d: number): V3 => {
    const k = Math.sin((Math.PI * d) / RAIL_TOTAL);
    return [0.35 * k * Math.sin(d * 0.35 + s * 1.3), 0.25 * k * Math.sin(d * 0.27 - s * 1.1), 0];
  };
  const railK = ss(CUE.v1 - 1, CUE.train, s); // 光线 → 铁道（颜色转金、摆动收住）
  const pts: V3[] = [];
  for (let d = RAIL_TOTAL; d >= tip - 1e-6; d -= 0.5) pts.push(add(railAt(d), mul(sway(d), 1 - railK)));
  const last = threadLast(s);
  if (last > 0 && s < CUE.v1 + 0.2) {
    // 轨道起点 → 网上的穿孔点 → 纸鹤的喙（二次贝塞尔，控制点在穿孔处）
    const a = railAt(0), b = mul(GAP_DIR, R + 0.05), c = beak;
    const n = Math.ceil(32 * last);
    for (let i = 1; i <= n; i++) {
      const u = i / 32;
      pts.push(add(add(mul(a, (1 - u) * (1 - u)), mul(b, 2 * u * (1 - u))), mul(c, u * u)));
    }
  }
  if (pts.length < 2) return;
  const col: number[] = [0, 1, 2].map(i => lerp(COL.thread[i], COL.rail[i], railK));
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokePoly(ctx, cam, pts, [
    [14, col, 0.05 * vis],
    [5, col, 0.16 * vis],
    [1.6, [255, 240, 236], 0.85 * vis],
  ]);
  // 线头的光点 + 沿线流下的微光
  const head = pts[pts.length - 1];
  const hp = project(cam, head);
  if (hp[2] > 0 && s < CUE.bridge + 5.2) blit(ctx, flare(COL.thread), hp[0], hp[1], clamp((cam.focal / hp[2]) * 1.6, 40, 220), 0.9 * vis);
  for (let k = 0; k < 14; k++) {
    const d = RAIL_TOTAL - ((s * 6 + k * 9.7) % RAIL_TOTAL);
    if (d < tip) continue;
    const p = project(cam, railAt(d));
    if (p[2] <= 0.2) continue;
    blit(ctx, glow(col, 0.7), p[0], p[1], clamp((cam.focal / p[2]) * 0.5, 4, 40), 0.5 * vis);
  }
  // 铁道枕木
  if (railK > 0.01) {
    ctx.beginPath();
    for (let d = 0.4; d < RAIL_TOTAL - 0.5; d += 0.7) {
      const f = railFrame(d);
      const a = project(cam, add(f.p, mul(f.N, 0.32))), b = project(cam, add(f.p, mul(f.N, -0.32)));
      if (a[2] <= 0.2 || b[2] <= 0.2) continue;
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.strokeStyle = rgba(COL.rail, 0.22 * railK * vis);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ═════════════ 银河列车 ═════════════
export interface TrainItem {
  z: number;
  draw: (ctx: Ctx) => void;
}
export function prepareTrain(cam: Cam, s: number): TrainItem[] {
  const vis = trainVis(s);
  if (vis <= 0) return [];
  const head = trainHead(s);
  const items: TrainItem[] = [];
  for (let k = 0; k < CARS; k++) {
    const dc = head - (k + 0.5) * CAR_LEN * 1.06;
    // 从轨道起点“凝结”出来，开进星里时溶进光
    const born = ss(-1.5, 1.0, dc), gone = 1 - ss(RAIL_TOTAL - 4, RAIL_TOTAL + 0.5, dc);
    const a = vis * born * gone;
    if (a <= 0.01) continue;
    const f = railFrame(dc);
    const c = add(f.p, mul(f.B, 0.42));
    const hl = CAR_LEN / 2, hw = 0.32, hh = 0.36;
    const P = (x: number, y: number, z: number): V3 => add(c, add(add(mul(f.T, x * hl), mul(f.N, y * hw)), mul(f.B, z * hh)));
    const cz = project(cam, c)[2];
    items.push({
      z: cz,
      draw: ctx => {
        if (cz <= 0.2) return;
        const faces: Array<{q: V3[]; n: V3; side: number}> = [
          {q: [P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)], n: f.N, side: 1},
          {q: [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], n: mul(f.N, -1), side: -1},
          {q: [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], n: f.B, side: 0},
          {q: [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], n: f.T, side: 2},
          {q: [P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, -1, 1)], n: mul(f.T, -1), side: 3},
        ];
        for (const fc of faces) {
          const view = norm(sub(cam.pos, fc.q[0]));
          if (dot(view, fc.n) <= 0) continue;
          const pr = fc.q.map(q => project(cam, q));
          if (pr.some(p => p[2] <= 0.2)) continue;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.92 * a;
          ctx.fillStyle = '#0b1028';
          ctx.beginPath();
          pr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.45 * a;
          ctx.strokeStyle = rgba([150, 170, 230], 0.8);
          ctx.lineWidth = 1;
          ctx.stroke();
          // 车窗
          if (fc.side === 1 || fc.side === -1) {
            ctx.globalCompositeOperation = 'lighter';
            for (let wi = 0; wi < 4; wi++) {
              const x0 = -0.78 + wi * 0.42, x1 = x0 + 0.3;
              const y = fc.side;
              const wq = [P(x0, y * 1.001, -0.15), P(x1, y * 1.001, -0.15), P(x1, y * 1.001, 0.55), P(x0, y * 1.001, 0.55)].map(q => project(cam, q));
              ctx.globalAlpha = 0.6 * a;
              ctx.fillStyle = rgba([255, 178, 96], 0.85);
              ctx.beginPath();
              wq.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
              ctx.closePath();
              ctx.fill();
            }
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        const pc = project(cam, c);
        const px = cam.focal / pc[2];
        blit(ctx, glow(COL.window, 0.2), pc[0], pc[1], px * 3.6, 0.22 * a);
        if (k === 0) {
          const hp = project(cam, P(1.05, 0, 0.1));
          if (hp[2] > 0.2) {
            blit(ctx, glow([255, 244, 214], 0.9), hp[0], hp[1], px * 1.6, 0.9 * a);
            blit(ctx, flare([255, 236, 200]), hp[0], hp[1], px * 3.2, 0.7 * a);
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    });
  }
  // 车尾拖出的星尘
  const trail: TrainItem = {
    z: 1e9,
    draw: ctx => {
      ctx.globalCompositeOperation = 'lighter';
      const r = rng(5);
      const g = glow(COL.star, 0.7);
      for (let i = 0; i < 160; i++) {
        const back = r() * 16, age = back / 6;
        const d = head - CAR_LEN * CARS * 1.06 - back + 2 * CAR_LEN * CARS * 0 + 0;
        const dd = head - back;
        if (dd < 0 || dd > RAIL_TOTAL) continue;
        const f = railFrame(dd);
        const off = add(mul(f.N, (r() - 0.5) * 1.6 * (0.3 + age)), mul(f.B, 0.6 + age * 1.2 * r()));
        const p = project(cam, add(f.p, off));
        if (p[2] <= 0.2 || d > 1e9) continue;
        blit(ctx, g, p[0], p[1], clamp((cam.focal / p[2]) * 0.22, 2, 22), 0.55 * vis * Math.exp(-age) * (0.4 + 0.6 * r()));
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  items.push(trail);
  return items;
}

// ═════════════ 漂浮的光尘（跟着镜头的无限粒子场）═════════════
const DUST: Array<{b: V3; v: V3; sz: number; ph: number}> = [];
{
  const r = rng(31);
  for (let i = 0; i < 420; i++)
    DUST.push({b: [r() * 18, r() * 18, r() * 18], v: [(r() - 0.5) * 0.18, 0.05 + r() * 0.14, (r() - 0.5) * 0.18], sz: 0.02 + r() * 0.05, ph: r() * TAU});
}
export function drawDust(ctx: Ctx, cam: Cam, s: number, amount: number) {
  if (amount <= 0) return;
  const B = 18;
  const bk = bokeh([255, 236, 214]), gl = glow([255, 240, 224], 0.6);
  ctx.globalCompositeOperation = 'lighter';
  for (const d of DUST) {
    const p: V3 = [0, 1, 2].map(i => {
      const x = d.b[i] + d.v[i] * s - cam.pos[i] + B / 2;
      return cam.pos[i] + (((x % B) + B) % B) - B / 2;
    }) as V3;
    const q = project(cam, p);
    if (q[2] <= 0.15) continue;
    const px = cam.focal / q[2];
    const b = coc(cam, q[2]) * 1.6;
    const sz = Math.max(1.5, d.sz * px) + b;
    const edge = 1 - ss(B * 0.32, B * 0.5, len(sub(p, cam.pos)));
    const tw = 0.6 + 0.4 * Math.sin(s * 1.3 + d.ph);
    const a = (amount * 0.5 * tw * edge) / (1 + b * 0.08);
    blit(ctx, b > 6 ? bk : gl, q[0], q[1], b > 6 ? sz : sz * 2.2, b > 6 ? a * 0.22 : a);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export {railPts, bump, E, prog, noise1};
