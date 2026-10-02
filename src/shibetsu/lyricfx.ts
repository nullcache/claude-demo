import type React from 'react';
import {random} from 'remotion';
import {clamp, easeOut, glowDot, lerp, ss, step8} from './fx';
import {flickerHolds, PORCH_DISSOLVE} from './shots';
import {BEAT, CUES, W} from './timeline';

/**
 * 每句歌词一种特效（右侧竖排日文，逐字画在 canvas 上；中文翻译是 DOM，跟着做简化版）。
 *
 *  ripple    水面倒影般晃动着浮现，「死別」更大、带冷光
 *  glare     过曝刺眼地闪现，一道光从上往下扫过，越往后越晃眼
 *  muffle    随心跳挤压、发虚、重影，像捂住耳朵后的耳鸣
 *  rain      一个个字像雨滴从上方坠落，落地轻弹（蝉時雨）
 *  stark     打字机一样硬生生地出现，「死」是暗红色
 *  evaporate 和右边那只同步：先发金光，再从上到下碎成光点飘走
 *  flutter   蝉翼般闪烁着出现
 *  flash     跟着闪切的节拍一格出一个字，每次切换红蓝错位
 *  rot       慢慢变色、往下融化滴落，最后一个个掉出画面
 *  farewell  暖光里浮现，结尾散成光点飘向夕阳
 */
export type Look = 'ripple' | 'glare' | 'muffle' | 'rain' | 'stark' | 'evaporate' | 'flutter' | 'flash' | 'rot' | 'farewell';
export const LOOKS: Look[] = ['ripple', 'glare', 'muffle', 'rain', 'stark', 'evaporate', 'flutter', 'flash', 'rot', 'farewell'];

type Ctx = CanvasRenderingContext2D;
type Cue = (typeof CUES)[number];

export const JA_FONT = '"Klee One", serif';
const SIZE = 56;
const ADV = SIZE * 1.14;
const CX = W - 58 - SIZE / 2;
const TOP = 230;
const SMALL = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ';
const PUNCT = '、。，．';
/** 粒子类特效在句子结束后还要飘一会儿 */
const TAIL: Partial<Record<Look, number>> = {evaporate: 2.6, farewell: 2.6};

/** 竖排里第 k 个字的中心（小写假名、标点挪到格子右上角） */
function cell(ch: string, k: number) {
  let x = CX;
  let y = TOP + ADV * k + SIZE / 2;
  if (SMALL.includes(ch)) {
    x += SIZE * 0.14;
    y -= SIZE * 0.16;
  }
  if (PUNCT.includes(ch)) {
    x += SIZE * 0.32;
    y -= SIZE * 0.34;
  }
  return {x, y};
}

interface Draw {
  a: number;
  dx?: number;
  dy?: number;
  sx?: number;
  sy?: number;
  rot?: number;
  blur?: number;
  color?: string;
  glow?: string;
  glowBlur?: number;
  shadow?: number;
  comp?: GlobalCompositeOperation;
}

function drawChar(ctx: Ctx, ch: string, x: number, y: number, d: Draw) {
  if (d.a <= 0.003) return;
  ctx.save();
  ctx.translate(x + (d.dx ?? 0), y + (d.dy ?? 0));
  if (d.rot) ctx.rotate(d.rot);
  ctx.scale(d.sx ?? 1, d.sy ?? 1);
  if (ch === 'ー') ctx.rotate(Math.PI / 2);
  ctx.font = `600 ${SIZE}px ${JA_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = clamp(d.a);
  if (d.comp) ctx.globalCompositeOperation = d.comp;
  if (d.blur && d.blur > 0.05) ctx.filter = `blur(${d.blur.toFixed(2)}px)`;
  const sh = d.shadow ?? 1;
  if (sh > 0) {
    ctx.shadowColor = `rgba(0,0,0,${(0.62 * sh).toFixed(3)})`;
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = d.color ?? '#fff';
  ctx.fillText(ch, 0, 0);
  if (d.glow) {
    ctx.shadowColor = d.glow;
    ctx.shadowBlur = d.glowBlur ?? 18;
    ctx.fillText(ch, 0, 0);
  }
  ctx.restore();
}

// ───────────── 字形取样：用来把字打碎成粒子、或切成竖条做融化 ─────────────

const glyphCanvas = new Map<string, HTMLCanvasElement>();
const glyphPts = new Map<string, {x: number; y: number}[]>();
const G = 96;

function glyph(ch: string) {
  let c = glyphCanvas.get(ch);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = G;
    const g = c.getContext('2d', {willReadFrequently: true})!;
    g.font = `600 ${SIZE}px ${JA_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(ch, G / 2, G / 2);
    glyphCanvas.set(ch, c);
  }
  return c;
}

