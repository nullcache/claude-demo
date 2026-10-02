import {clamp, lerp} from '../lib/math';
import {COL} from './config';
import {craneFrame, craneHead, craneWing, heartbeat, heartGlow} from './scene';
import {blit, glow} from './sprites';
import {add, Cam, cross, dot, len, mul, norm, project, rotAxis, rng, sub, V3} from './v3';

// 折纸鹤：按真实折法的结构建模（菱形身体、细长的颈与尾、带中折痕且外段会弯的翅膀、折下来的头）。
// 纸是半透明的：每个面从靠近“心”的一侧到远端渐变（光透过纸），再叠一层贴在面上的纸纤维纹理和折痕。

type Kind = 'body' | 'wing' | 'neck' | 'head';
interface Tri {
  p: V3[];
  kind: Kind;
  crease?: [number, number]; // 需要描成折痕的边（顶点序号）
}

/** 局部坐标（x 翼展方向、y 上、z 头）下的模型 */
function model(s: number): {tris: Tri[]; beak: V3; heart: V3} {
  const hd = craneHead(s);
  const {base, flap} = craneWing(s);
  // 身体：上下两个四棱锥拼成的扁菱形
  const F: V3 = [0, 0.02, 0.3], B: V3 = [0, 0.02, -0.3], K: V3 = [0, -0.21, 0.0];
  const SL: V3 = [-0.1, 0.03, 0], SR: V3 = [0.1, 0.03, 0], T: V3 = [0, 0.1, 0];
  // 颈：三棱细锥，可俯仰
  const pitch = -0.32 * hd;
  const neckDir = rotAxis(norm([0, 0.79, 0.62]), [1, 0, 0], pitch);
  const Nk = add(F, mul(neckDir, 0.64));
  const NbL: V3 = [-0.032, 0.0, 0.22], NbR: V3 = [0.032, 0.0, 0.22], NbF: V3 = [0, -0.03, 0.34];
  // 头：从颈尖折下来
  const headDir = rotAxis(norm([0, -0.45, 0.89]), [1, 0, 0], pitch * 1.25);
  const Hd = add(Nk, mul(headDir, 0.17));
  const NkL = add(Nk, [-0.018, -0.01, -0.03]), NkR = add(Nk, [0.018, -0.01, -0.03]), NkD = add(Nk, mul(headDir, 0.05));
  // 尾
  const Q = add(B, mul(norm([0, 0.74, -0.67]), 0.66));
  const TbL: V3 = [-0.032, 0.0, -0.22], TbR: V3 = [0.032, 0.0, -0.22], TbB: V3 = [0, -0.03, -0.34];
  const tris: Tri[] = [
    {p: [F, SR, K], kind: 'body'},
    {p: [K, SR, B], kind: 'body'},
    {p: [F, K, SL], kind: 'body'},
    {p: [K, B, SL], kind: 'body'},
    {p: [F, T, SR], kind: 'body'},
    {p: [T, B, SR], kind: 'body'},
    {p: [F, SL, T], kind: 'body'},
    {p: [T, SL, B], kind: 'body'},
    {p: [NbL, NbF, Nk], kind: 'neck', crease: [1, 2]},
    {p: [NbF, NbR, Nk], kind: 'neck'},
    {p: [NbR, NbL, Nk], kind: 'neck'},
    {p: [NkL, Hd, NkD], kind: 'head'},
    {p: [NkD, Hd, NkR], kind: 'head'},
    {p: [TbL, TbB, Q], kind: 'neck', crease: [1, 2]},
    {p: [TbB, TbR, Q], kind: 'neck'},
    {p: [TbR, TbL, Q], kind: 'neck'},
  ];
  // 翅膀：根部沿身体顶线；内段转 a0，翼尖再多转一点（外段弯折）
  for (const side of [1, -1]) {
    const a0 = base + flap;
    const a1 = base + flap * 1.4 - 0.1 * Math.cos(flap * 2);
    const rz = (p: V3, a: number): V3 => {
      const q = rotAxis([p[0], p[1] - 0.09, p[2]], [0, 0, 1], side * a);
      return [q[0], q[1] + 0.09, q[2]];
    };
    const Wf: V3 = [0, 0.09, 0.18], Wb: V3 = [0, 0.09, -0.22];
    const Wl = rz([side * 0.44, 0.11, 0.05], a0); // 前缘中点
    const Wc = rz([side * 0.42, 0.15, -0.08], a0); // 中折痕上的点（微微隆起）
    const Wr = rz([side * 0.38, 0.08, -0.25], a0); // 后缘中点
    const Wt = rz([side * 0.98, 0.08, -0.2], a1); // 翼尖（比内段多转一点 → 弯折）
    tris.push(
      {p: [Wf, Wl, Wc], kind: 'wing'},
      {p: [Wl, Wt, Wc], kind: 'wing', crease: [1, 2]},
      {p: [Wc, Wt, Wr], kind: 'wing'},
      {p: [Wc, Wr, Wb], kind: 'wing'},
      {p: [Wf, Wc, Wb], kind: 'wing', crease: [0, 1]},
    );
  }
  return {tris, beak: Hd, heart: [0, -0.02, 0.02]};
}

