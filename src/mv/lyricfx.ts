import {clamp, DEG, E, lerp, prog, ss, TAU} from '../lib/math';
import {COL, H, rgba, W} from './config';
import {LINES, Line} from './lyrics';
import {heartbeat} from './scene';
import {blit, glow} from './sprites';
import {Cam, project, rng} from './v3';
import {netPoint} from './world';

// 逐句特效歌词。每个字在 line.times[k]（实测唱出的时刻）触发。

type Ctx = CanvasRenderingContext2D;
export const SERIF = '"Noto Serif SC Variable", "Noto Serif SC", serif';
const INK = [243, 236, 223];
const WARM = [255, 222, 190];

interface G {
  ch: string;
  x: number;
  y: number;
  size: number;
  a: number;
  weight?: number;
  col?: readonly number[];
  blur?: number;
  glow?: number;
  glowCol?: readonly number[];
  sx?: number;
  sy?: number;
  rot?: number;
  ca?: number; // 色差偏移（px）
  shadow?: number;
}

/** 画一个字：可选柔光、模糊、缩放、旋转、色差 */
function glyph(ctx: Ctx, g: G) {
  if (g.a <= 0.004) return;
  ctx.save();
  if (g.glow) {
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, glow(g.glowCol ?? g.col ?? INK, 0.1), g.x, g.y, g.size * 2.8, g.glow * g.a);
  }
  ctx.translate(g.x, g.y);
  if (g.rot) ctx.rotate(g.rot);
  ctx.scale(g.sx ?? 1, g.sy ?? 1);
  ctx.font = `${g.weight ?? 300} ${g.size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.filter = g.blur && g.blur > 0.3 ? `blur(${g.blur.toFixed(1)}px)` : 'none';
  if (g.ca && g.ca > 0.3) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(g.a * 0.55);
    ctx.fillStyle = 'rgb(255,60,40)';
    ctx.fillText(g.ch, -g.ca, 0);
    ctx.fillStyle = 'rgb(40,120,255)';
    ctx.fillText(g.ch, g.ca, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (g.shadow !== 0) {
    ctx.shadowColor = 'rgba(2,3,12,0.75)';
    ctx.shadowBlur = g.size * 0.35 * (g.shadow ?? 1);
  }
  ctx.globalAlpha = clamp(g.a);
  ctx.fillStyle = rgba(g.col ?? INK, 1);
  ctx.fillText(g.ch, 0, 0);
  ctx.restore();
}

/** 一串光点（确定性） */
function sparks(ctx: Ctx, seed: number, x: number, y: number, n: number, u: number, col: readonly number[], spread: number, rise: number, size = 6) {
  if (u <= 0 || u >= 1) return;
  const r = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = glow(col, 0.8);
  for (let i = 0; i < n; i++) {
    const ang = r() * TAU, sp = 0.4 + r() * 0.6;
    const px = x + Math.cos(ang) * spread * sp * u;
    const py = y + Math.sin(ang) * spread * sp * u * 0.6 - rise * u * (0.5 + r());
    blit(ctx, g, px, py, size * (0.5 + r()), Math.sin(Math.PI * u) * (0.5 + 0.5 * r()));
  }
  ctx.restore();
}

/** 横排一行的字心位置 */
const rowX = (n: number, gap: number, cx = W / 2) => Array.from({length: n}, (_, k) => cx + (k - (n - 1) / 2) * gap);
const appear = (s: number, t: number, d = 0.3) => E.o2(prog(s, t - 0.04, t - 0.04 + d));
/** 退场进度：本句结束前后 */
const leave = (s: number, l: Line, d = 0.45) => E.i2(prog(s, l.end - d * 0.4, l.end + d * 0.6));
const lastT = (l: Line) => l.times[l.times.length - 1];

// ───────────── 各句特效 ─────────────
const FX: Record<string, (ctx: Ctx, l: Line, s: number, cam: Cam) => void> = {
  whisper(ctx, l, s) {
    const xs = rowX(l.chars.length, 70);
    const out = leave(s, l, 0.4);
    l.chars.forEach((ch, k) => {
      const a = appear(s, l.times[k], 0.25);
      glyph(ctx, {ch, x: xs[k], y: H * 0.8 - 18 * out, size: 40, weight: 400, a: a * (1 - out), blur: 6 * (1 - a) + 6 * out, glow: 0.6});
    });
  },

  column(ctx, l, s) {
    const x = W * 0.14, y0 = 230, size = 56;
    const out = leave(s, l, 0.6);
    const hb = heartbeat(s);
    const n = l.chars.length;
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const y = y0 + k * size * 1.3;
      // 先有几粒星尘向字心聚拢
      const pre = prog(s, t - 0.4, t + 0.05);
      if (pre > 0 && pre < 1) {
        const r = rng(40 + k);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 8; i++) {
          const ang = r() * TAU, d = (40 + r() * 70) * (1 - E.o2(pre));
          blit(ctx, glow(INK, 0.8), x + Math.cos(ang) * d, y + Math.sin(ang) * d, 5, Math.sin(Math.PI * pre));
        }
        ctx.restore();
      }
      const a = appear(s, t, 0.35);
      const heart = k >= n - 2 ? hb : 0; // 「心脏」随心跳
      const col = heart ? [255, lerp(236, 150, Math.min(1, heart)), lerp(223, 165, Math.min(1, heart))] : INK;
      const r = rng(70 + k);
      glyph(ctx, {
        ch, x: x + (r() - 0.5) * 50 * out, y: y - 10 * (1 - a) - 30 * out, size, a: a * (1 - out),
        blur: 8 * (1 - a) + 7 * out, col, glow: 0.35 + 0.6 * heart, glowCol: heart ? COL.heart : INK, sx: 1 + 0.07 * heart, sy: 1 + 0.07 * heart,
      });
      if (out > 0) sparks(ctx, 90 + k, x, y, 6, out, INK, 60, 120);
    });
  },

  flicker(ctx, l, s) {
    const xs = rowX(l.chars.length, 74);
    const y = H * 0.17;
    const out = leave(s, l, 0.5);
    l.chars.forEach((ch, k) => {
      const tt = s - l.times[k] + 0.04;
      if (tt < 0) return;
      const r = rng(200 + k);
      // 日光灯启辉：亮-灭-亮-灭-常亮
      const seq = [0.05 + r() * 0.03, 0.05 + r() * 0.04, 0.05 + r() * 0.03, 0.07 + r() * 0.05];
      let on = 1, acc = 0;
      for (let i = 0; i < seq.length; i++) {
        acc += seq[i];
        if (tt < acc) {
          on = i % 2 === 0 ? 0.9 : 0.12;
          break;
        }
      }
      const a = on * (1 - out);
      // 窗格：每个字后面一扇亮起来的窗
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(COL.window, 0.07 * a);
      ctx.fillRect(xs[k] - 30, y - 34, 60, 68);
      ctx.strokeStyle = rgba(COL.window, 0.22 * a);
      ctx.lineWidth = 1;
      ctx.strokeRect(xs[k] - 30, y - 34, 60, 68);
      ctx.restore();
      glyph(ctx, {ch, x: xs[k], y, size: 50, a, col: [255, 226, 186], glow: 0.7 * on, glowCol: COL.window, blur: out * 5});
    });
  },

  burn(ctx, l, s) {
    const xs = rowX(l.chars.length, 80);
    const y = H * 0.24;
    const out = leave(s, l, 0.7);
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      if (s < t - 0.04) return;
      const u = s - t;
      const flash = Math.exp(-u * 5);
      const r = rng(300 + k);
      const hot = ch === '灼' || ch === '伤' || ch === '耀' || ch === '眼';
      const jit = hot ? 2.2 * Math.sin(s * 47 + k) : 0;
      const col = [255, lerp(255, 206, clamp(u * 2)), lerp(255, 168, clamp(u * 2))];
      glyph(ctx, {
        ch, x: xs[k] + jit, y: y + jit * 0.5 - out * 20, size: 60, weight: 400, a: (1 - out) * clamp(u * 12),
        col: out > 0 ? [lerp(col[0], 160, out), lerp(col[1], 60, out), lerp(col[2], 40, out)] : col,
        glow: 0.5 + 2.2 * flash, glowCol: [255, 200, 150], ca: 1.2 + 7 * flash + (hot ? 1.5 : 0), blur: 3 * flash + 6 * out,
      });
      // 过曝时的大光斑
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, glow([255, 240, 220], 0.9), xs[k], y, 260, 0.55 * flash);
      ctx.restore();
      // 余烬
      const emb = ((u * 0.9 + r()) % 1);
      sparks(ctx, 330 + k + Math.floor(u * 0.9 + r()) * 17, xs[k], y, 3, emb, [255, 150, 80], 30, 90, 5);
    });
  },

  drift(ctx, l, s) {
    const n = l.chars.length;
    const xs = rowX(n, 70);
    const y = H * 0.8;
    const out = leave(s, l, 0.8);
    // 雾
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, glow([90, 96, 140], 0), W / 2, y, 1200, 0.18 * (1 - out) * ss(l.t - 0.3, l.t + 0.5, s));
    ctx.restore();
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const r = rng(400 + k);
      const sx = W * (0.15 + 0.7 * r()), sy = H * (0.2 + 0.6 * r());
      const g = E.io3(prog(s, t - 0.5, t + 0.6)); // 从四散处慢慢聚拢
      const lost = ch === '迷' || ch === '茫';
      const wob = 10 * Math.sin(s * 1.3 + k * 1.7);
      const x = lerp(sx, xs[k] + (r() - 0.5) * 26, g) + wob * (1 - g * 0.6) + (r() - 0.5) * 160 * out;
      const yy = lerp(sy, y + (r() - 0.5) * 30, g) + 8 * Math.sin(s * 0.9 + k) - 30 * out;
      const a = ss(t - 0.7, t, s) * (0.4 + 0.6 * g) * (1 - out);
      glyph(ctx, {ch, x, y: yy, size: 52, a, col: [214, 218, 236], blur: lerp(9, lost ? 3.2 : 0.8, g) + 6 * out, glow: 0.25});
    });
  },

  glint(ctx, l, s) {
    const n = l.chars.length;
    const xs = rowX(n, 72);
    const y = H * 0.82;
    const out = leave(s, l, 0.6);
    const t0 = l.times[0], t1 = lastT(l);
    // 冷光的位置：按每个字的时刻插值
    let gx = xs[0] - 140;
    if (s >= t0) {
      let k = 0;
      while (k < n - 1 && s > l.times[k + 1]) k++;
      gx = k >= n - 1 ? lerp(xs[n - 1], xs[n - 1] + 160, E.o2(prog(s, t1, t1 + 0.4))) : lerp(xs[k], xs[k + 1], prog(s, l.times[k], l.times[k + 1]));
    }
    const warmK = ss(t1 + 0.1, t1 + 0.8, s);
    l.chars.forEach((ch, k) => {
      const a = ss(l.times[k] - 0.06, l.times[k] + 0.08, s) * (1 - out);
      const col = [lerp(208, 255, warmK), lerp(224, 226, warmK), lerp(255, 196, warmK)];
      glyph(ctx, {ch, x: xs[k], y, size: 52, a, col, glow: 0.3 + 0.4 * warmK, glowCol: col});
    });
    // 刀锋一样的冷光 → 化成暖色的光点落下
    const lineA = ss(t0 - 0.3, t0, s) * (1 - warmK);
    if (lineA > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createLinearGradient(gx - 220, 0, gx, 0);
      grd.addColorStop(0, 'rgba(200,225,255,0)');
      grd.addColorStop(1, `rgba(235,245,255,${0.9 * lineA})`);
      ctx.fillStyle = grd;
      ctx.fillRect(gx - 220, y + 34, 220, 2);
      blit(ctx, glow([220, 236, 255], 0.9), gx, y + 35, 70, lineA);
      ctx.restore();
    }
    if (warmK > 0) {
      const r = rng(520);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const px = lerp(xs[0] - 60, xs[n - 1] + 120, r());
        const fall = (s - t1) * (20 + 30 * r());
        blit(ctx, glow([255, 200, 160], 0.7), px + 8 * Math.sin(s * 2 + i), y + 35 + fall, 4 + 4 * r(), (1 - out) * 0.8 * (1 - ss(t1 + 0.8, l.end + 0.3, s) * r()));
      }
      ctx.restore();
    }
  },

  wave(ctx, l, s) {
    const emph = l.emph ? l.text.indexOf(l.emph) : -1;
    const sizes = l.chars.map((_, i) => (emph >= 0 && i >= emph && i < emph + l.emph!.length ? 78 : 54));
    const adv = sizes.map(z => z * 1.45);
    let x = W / 2 - (adv.reduce((a, b) => a + b, 0) - adv[0] / 2 - adv[adv.length - 1] / 2) / 2;
    const y = H * 0.8;
    const out = leave(s, l, 0.6);
    l.chars.forEach((ch, k) => {
      const big = sizes[k] > 60;
      const t = l.times[k];
      const a = appear(s, t, 0.3);
      const r = rng(600 + k + l.idx * 20);
      glyph(ctx, {
        ch, x: x + (r() - 0.5) * 40 * out, y: y - (big ? 6 : 0) - 10 * (1 - a) - 26 * out, size: sizes[k], weight: big ? 400 : 300,
        a: a * (1 - out), blur: 7 * (1 - a) + 6 * out, col: big ? [255, 226, 196] : INK, glow: big ? 0.9 : 0.4, glowCol: big ? [255, 210, 170] : COL.ring,
      });
      // 每个字落下时漾开一圈
      const ru = prog(s, t, t + 0.7);
      if (ru > 0 && ru < 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(COL.ring, 0.5 * (1 - ru));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, sizes[k] * (0.4 + 1.3 * E.o2(ru)), sizes[k] * (0.2 + 0.5 * E.o2(ru)), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (big && a > 0.5) sparks(ctx, 640 + k, x, y, 5, ((s - t) * 0.8) % 1, [255, 236, 210], 50, 40, 7);
      if (out > 0) sparks(ctx, 660 + k, x, y, 6, out, INK, 50, 110);
      x += (adv[k] + (adv[k + 1] ?? 0)) / 2;
    });
  },

  thread(ctx, l, s) {
    // 竖排两列，从右往左；字像珠子一样沿着细线滑下来
    const n = l.chars.length;
    const split = Math.min(n, Math.max(1, l.chars.indexOf('这') + 1 || Math.ceil(n / 2)));
    const cols = [W - 170, W - 280];
    const size = 46, gap = size * 1.22, y0 = 170;
    const out = leave(s, l, 0.8);
    const vis = ss(l.t - 0.4, l.t, s) * (1 - out);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let c = 0; c < 2; c++) {
      const cnt = c === 0 ? split : n - split;
      const yEnd = y0 + (cnt - 0.5) * gap + 40;
      const grd = ctx.createLinearGradient(0, 0, 0, yEnd);
      grd.addColorStop(0, rgba(COL.thread, 0));
      grd.addColorStop(0.15, rgba(COL.thread, 0.5 * vis));
      grd.addColorStop(1, rgba(COL.thread, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(cols[c] - 0.8, 0, 1.6, yEnd * ss(l.t - 0.4 + c * 1.6, l.t + 0.4 + c * 1.6, s));
    }
    ctx.restore();
    l.chars.forEach((ch, k) => {
      const c = k < split ? 0 : 1, row = k < split ? k : k - split;
      const t = l.times[k];
      const slide = E.o3(prog(s, t - 0.45, t + 0.05));
      if (slide <= 0) return;
      const yT = y0 + row * gap;
      const yy = lerp(-60, yT, slide) + 40 * out * (1 + row * 0.1);
      glyph(ctx, {ch, x: cols[c], y: yy, size, a: slide * (1 - out), col: [255, 232, 236], glow: 0.55, glowCol: COL.thread, blur: 4 * (1 - slide) + 5 * out});
    });
  },

  break(ctx, l, s) {
    const xs = rowX(l.chars.length, 84);
    const y = H * 0.2;
    const out = leave(s, l, 0.6);
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const a = appear(s, t, 0.2);
      if (a <= 0) return;
      const tb = t + 0.32; // 框碎的时刻
      const struggle = ss(t, tb, s) * (1 - ss(tb, tb + 0.05, s));
      const jx = 3 * struggle * Math.sin(s * 61 + k * 3), jy = 2 * struggle * Math.cos(s * 53 + k);
      const free = E.o3(prog(s, tb, tb + 0.6));
      // 方框：四条边各自飞散
      const hs = 34;
      const r = rng(800 + k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(COL.net, 0.75 * a * (1 - free) * (1 - out));
      ctx.lineWidth = 1.5;
      const sides: Array<[number, number, number, number]> = [
        [-hs, -hs, hs, -hs],
        [hs, -hs, hs, hs],
        [hs, hs, -hs, hs],
        [-hs, hs, -hs, -hs],
      ];
      sides.forEach(([x0, y0, x1, y1], i) => {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const fly = free * (60 + 80 * r());
        const ang = free * (r() - 0.5) * 2.4;
        ctx.save();
        ctx.translate(xs[k] + mx * (1 + free * 0.3) + Math.sign(mx) * fly + jx, y + my * (1 + free * 0.3) + Math.sign(my) * fly + jy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(x0 - mx, y0 - my);
        ctx.lineTo(x1 - mx, y1 - my);
        ctx.stroke();
        ctx.restore();
        void i;
      });
      ctx.restore();
      glyph(ctx, {ch, x: xs[k] + jx, y: y + jy - 14 * free - 20 * out, size: 50, a: a * (1 - out), col: free > 0.2 ? WARM : INK, glow: 0.2 + 0.6 * free * (1 - free * 0.5), glowCol: WARM, blur: 5 * out});
      if (free > 0) sparks(ctx, 850 + k, xs[k], y, 6, free, WARM, 70, 30, 5);
    });
  },

  stamp(ctx, l, s) {
    const n = l.chars.length;
    const xs = rowX(n, 76);
    const y = H * 0.8;
    const out = leave(s, l, 0.7);
    let shake = 0;
    l.chars.forEach((_, k) => {
      const u = s - l.times[k];
      if (u > 0.1) shake += 4 * Math.exp(-(u - 0.1) * 18) * Math.sin(u * 90);
    });
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const u = prog(s, t - 0.1, t + 0.02);
      if (u <= 0) return;
      const r = rng(900 + k);
      const sc = lerp(1.7, 1, E.i3(u));
      glyph(ctx, {
        ch, x: xs[k], y: y + shake, size: 54, weight: 600, a: u * (1 - out), col: [214, 208, 200], rot: (r() - 0.5) * 0.08,
        sx: sc, sy: sc, blur: 3 * (1 - u) + 7 * out, shadow: 1.4,
      });
      // 落下时的一圈尘
      const d = prog(s, t + 0.02, t + 0.5);
      if (d > 0 && d < 1) sparks(ctx, 930 + k, xs[k], y + 26, 8, d, [200, 196, 190], 70, -6, 4);
    });
    // 朱红印框
    const sealA = ss(lastT(l) + 0.12, lastT(l) + 0.3, s) * (1 - out);
    if (sealA > 0) {
      const sc = lerp(1.25, 1, E.o3(prog(s, lastT(l) + 0.12, lastT(l) + 0.3)));
      ctx.save();
      ctx.translate(W / 2, y + shake);
      ctx.rotate(-0.015);
      ctx.scale(sc, sc);
      ctx.strokeStyle = rgba(COL.cell, 0.8 * sealA);
      ctx.lineWidth = 3;
      const hw = ((n - 1) * 76) / 2 + 52;
      ctx.strokeRect(-hw, -46, hw * 2, 92);
      ctx.restore();
    }
  },

  flap(ctx, l, s) {
    const n = l.chars.length;
    const cw = 66, chh = 84, gap = 8;
    const x0 = W / 2 - ((n - 1) * (cw + gap)) / 2;
    const y = H * 0.15;
    const out = leave(s, l, 0.5);
    const board = ss(l.t - 0.5, l.t - 0.2, s) * (1 - out);
    if (board <= 0) return;
    const pool = [...LINES.map(q => q.chars.join('')).join('')];
    ctx.save();
    ctx.globalAlpha = 0.85 * board;
    ctx.fillStyle = '#080a14';
    ctx.fillRect(x0 - cw / 2 - 18, y - chh / 2 - 14, (n - 1) * (cw + gap) + cw + 36, chh + 28);
    ctx.strokeStyle = rgba(COL.rail, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - cw / 2 - 18, y - chh / 2 - 14, (n - 1) * (cw + gap) + cw + 36, chh + 28);
    ctx.restore();
    l.chars.forEach((ch, k) => {
      const x = x0 + k * (cw + gap);
      const t = l.times[k];
      ctx.save();
      ctx.globalAlpha = board;
      ctx.fillStyle = '#151a2a';
      ctx.fillRect(x - cw / 2, y - chh / 2, cw, chh);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - cw / 2, y - 1, cw, 2);
      ctx.restore();
      // 翻牌：落定前每 50ms 换一个字，并带翻页的纵向压缩
      const settle = s >= t;
      const flipping = s > l.t - 0.45 && !settle;
      const step = Math.floor((s - l.t) / 0.05);
      const shown = settle ? ch : flipping ? pool[Math.abs((step * 7 + k * 13) % pool.length)] : '';
      const ph = settle ? 1 : ((s - l.t) / 0.05) % 1;
      if (!shown) return;
      glyph(ctx, {ch: shown, x, y, size: 52, weight: 500, a: board * (settle ? 1 : 0.75), col: settle ? [255, 200, 110] : [200, 160, 100], sy: settle ? 1 : Math.abs(Math.cos(ph * Math.PI)), glow: settle ? 0.45 : 0.1, glowCol: COL.rail, shadow: 0});
    });
  },

  sink(ctx, l, s) {
    const x = W - 200, y0 = 260, size = 52;
    const sinkT = lastT(l) + 0.25;
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const a = appear(s, t, 0.35);
      const deep = k >= l.chars.length - 2 ? 1.6 : 1;
      const d = Math.max(0, s - sinkT);
      const fade = ss(l.end - 0.5, l.end + 0.3, s);
      glyph(ctx, {
        ch, x: x + 6 * Math.sin(s * 1.1 + k), y: y0 + k * size * 1.3 + d * 28 * deep * (1 + k * 0.15), size,
        a: a * lerp(1, 0.35, ss(sinkT, sinkT + 1, s)) * (1 - fade), col: [196, 204, 230], blur: d * 2.2 * deep + 6 * fade, glow: 0.15,
      });
    });
  },

  rise(ctx, l, s) {
    const xs = rowX(l.chars.length, 74);
    const y = H * 0.8;
    const out = leave(s, l, 0.5);
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const u = prog(s, t - 0.08, t + 0.35);
      if (u <= 0) return;
      const yy = y + 70 * (1 - E.oBack(u, 2.2)) - 24 * out;
      glyph(ctx, {ch, x: xs[k], y: yy, size: 54, weight: 400, a: clamp(u * 3) * (1 - out), col: WARM, glow: 0.6, glowCol: [255, 196, 150], blur: 5 * out});
      sparks(ctx, 1100 + k, xs[k], y - 20, 6, prog(s, t, t + 0.7), [255, 214, 170], 40, 120, 6);
    });
  },

  echo(ctx, l, s) {
    const xs = rowX(l.chars.length, 76);
    const y = H * 0.5;
    const out = leave(s, l, 0.5);
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const a = appear(s, t, 0.2);
      if (a <= 0) return;
      // 三层回声，依次漾开
      for (let e = 1; e <= 3; e++) {
        const u = prog(s, t + e * 0.07, t + e * 0.07 + 0.8);
        if (u <= 0 || u >= 1) continue;
        glyph(ctx, {ch, x: xs[k], y, size: 54, a: 0.35 * (1 - u) * (1 - out), col: [190, 180, 255], sx: 1 + 0.9 * u, sy: 1 + 0.9 * u, blur: 2 + 4 * u, shadow: 0});
      }
      glyph(ctx, {ch, x: xs[k], y: y - 20 * out, size: 54, a: a * (1 - out), col: INK, glow: 0.35, glowCol: COL.ring, blur: 5 * out});
    });
  },

  reach(ctx, l, s) {
    const n = l.chars.length;
    const stretch = ss(lastT(l), l.end + 0.2, s); // 句尾：整行往右拉长、追出去
    const gap = lerp(80, 128, stretch);
    const xs = rowX(n, gap, W / 2 + 160 * stretch);
    const y = H * 0.8;
    const out = leave(s, l, 0.5);
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const a = appear(s, t, 0.25);
      if (a <= 0) return;
      // 向右的拖影
      for (let e = 1; e <= 5; e++) {
        glyph(ctx, {ch, x: xs[k] + e * (10 + 30 * stretch), y, size: 56, a: (0.22 / e) * a * (1 - out), col: [255, 214, 180], blur: 2 + e, shadow: 0, sx: 1 + 0.15 * e * stretch});
      }
      glyph(ctx, {ch, x: xs[k] + 40 * out, y, size: 56, weight: 400, a: a * (1 - out), col: WARM, glow: 0.5, glowCol: COL.rail, blur: 4 * out});
    });
  },

  farewell(ctx, l, s) {
    const xs = rowX(l.chars.length, 104);
    const y = H * 0.48;
    const dis = prog(s, lastT(l) + 0.15, l.end - 0.1); // 化成星尘飞向右上方的那颗星
    l.chars.forEach((ch, k) => {
      const t = l.times[k];
      const a = appear(s, t, 0.4);
      if (a <= 0) return;
      glyph(ctx, {ch, x: xs[k], y, size: 72, a: a * (1 - E.i2(dis)), col: WARM, glow: 0.6, glowCol: [255, 210, 180], blur: 5 * (1 - a) + 8 * dis});
      if (dis > 0) {
        const r = rng(1300 + k);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const ox = (r() - 0.5) * 60, oy = (r() - 0.5) * 60, d0 = r();
          const u = clamp(dis * 1.3 - d0 * 0.3);
          const px = xs[k] + ox + u * u * (320 + 300 * r()), py = y + oy - u * (180 + 260 * r());
          blit(ctx, glow([255, 236, 214], 0.8), px, py, 4 + 5 * r(), Math.sin(Math.PI * clamp(u * 1.1)) * 0.9);
        }
        ctx.restore();
      }
    });
  },
};

/** 一个字困在一格网里：写在世界空间的网格上 */
function netText(ctx: Ctx, cam: Cam, l: Line, s: number, bul: number, hole: number) {
  const AZ = 2.5 * DEG, EL = 2 * DEG;
  const el0 = 18 * DEG, el1 = el0 + EL;
  const fadeOut = ss(l.end + 0.1, l.end + 0.8, s);
  l.chars.forEach((ch, i) => {
    const t0 = l.times[i];
    const a = E.o2(prog(s, t0 - 0.04, t0 + 0.3)) * (1 - fadeOut);
    if (a <= 0) return;
    const az0 = 2.5 * DEG - i * AZ;
    const A = project(cam, netPoint(az0, el1, s, bul, hole));
    const B = project(cam, netPoint(az0 - AZ, el1, s, bul, hole));
    const C = project(cam, netPoint(az0, el0, s, bul, hole));
    const D = project(cam, netPoint(az0 - AZ, el0, s, bul, hole));
    if (A[2] <= 0 || B[2] <= 0 || C[2] <= 0 || D[2] <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(COL.cell, 0.75 * a);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.lineTo(D[0], D[1]);
    ctx.lineTo(C[0], C[1]);
    ctx.closePath();
    ctx.stroke();
    const cap = 1 + 0.35 * (1 - E.oBack(prog(s, t0, t0 + 0.4), 2));
    ctx.setTransform(B[0] - A[0], B[1] - A[1], C[0] - A[0], C[1] - A[1], A[0], A[1]);
    ctx.translate(0.5, 0.52);
    ctx.scale(cap / 100, cap / 100);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(INK, 1);
    ctx.font = `400 74px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