function points(ch: string) {
  let p = glyphPts.get(ch);
  if (!p) {
    const d = glyph(ch).getContext('2d', {willReadFrequently: true})!.getImageData(0, 0, G, G).data;
    p = [];
    for (let y = 0; y < G; y += 3) for (let x = 0; x < G; x += 3) if (d[(y * G + x) * 4 + 3] > 110) p.push({x: x - G / 2, y: y - G / 2});
    glyphPts.set(ch, p);
  }
  return p;
}

/** 一个字碎成光点：age 为释放后的秒数 */
function burst(
  ctx: Ctx,
  ch: string,
  x: number,
  y: number,
  age: number,
  seed: string,
  o: {dur: number; vx: [number, number]; vy: [number, number]; color: string; toward?: {x: number; y: number; k: number}},
) {
  if (age <= 0) return;
  const dot = glowDot(o.color);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  points(ch).forEach((p, i) => {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const a0 = age - r('d') * 0.3;
    if (a0 <= 0) return;
    const life = a0 / o.dur;
    if (life >= 1) return;
    let px = x + p.x + lerp(o.vx[0], o.vx[1], r('vx')) * a0 + 12 * Math.sin(a0 * 3 + i);
    let py = y + p.y + lerp(o.vy[0], o.vy[1], r('vy')) * a0 - 16 * a0 * a0;
    if (o.toward) {
      const k = easeOut(clamp(life)) * o.toward.k;
      px = lerp(px, o.toward.x, k);
      py = lerp(py, o.toward.y, k);
    }
    const s = 2.5 + 4.5 * r('s');
    ctx.globalAlpha = (1 - life) ** 1.5 * 0.85;
    ctx.drawImage(dot, px - s, py - s, s * 2, s * 2);
  });
  ctx.restore();
}

/** 融化：把字切成 2px 宽的竖条，每条往下拉长不同的长度 */
let tint: HTMLCanvasElement | null = null;
function meltChar(ctx: Ctx, ch: string, x: number, y: number, m: number, color: string, alpha: number, seed: string) {
  if (!tint) {
    tint = document.createElement('canvas');
    tint.width = tint.height = G;
  }
  const tg = tint.getContext('2d')!;
  tg.globalCompositeOperation = 'source-over';
  tg.clearRect(0, 0, G, G);
  tg.drawImage(glyph(ch), 0, 0);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = color;
  tg.fillRect(0, 0, G, G);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let col = 0; col < G; col += 2) {
    const r = random(`${seed}-${col >> 3}`) * 0.7 + random(`${seed}-c${col}`) * 0.3;
    const drip = m * (8 + 70 * r * r);
    ctx.drawImage(tint, col, 0, 2, G, x - G / 2 + col, y - G / 2 + drip * 0.25, 2, G + drip);
  }
  ctx.restore();
}

const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

/** 心跳：咚-咚 */
const heartbeat = (t: number) => {
  const ph = (t - 0.255) / BEAT;
  const f = ph - Math.floor(ph);
  return Math.exp(-((f / 0.09) ** 2)) + 0.6 * Math.exp(-(((f - 0.3) / 0.08) ** 2));
};

// ───────────── 每一句 ─────────────