/** 纸纤维纹理（灰度，乘到面上） */
let FIBER: HTMLCanvasElement | null = null;
function fiber() {
  if (FIBER) return FIBER;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let i = 0; i < 900; i++) {
    const px = r() * 256, py = r() * 256, a = r() * Math.PI, l = 4 + r() * 18;
    x.strokeStyle = `rgba(${150 + r() * 60},${140 + r() * 60},${150 + r() * 60},${0.08 + r() * 0.2})`;
    x.lineWidth = 0.5 + r() * 0.8;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (r() - 0.5) * 4, py + Math.sin(a) * l * 0.5 + (r() - 0.5) * 4, px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  const img = x.getImageData(0, 0, 256, 256);
  for (let p = 0; p < img.data.length; p += 4) {
    const n = (r() - 0.5) * 18;
    img.data[p] += n;
    img.data[p + 1] += n;
    img.data[p + 2] += n;
  }
  x.putImageData(img, 0, 0);
  FIBER = c;
  return c;
}

const mixc = (a: readonly number[], b: readonly number[], u: number) => a.map((v, i) => lerp(v, b[i], u));
const rgb = (c: number[]) => `rgb(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')})`;
const PAPER = [232, 220, 204]; // 纸的本色（偏暖的米白）
const TRANS = [255, 204, 162]; // 透过纸的心光（暖橙粉）
const KEY = [176, 192, 236]; // 来自上方星光的冷色
const SHADE = [40, 36, 70];