export function drawWorldLyrics(ctx: Ctx, cam: Cam, s: number, bul: number, hole: number) {
  for (const l of LINES) if (l.look === 'net' && s > l.t - 0.2 && s < l.end + 2.4) netText(ctx, cam, l, s, bul, hole);
}

/** 各特效的字幕区域：在下面垫一层很淡的暗雾，保证压在亮网/亮星上也看得清 */
const ZONE: Partial<Record<string, [number, number, number, number]>> = {
  whisper: [W / 2, H * 0.8, 520, 120],
  flicker: [W / 2, H * 0.17, 1000, 150],
  burn: [W / 2, H * 0.24, 1000, 160],
  drift: [W / 2, H * 0.8, 1000, 150],
  glint: [W / 2, H * 0.82, 1000, 150],
  wave: [W / 2, H * 0.8, 1100, 170],
  break: [W / 2, H * 0.2, 1000, 160],
  stamp: [W / 2, H * 0.8, 900, 160],
  flap: [W / 2, H * 0.15, 900, 160],
  sink: [W - 200, H * 0.5, 180, 700],
  rise: [W / 2, H * 0.8, 900, 160],
  echo: [W / 2, H * 0.5, 900, 160],
  reach: [W / 2 + 120, H * 0.8, 1100, 160],
  farewell: [W / 2, H * 0.48, 900, 200],
  column: [W * 0.14, H * 0.5, 180, 800],
  thread: [W - 225, H * 0.4, 300, 700],
};
function shade(ctx: Ctx, z: [number, number, number, number], a: number) {
  if (a <= 0.01) return;
  const [cx, cy, w, h] = z;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(w / 2, h / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(3,4,14,${0.42 * a})`);
  g.addColorStop(0.6, `rgba(3,4,14,${0.25 * a})`);
  g.addColorStop(1, 'rgba(3,4,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawScreenLyrics(ctx: Ctx, cam: Cam, s: number) {
  for (const l of LINES) {
    if (l.look === 'net' || s < l.t - 0.8 || s > l.end + 1.2) continue;
    const z = ZONE[l.look];
    if (z) shade(ctx, z, ss(l.t - 0.5, l.t - 0.1, s) * (1 - ss(l.end, l.end + 0.6, s)));
    FX[l.look]?.(ctx, l, s, cam);
  }
}