function drawLine(ctx: Ctx, t: number, cue: Cue, look: Look, text: string, nextSame: boolean) {
  const chars = [...text];
  const n = chars.length;
  const u = t - cue.from;
  const len = cue.to - cue.from;
  const p = clamp(u / len);
  const exit = nextSame ? 1 : 1 - ss(cue.to - 0.12, cue.to, t);

  chars.forEach((ch, k) => {
    const {x, y} = cell(ch, k);
    const seed = `ly${cue.i}-${k}`;
    switch (look) {
      case 'ripple': {
        const age = u - k * 0.06;
        const a = ss(0, 0.6, age);
        const emph = ch === '死' || ch === '別';
        const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.6 * t);
        drawChar(ctx, ch, x, y, {
          a: a * exit,
          dx: (1 - a) * 12 * Math.sin(2 * Math.PI * (1.2 * t + k * 0.45)) + 2.2 * Math.sin(2 * Math.PI * (0.33 * t + k * 0.6)),
          dy: (1 - a) * 10,
          blur: 7 * (1 - a) + (1 - exit) * 4,
          sx: emph ? 1.16 : 1,
          sy: emph ? 1.16 : 1,
          color: emph ? '#eef6ff' : '#fff',
          glow: emph ? 'rgba(170,212,255,0.95)' : undefined,
          glowBlur: 12 + 10 * pulse,
        });
        break;
      }
      case 'glare': {
        const age = u - k * 0.05;
        const a = ss(0, 0.45, age);
        const flare = age > 0 ? Math.exp(-age * 3.2) : 0;
        const sweepY = TOP - 120 + ((u * 760) % (n * ADV + 520));
        const si = Math.exp(-(((y - sweepY) / 70) ** 2));
        const hot = flare + 0.8 * si + 0.35 * p; // 越到后面越晃眼
        // 过曝的光晕：先在字后面叠一团白光，再画字
        if (a * exit > 0.01 && hot > 0.02) {
          const dot = glowDot('rgba(255,246,222,1)');
          const r = SIZE * (0.9 + 1.6 * hot);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = clamp(0.55 * hot) * a * exit;
          ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
          // 扫过时一道横向的光芒
          if (si > 0.05) {
            ctx.globalAlpha = 0.7 * si * a * exit;
            const g = ctx.createLinearGradient(x - 170, 0, x + 170, 0);
            g.addColorStop(0, 'rgba(255,240,210,0)');
            g.addColorStop(0.5, 'rgba(255,250,235,1)');
            g.addColorStop(1, 'rgba(255,240,210,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 170, y - 1.5, 340, 3);
          }
          ctx.restore();
        }
        drawChar(ctx, ch, x, y, {
          a: a * exit,
          sx: 1 + 0.3 * flare + 0.06 * si,
          sy: 1 + 0.3 * flare + 0.06 * si,
          blur: 5 * (1 - a) + 2.5 * flare,
          color: hot > 0.4 ? '#ffffff' : '#fff6e2',
          glow: 'rgba(255,244,214,1)',
          glowBlur: 14 + 50 * flare + 26 * p + 40 * si,
        });
        break;
      }
      case 'muffle': {
        const age = u - k * 0.035;
        const a = ss(0, 0.2, age);
        const hb = heartbeat(t);
        const j = step8(t);
        const jx = (random(`mj${k}-${j}`) - 0.5) * 5 * (0.4 + hb);
        const jy = (random(`mk${k}-${j}`) - 0.5) * 3 * (0.4 + hb);
        const ghost = 5 + 9 * hb;
        for (const s of [-1, 1]) drawChar(ctx, ch, x, y, {a: 0.28 * hb * a * exit, dx: jx + s * ghost, dy: jy, sx: 1 - 0.12 * hb, blur: 2.5, color: '#b9c8dc', shadow: 0});
        drawChar(ctx, ch, x, y, {a: a * exit, dx: jx, dy: jy, sx: 1 - 0.12 * hb, blur: 0.3 + 2.2 * hb, color: '#e9eef6'});
        break;
      }
      case 'rain': {
        const T = cue.from + 0.08 * k;
        const f = clamp((t - T) / 0.42);
        const g = t - (T + 0.42);
        const bounce = g > 0 ? Math.exp(-g * 14) : 0;
        const wet = ch === '時' || ch === '雨';
        drawChar(ctx, ch, x, y, {
          a: (f > 0 ? 0.35 + 0.65 * f : 0) * exit,
          dy: -380 * (1 - f * f),
          sx: 1 + 0.15 * bounce,
          sy: f < 1 ? 1 + 0.9 * (1 - f) : 1 - 0.12 * bounce,
          blur: 2.5 * (1 - f),
          color: wet ? '#e4f1ff' : '#fff',
          glow: wet ? 'rgba(195,228,255,0.7)' : undefined,
          glowBlur: 14,
        });
        break;
      }
      case 'stark': {
        const T = cue.from + 0.1 * k;
        const on = t >= T;
        const flash = on ? Math.exp(-(t - T) * 10) : 0;
        const death = ch === '死';
        drawChar(ctx, ch, x, y, {
          a: on ? exit : 0,
          sx: 1 + 0.08 * flash,
          sy: 1 + 0.08 * flash,
          color: death ? '#e0473b' : '#fff',
          glow: death ? 'rgba(200,30,20,0.85)' : `rgba(255,255,255,${(0.9 * flash).toFixed(3)})`,
          glowBlur: death ? 14 + 20 * flash : 30 * flash,
        });
        break;
      }
      case 'evaporate': {
        const R = PORCH_DISSOLVE.D0 + 0.25 + k * 0.16;
        const g = ss(R - 0.5, R, t);
        const gone = ss(R, R + 0.3, t);
        const death = ch === '死';
        drawChar(ctx, ch, x, y, {
          a: 1 - gone,
          dy: -6 * gone,
          blur: 3 * gone,
          color: death ? mix([224, 71, 59], [255, 214, 150], g) : mix([255, 255, 255], [255, 244, 207], g),
          glow: g > 0.01 ? `rgba(255,220,140,${g.toFixed(3)})` : death ? 'rgba(200,30,20,0.85)' : undefined,
          glowBlur: 10 + 30 * g,
        });
        burst(ctx, ch, x, y, t - R, seed, {dur: 2.2, vx: [30, 120], vy: [-40, -150], color: 'rgba(255,230,160,1)'});
        break;
      }
      case 'flutter': {
        const age = u - k * 0.07;
        const a = ss(0, 0.5, age);
        const flick = age < 0.55 ? (random(`fl${k}-${step8(t)}`) < 0.35 + 0.65 * a ? 1 : 0.15) : 1;
        drawChar(ctx, ch, x, y, {
          a: a * flick * exit,
          dx: (1 - a) * 3 * Math.sin(2 * Math.PI * 28 * t + k),
          blur: 3 * (1 - a),
          color: '#fbfff0',
          glow: 'rgba(225,255,175,0.55)',
          glowBlur: ch === '蝉' ? 14 + 12 * (step8(t) % 2) : 16,
        });
        break;
      }
      case 'flash': {
        const holds = flickerHolds(38.5, 43.0);
        const T = holds[Math.min(k, holds.length - 1)];
        const on = t >= T;
        let t0 = holds[0];
        let ci = 0;
        holds.forEach((h, i) => {
          if (t >= h) {
            t0 = h;
            ci = i;
          }
        });
        const rgb = t < 43.05 ? 1 - clamp((t - t0) / 0.16) : 0;
        const sx = (random(`sh${ci}`) - 0.5) * 6 * rgb;
        const summer = ch === '夏';
        const base: Draw = {a: on ? exit : 0, dx: sx, sx: summer ? 1.12 : 1, sy: summer ? 1.12 : 1};
        if (rgb > 0.01 && on) {
          drawChar(ctx, ch, x, y, {...base, a: 0.75 * rgb, dx: sx - 7 * rgb, color: '#ff3b3b', shadow: 0, comp: 'lighter'});
          drawChar(ctx, ch, x, y, {...base, a: 0.75 * rgb, dx: sx + 7 * rgb, color: '#33e6ff', shadow: 0, comp: 'lighter'});
        }
        drawChar(ctx, ch, x, y, {...base, color: summer ? '#fff1dc' : '#fff', glow: summer ? 'rgba(255,190,120,0.8)' : undefined, glowBlur: 20});
        break;
      }
      case 'rot': {
        const age = u - k * 0.05;
        const a = ss(0, 0.4, age);
        const dc = ss(cue.from + 0.6, cue.to - 0.9, t);
        const col: [number, number, number] = dc < 0.5 ? [255, 255, 255] : [222, 208, 150];
        const color = dc < 0.5 ? mix([255, 255, 255], [222, 208, 150], dc * 2) : mix(col, [196, 166, 104], (dc - 0.5) * 2);
        const m = ss(cue.from + 1.0, cue.to - 0.5, t);
        const F = cue.to - 1.25 + (n - 1 - k) * 0.07;
        const fa = t - F;
        const fall = fa > 0 ? 0.5 * 2600 * fa * fa : 0;
        const spin = fa > 0 ? (random(`rs${k}`) - 0.5) * 6 * fa : 0;
        const fadeFall = fa > 0 ? 1 - ss(0.25, 0.6, fa) : 1;
        if (m < 0.02 || fa > 0) {
          drawChar(ctx, ch, x, y, {a: a * fadeFall, dy: fall, rot: spin, blur: 4 * (1 - a), color});
        } else {
          meltChar(ctx, ch, x, y, m, color, a * 0.9, seed);
          drawChar(ctx, ch, x, y, {a: a * (1 - m * 0.4), blur: 0, color});
        }
        break;
      }
      case 'farewell': {
        const age = u - k * 0.08;
        const a = ss(0, 0.8, age);
        const R = cue.to - 1.0 + k * 0.04;
        const gone = ss(R, R + 0.35, t);
        drawChar(ctx, ch, x, y, {
          a: a * (1 - gone),
          dy: 16 * (1 - a) - 8 * gone,
          blur: 5 * (1 - a) + 3 * gone,
          sx: ch === '夏' ? 1.12 : 1,
          sy: ch === '夏' ? 1.12 : 1,
          color: '#fff3df',
          glow: 'rgba(255,196,120,0.75)',
          glowBlur: 18 + 6 * Math.sin(t * 2 + k),
        });
        burst(ctx, ch, x, y, t - R, seed, {dur: 2.2, vx: [-60, -10], vy: [-30, -110], color: 'rgba(255,215,150,1)', toward: {x: 540, y: 430, k: 0.45}});
        break;
      }
    }
  });

  // 蝉時雨：句子周围飘落的细雨丝
  if (look === 'rain') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 22; i++) {
      const r = (k: string) => random(`drz-${i}-${k}`);
      const span = n * ADV + 500;
      const yy = TOP - 250 + ((r('y') * span + (900 + 500 * r('v')) * u) % span);
      const xx = CX + (r('x') - 0.5) * 150;
      const l = 30 + 50 * r('l');
      ctx.globalAlpha = ss(0, 0.5, u) * exit * (0.5 + 0.5 * r('a'));
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + l);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawLyrics(ctx: Ctx, t: number, ja: string[]) {
  CUES.forEach((cue, j) => {
    const look = LOOKS[j];
    if (t < cue.from || t >= cue.to + (TAIL[look] ?? 0)) return;
    const text = ja[cue.i] ?? '';
    const next = CUES[j + 1];
    const nextSame = !!next && Math.abs(next.from - cue.to) < 0.01 && ja[next.i] === text;
    drawLine(ctx, t, cue, look, text, nextSame);
  });
}