export interface CraneDraw {
  depth: number;
  beakWorld: V3;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export function prepareCrane(cam: Cam, s: number, scale = 1): CraneDraw {
  const fr = craneFrame(s);
  const fwd = fr.fwd;
  let right = norm(cross(fwd, [0, 1, 0]));
  let up = norm(cross(right, fwd));
  right = rotAxis(right, fwd, fr.bank);
  up = rotAxis(up, fwd, fr.bank);
  const toW = (p: V3): V3 => add(fr.p, add(add(mul(right, -p[0] * scale), mul(up, p[1] * scale)), mul(fwd, p[2] * scale)));
  const m = model(s);
  const key = norm([0.2, 1, 0.3]);
  const hb = heartbeat(s);
  const hg = heartGlow(s);
  const heartL = m.heart;
  const items = m.tris.map(tri => {
    const w = tri.p.map(toW);
    const n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0])));
    const pr = w.map(p => project(cam, p));
    const z = (pr[0][2] + pr[1][2] + pr[2][2]) / 3;
    const view = norm(sub(cam.pos, w[0]));
    const facing = dot(n, view);
    // 每个顶点离心的距离 → 透光强弱
    const tr = tri.p.map(p => Math.exp(-len(sub(p, heartL)) * 2.6));
    return {pr, z, facing, lam: Math.abs(dot(n, key)), up: Math.max(0, dot(facing >= 0 ? n : mul(n, -1), key)), tr, kind: tri.kind, crease: tri.crease, loc: tri.p};
  });
  const hc = project(cam, toW(m.heart));
  const depth = project(cam, fr.p)[2];
  return {
    depth,
    beakWorld: toW(m.beak),
    draw: ctx => {
      if (depth <= 0.1) return;
      const px = cam.focal / depth;
      const near = clamp((depth - 0.6) / 1.4);
      const vis = clamp(hg * 1.4);
      const pulse = 0.75 + 0.25 * hb;
      ctx.save();
      // 外层暖光（克制）
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, glow(COL.paperShade, 0.15), hc[0], hc[1], Math.min(px * 4.2, 900), 0.07 * hg * near);
      blit(ctx, glow(COL.heart, 0.25), hc[0], hc[1], Math.min(px * (1.3 + 0.3 * hb), 520), (0.16 + 0.22 * hb) * hg * near);
      ctx.globalCompositeOperation = 'source-over';
      items.sort((a, b) => b.z - a.z);
      const tex = fiber();
      const pat = ctx.createPattern(tex, 'repeat')!;
      for (const it of items) {
        if (it.pr.some(p => p[2] <= 0)) continue;
        const back = it.facing < 0;
        // 每个顶点的颜色：本色×环境 + 冷色顶光 + 暖色透光（背面看过去透光更多、更暗）
        const cols = it.tr.map(t => {
          const tt = t * pulse * (back ? 1.25 : 1);
          let c = mixc(SHADE, PAPER, back ? 0.26 : 0.36 + 0.2 * it.lam);
          c = c.map((v, i) => v + KEY[i] * 0.2 * it.up * (back ? 0.4 : 1) + TRANS[i] * 0.42 * tt);
          return c.map(v => Math.min(v, 236));
        });
        // 渐变：从最亮的顶点到对边中点
        let hi = 0;
        for (let k = 1; k < 3; k++) if (it.tr[k] > it.tr[hi]) hi = k;
        const o1 = (hi + 1) % 3, o2 = (hi + 2) % 3;
        const ax = it.pr[hi][0], ay = it.pr[hi][1];
        const bx = (it.pr[o1][0] + it.pr[o2][0]) / 2, by = (it.pr[o1][1] + it.pr[o2][1]) / 2;
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, rgb(cols[hi]));
        g.addColorStop(1, rgb(mixc(cols[o1], cols[o2], 0.5)));
        ctx.beginPath();
        ctx.moveTo(it.pr[0][0], it.pr[0][1]);
        ctx.lineTo(it.pr[1][0], it.pr[1][1]);
        ctx.lineTo(it.pr[2][0], it.pr[2][1]);
        ctx.closePath();
        ctx.globalAlpha = (it.kind === 'body' ? 0.97 : 0.93) * vis;
        ctx.fillStyle = g;
        ctx.fill();
        // 纸纤维：贴在面上（用局部坐标做纹理映射）
        const [p0, p1, p2] = it.pr;
        const sc = 256;
        pat.setTransform(new DOMMatrix([(p1[0] - p0[0]) / sc, (p1[1] - p0[1]) / sc, (p2[0] - p0[0]) / sc, (p2[1] - p0[1]) / sc, p0[0], p0[1]]));
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.55 * vis;
        ctx.fillStyle = pat;
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // 纸边：细亮线；折痕：更暗一点的细线
        ctx.globalAlpha = 0.32 * vis;
        ctx.strokeStyle = 'rgb(255,244,232)';
        ctx.lineWidth = Math.max(0.6, px * 0.0032);
        ctx.lineJoin = 'round';
        ctx.stroke();
        if (it.crease) {
          const [a, b] = it.crease;
          ctx.globalAlpha = 0.35 * vis;
          ctx.strokeStyle = 'rgb(120,96,120)';
          ctx.lineWidth = Math.max(0.6, px * 0.004);
          ctx.beginPath();
          ctx.moveTo(it.pr[a][0], it.pr[a][1]);
          ctx.lineTo(it.pr[b][0], it.pr[b][1]);
          ctx.stroke();
        }
      }
      // 心：透过纸的一点暖光，随心跳
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, glow(COL.heart, 0.4), hc[0], hc[1], Math.min(px * (0.55 + 0.25 * hb), 420), (0.3 + 0.45 * hb) * hg * near);
      blit(ctx, glow([255, 226, 210], 0.9), hc[0], hc[1], Math.min(px * (0.14 + 0.05 * hb), 120), (0.45 + 0.35 * hb) * hg);
      ctx.restore();
    },
  };
}
