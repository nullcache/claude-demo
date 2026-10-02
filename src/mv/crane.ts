import {clamp} from '../lib/math';
import {COL} from './config';
import {craneFrame, craneHead, craneWing, heartbeat, heartGlow} from './scene';
import {blit, glow} from './sprites';
import {add, Cam, cross, dot, mul, norm, project, rotAxis, sub, V3} from './v3';

// 低多边形纸鹤：身体菱锥 + 颈/尾细三角 + 两片带折痕的翅膀。
// 纸是半透明发光的，里面有一颗会跳的心。

type Tri = {p: V3[]; kind: 'body' | 'wing' | 'neck'};

/** 局部坐标（x 右翼、y 上、z 头）下的模型 */
function model(s: number): {tris: Tri[]; beak: V3; heart: V3} {
  const hd = craneHead(s);
  const {base, flap} = craneWing(s);
  const F: V3 = [0, 0, 0.34], K: V3 = [0, 0, -0.34], Bt: V3 = [0, -0.2, 0];
  const Lb: V3 = [-0.13, 0.02, 0], Rb: V3 = [0.13, 0.02, 0], Tp: V3 = [0, 0.1, 0];
  // 颈：绕 x 轴俯仰
  const pitch = -0.32 * hd;
  const nk = rotAxis([0, 0.66, 0.5], [1, 0, 0], pitch);
  const Nk = add(F, nk);
  const headDir = rotAxis([0, -0.5, 0.86], [1, 0, 0], pitch * 1.3);
  const Hd = add(Nk, mul(headDir, 0.2));
  const Q = add(K, [0, 0.62, -0.62]);
  const tris: Tri[] = [
    {p: [F, Lb, Bt], kind: 'body'},
    {p: [F, Bt, Rb], kind: 'body'},
    {p: [K, Bt, Lb], kind: 'body'},
    {p: [K, Rb, Bt], kind: 'body'},
    {p: [F, Tp, Lb], kind: 'body'},
    {p: [F, Rb, Tp], kind: 'body'},
    {p: [K, Lb, Tp], kind: 'body'},
    {p: [K, Tp, Rb], kind: 'body'},
    {p: [F, [-0.045, 0.01, 0.2], Nk], kind: 'neck'},
    {p: [F, Nk, [0.045, 0.01, 0.2]], kind: 'neck'},
    {p: [Nk, Hd, add(Nk, [0, -0.07, -0.02])], kind: 'neck'},
    {p: [K, [-0.045, 0.01, -0.2], Q], kind: 'neck'},
    {p: [K, Q, [0.045, 0.01, -0.2]], kind: 'neck'},
  ];
  // 翅膀：根部沿身体顶线，翼尖绕身体长轴（z）旋转；外段滞后形成柔和的弯折
  for (const side of [1, -1]) {
    const a0 = base + flap; // 根部
    const a1 = base + flap * 1.35 - 0.12 * Math.cos(flap * 2); // 翼尖滞后
    const rz = (p: V3, a: number): V3 => rotAxis(p, [0, 0, 1], side * a);
    const Wf: V3 = [0, 0.08, 0.2], Wb: V3 = [0, 0.08, -0.24];
    const Wr = rz([side * 0.42, 0.1, -0.02], a0);
    const Wt = add(Wr, rz([side * 0.58, -0.06, -0.12], a1));
    tris.push({p: [Wf, Wr, Wt], kind: 'wing'}, {p: [Wf, Wt, Wb], kind: 'wing'}, {p: [Wf, Wb, Wr], kind: 'wing'});
  }
  return {tris, beak: Hd, heart: [0, 0.0, 0.04]};
}

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
  // 注意：局部 x 正向 = 翼的一侧；用 -right 让左右手系一致
  const toW = (p: V3): V3 => add(fr.p, add(add(mul(right, -p[0] * scale), mul(up, p[1] * scale)), mul(fwd, p[2] * scale)));
  const m = model(s);
  const light = norm([0.25, 1, 0.35]);
  const hb = heartbeat(s);
  const hg = heartGlow(s);
  const items = m.tris.map(tri => {
    const w = tri.p.map(toW);
    const n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0])));
    const pr = w.map(p => project(cam, p));
    const z = (pr[0][2] + pr[1][2] + pr[2][2]) / 3;
    const view = norm(sub(cam.pos, w[0]));
    const facing = dot(n, view);
    const lam = Math.abs(dot(n, light));
    return {pr, z, facing, lam, kind: tri.kind};
  });
  const hc = project(cam, toW(m.heart));
  const depth = project(cam, fr.p)[2];
  return {
    depth,
    beakWorld: toW(m.beak),
    draw: ctx => {
      if (depth <= 0.1) return;
      const px = cam.focal / depth; // 每单位像素
      // 外层暖光
      ctx.globalCompositeOperation = 'lighter';
      const near = clamp((depth - 0.6) / 1.4); // 贴近镜头时收住光晕，免得糊成一片白
      blit(ctx, glow(COL.paperShade, 0.2), hc[0], hc[1], Math.min(px * 5.5, 1100), 0.1 * hg * near);
      blit(ctx, glow(COL.heart, 0.3), hc[0], hc[1], Math.min(px * (1.6 + 0.35 * hb), 700), (0.3 + 0.35 * hb) * hg * near);
      // 纸面（画家算法）：以心为圆心的径向渐变 = 光透过纸；再按朝向压暗
      ctx.globalCompositeOperation = 'source-over';
      items.sort((a, b) => b.z - a.z);
      const grad = ctx.createRadialGradient(hc[0], hc[1], 0, hc[0], hc[1], px * 1.15);
      grad.addColorStop(0, 'rgb(255,230,212)');
      grad.addColorStop(0.3, 'rgb(246,214,200)');
      grad.addColorStop(0.75, 'rgb(196,178,210)');
      grad.addColorStop(1, 'rgb(150,140,196)');
      const vis = clamp(hg * 1.4);
      for (const it of items) {
        if (it.pr.some(p => p[2] <= 0)) continue;
        const back = it.facing < 0 ? 1 : 0;
        const k = clamp(0.35 + 0.65 * it.lam - 0.15 * back);
        ctx.beginPath();
        ctx.moveTo(it.pr[0][0], it.pr[0][1]);
        ctx.lineTo(it.pr[1][0], it.pr[1][1]);
        ctx.lineTo(it.pr[2][0], it.pr[2][1]);
        ctx.closePath();
        ctx.globalAlpha = (it.kind === 'body' ? 0.9 : 0.8) * vis;
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.6 * vis;
        ctx.fillStyle = 'rgb(22,18,44)';
        ctx.fill();
        ctx.globalAlpha = 0.45 * vis;
        ctx.strokeStyle = 'rgb(255,244,232)';
        ctx.lineWidth = Math.max(0.7, px * 0.004);
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      // 心：透过纸透出来的跳动的光
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, glow(COL.heart, 0.35), hc[0], hc[1], Math.min(px * (0.9 + 0.45 * hb), 500), (0.45 + 0.55 * hb) * hg * near);
      blit(ctx, glow([255, 214, 200], 0.9), hc[0], hc[1], px * (0.22 + 0.08 * hb), (0.6 + 0.4 * hb) * hg);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  };
}