/** 中文翻译（DOM）跟着各句特效做的简化版 */
export function zhStyle(j: number, t: number): React.CSSProperties | null {
  const cue = CUES[j];
  const look = LOOKS[j];
  const next = CUES[j + 1];
  if (t < cue.from || t >= cue.to) return null;
  const nextSame = look === 'stark' && !!next;
  const firstSame = look === 'evaporate';
  let a = firstSame ? 1 : ss(cue.from + 0.35, cue.from + 1.0, t);
  if (look === 'stark') a = ss(cue.from + 1.1, cue.from + 1.5, t);
  let ty = 0;
  let blur = (1 - a) * 6;
  let color = 'rgba(255,255,255,0.86)';
  let shadow = '0 0 16px rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.65)';
  if (look === 'rain') ty = -(1 - a) * 40;
  if (look === 'evaporate') {
    const g = ss(PORCH_DISSOLVE.D0 + 0.3, PORCH_DISSOLVE.D0 + 1.6, t);
    a *= 1 - g;
    ty = -14 * g;
    blur += 4 * g;
  }
  if (look === 'rot') {
    const dc = ss(cue.from + 0.6, cue.to - 0.9, t);
    color = dc < 0.5 ? `rgba(255,${Math.round(255 - 50 * dc)},${Math.round(255 - 200 * dc)},0.86)` : 'rgba(205,180,120,0.86)';
    const fa = t - (cue.to - 0.6);
    if (fa > 0) {
      ty = 0.5 * 2200 * fa * fa;
      a *= 1 - ss(0.1, 0.5, fa);
    }
  }
  if (look === 'farewell') a *= 1 - ss(cue.to - 0.9, cue.to - 0.3, t);
  if (look === 'flash') {
    const holds = flickerHolds(38.5, 43.0);
    let t0 = holds[0];
    holds.forEach(h => {
      if (t >= h) t0 = h;
    });
    const rgb = t < 43.05 ? 1 - clamp((t - t0) / 0.16) : 0;
    if (rgb > 0.01) shadow = `${-5 * rgb}px 0 rgba(255,60,60,${0.8 * rgb}), ${5 * rgb}px 0 rgba(50,230,255,${0.8 * rgb}), ` + shadow;
  }
  const exit = nextSame ? 1 : 1 - ss(cue.to - 0.12, cue.to, t);
  return {opacity: a * exit, transform: `translateY(${ty.toFixed(1)}px)`, filter: `blur(${blur.toFixed(2)}px)`, color, textShadow: shadow};
}
