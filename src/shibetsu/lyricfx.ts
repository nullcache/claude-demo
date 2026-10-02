import {random} from 'remotion';
import {clamp, easeOut, glowDot, lerp, ss, step8} from './fx';
import {JA_FONT, ZH_FONT} from './fonts';
import {flickerHolds, PORCH_DISSOLVE} from './shots';
import {BEAT, CUES} from './timeline';

/**
 * 歌词：右侧两列竖排——日文原词（明朝体）+ 中文翻译（宋体），中间一条细线。
 * 两列逐字画在同一张 canvas 上，用同一条时间轴、同一种特效：中文第 j 个字按它在整句里的位置
 * （0..1）取和日文同位置的字一样的时间和动画，所以两列始终同步。
 *
 *  ripple    开场：细线先落下，字像墨在水里一样由上往下晕开，「死別」朱红
 *  glare     过曝地闪现，全句出齐后一道光从上往下扫过一次
 *  muffle    随心跳轻微挤压、发虚、重影，像捂住耳朵后的耳鸣
 *  rain      一个个字像雨滴从上方坠落，落地轻弹（蝉時雨）
 *  stark     打字机一样硬生生地出现，「死」朱红
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


interface Col {
  font: string;
  weight: number;
  size: number;
  x: number; // 列中心
  top: number;
  adv: number;
}
export const JA: Col = {font: JA_FONT, weight: 700, size: 60, x: 984, top: 196, adv: 60 * 1.1};
export const ZH: Col = {font: ZH_FONT, weight: 600, size: 40, x: 893, top: 204, adv: 40 * 1.2};
const RULE_X = 937;
const ACCENT = '#e0503f';
const ACCENT_CHARS = '死別别';

const SMALL = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ';
const PUNCT = '、。，．';
/** 粒子类特效在句子结束后还要飘一会儿 */
const TAIL: Partial<Record<Look, number>> = {evaporate: 2.6, farewell: 2.6};

function cell(col: Col, ch: string, k: number) {
  let x = col.x;
  let y = col.top + col.adv * k + col.size / 2;
  if (SMALL.includes(ch)) {
    x += col.size * 0.14;
    y -= col.size * 0.16;
  }
  if (PUNCT.includes(ch)) {
    // 竖排标点在格子右上角；中文字体的逗号本来就贴在左下，要挪得更多
    const o = col.font === ZH_FONT ? 0.58 : 0.32;
    x += col.size * o;
    y -= col.size * (o + 0.02);
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
  /** 由上往下显露的比例（墨晕开） */
  wipe?: number;
}

function paint(ctx: Ctx, col: Col, ch: string, d: Draw) {
  ctx.font = `${col.weight} ${col.size}px ${col.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sh = d.shadow ?? 1;
  if (sh > 0) {
    ctx.shadowColor = `rgba(0,0,0,${(0.7 * sh).toFixed(3)})`;
    ctx.shadowBlur = col.size * 0.28;
  }
  ctx.fillStyle = d.color ?? '#fff';
  ctx.fillText(ch, 0, 0);
  if (d.glow) {
    ctx.shadowColor = d.glow;
    ctx.shadowBlur = d.glowBlur ?? 18;
    ctx.fillText(ch, 0, 0);
  }
}

function drawChar(ctx: Ctx, col: Col, ch: string, x: number, y: number, d: Draw) {
  if (d.a <= 0.003) return;
  const w = d.wipe ?? 1;
  if (w <= 0) return;
  ctx.save();
  ctx.translate(x + (d.dx ?? 0), y + (d.dy ?? 0));
  if (d.rot) ctx.rotate(d.rot);
  ctx.scale(d.sx ?? 1, d.sy ?? 1);
  if (ch === 'ー') ctx.rotate(Math.PI / 2);
  ctx.globalAlpha = clamp(d.a);
  if (d.comp) ctx.globalCompositeOperation = d.comp;
  if (d.blur && d.blur > 0.05) ctx.filter = `blur(${d.blur.toFixed(2)}px)`;
  if (w < 1) {
    // 墨晕开：已显露的部分清晰，前沿再叠一层半透明、稍微往下渗一点
    const h = col.size * 1.3;
    const top = -h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-col.size, top, col.size * 2, h * w);
    ctx.clip();
    paint(ctx, col, ch, d);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = clamp(d.a) * 0.35;
    ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.rect(-col.size, top, col.size * 2, h * Math.min(1, w + 0.12));
    ctx.clip();
    paint(ctx, col, ch, {...d, shadow: 0});
    ctx.restore();
  } else {
    paint(ctx, col, ch, d);
  }
  ctx.restore();
}

// ───────────── 字形取样：打碎成粒子、切竖条做融化 ─────────────

const glyphCanvas = new Map<string, HTMLCanvasElement>();
const glyphPts = new Map<string, {x: number; y: number}[]>();
const gsize = (col: Col) => Math.ceil(col.size * 1.7);

function glyph(col: Col, ch: string) {
  const key = `${col.font}|${col.size}|${ch}`;
  let c = glyphCanvas.get(key);
  if (!c) {
    const G = gsize(col);
    c = document.createElement('canvas');
    c.width = c.height = G;
    const g = c.getContext('2d', {willReadFrequently: true})!;
    g.font = `${col.weight} ${col.size}px ${col.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(ch, G / 2, G / 2);
    glyphCanvas.set(key, c);
  }
  return c;
}

function points(col: Col, ch: string) {
  const key = `${col.font}|${col.size}|${ch}`;
  let p = glyphPts.get(key);
  if (!p) {
    const G = gsize(col);
    const d = glyph(col, ch).getContext('2d', {willReadFrequently: true})!.getImageData(0, 0, G, G).data;
    const step = col.size > 50 ? 3 : 2;
    p = [];
    for (let y = 0; y < G; y += step) for (let x = 0; x < G; x += step) if (d[(y * G + x) * 4 + 3] > 110) p.push({x: x - G / 2, y: y - G / 2});
    glyphPts.set(key, p);
  }
  return p;
}

function burst(
  ctx: Ctx,
  col: Col,
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
  const sc = col.size / 60;
  points(col, ch).forEach((p, i) => {
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
    const s = (2.5 + 4.5 * r('s')) * Math.max(0.7, sc);
    ctx.globalAlpha = (1 - life) ** 1.5 * 0.85;
    ctx.drawImage(dot, px - s, py - s, s * 2, s * 2);
  });
  ctx.restore();
}

let tint: HTMLCanvasElement | null = null;
function meltChar(ctx: Ctx, col: Col, ch: string, x: number, y: number, m: number, color: string, alpha: number, seed: string) {
  const G = gsize(col);
  if (!tint) {
    tint = document.createElement('canvas');
    tint.width = tint.height = 128;
  }
  const tg = tint.getContext('2d')!;
  tg.globalCompositeOperation = 'source-over';
  tg.clearRect(0, 0, 128, 128);
  tg.drawImage(glyph(col, ch), 0, 0);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = color;
  tg.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x - G / 2, y, G, G * 2);
  ctx.clip();
  const sc = col.size / 60;
  for (let c = 0; c < G; c += 2) {
    const r = random(`${seed}-${Math.floor(c / (8 * sc))}`) * 0.7 + random(`${seed}-c${c}`) * 0.3;
    const drip = m * (6 + 64 * r * r) * sc;
    // 下半截竖条往下拉长：上沿不动，越往下拖得越长
    ctx.drawImage(tint, c, G / 2, 2, G / 2, x - G / 2 + c, y, 2, G / 2 + drip);
  }
  ctx.restore();
}

const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

const heartbeat = (t: number) => {
  const ph = (t - 0.255) / BEAT;
  const f = ph - Math.floor(ph);
  return Math.exp(-((f / 0.09) ** 2)) + 0.6 * Math.exp(-(((f - 0.3) / 0.08) ** 2));
};

// ───────────── 每句、每个字 ─────────────

interface Env {
  ctx: Ctx;
  col: Col;
  ch: string;
  s: number; // 在整句里的位置 0..1（两列共用同一套时间）
  x: number;
  y: number;
  t: number;
  cue: Cue;
  seed: string;
  exit: number;
  colLen: number;
}

function fxChar(look: Look, e: Env) {
  const {ctx, col, ch, s, x, y, t, cue, seed, exit} = e;
  const u = t - cue.from;
  const accent = ACCENT_CHARS.includes(ch);
  switch (look) {
    case 'ripple': {
      const age = u - s * 1.25;
      const a = ss(0, 0.55, age);
      const w = clamp(age / 0.55);
      drawChar(ctx, col, ch, x, y, {
        a: exit,
        wipe: easeOut(w),
        dx: (1 - a) * 6 * Math.sin(2 * Math.PI * (1.6 * t + s * 3)),
        dy: (1 - a) * 8,
        blur: (1 - exit) * 4,
        sx: accent ? 1.08 : 1,
        sy: accent ? 1.08 : 1,
        color: accent ? ACCENT : '#fbf8f2',
      });
      break;
    }
    case 'glare': {
      const age = u - s * 0.75;
      const a = ss(0, 0.4, age);
      const flare = age > 0 ? Math.exp(-age * 3.6) : 0;
      // 全句出齐之后，只扫一次
      const sw = clamp((u - 1.3) / 1.1);
      const sweepY = col.top - 90 + sw * (e.colLen + 180);
      const si = sw > 0 && sw < 1 ? Math.exp(-(((y - sweepY) / (col.size * 1.1)) ** 2)) : 0;
      const hot = flare + si;
      if (a * exit > 0.01 && hot > 0.02) {
        const dot = glowDot('rgba(255,246,222,1)');
        const r = col.size * (0.8 + 1.1 * hot);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(0.38 * hot) * a * exit;
        ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
      drawChar(ctx, col, ch, x, y, {
        a: a * exit,
        sx: 1 + 0.18 * flare + 0.04 * si,
        sy: 1 + 0.18 * flare + 0.04 * si,
        blur: 4 * (1 - a) + 2 * flare,
        color: hot > 0.3 ? '#ffffff' : '#fff7e8',
        glow: hot > 0.02 ? `rgba(255,244,214,${clamp(hot).toFixed(3)})` : undefined,
        glowBlur: 10 + 30 * hot,
      });
      break;
    }
    case 'muffle': {
      const age = u - s * 0.45;
      const a = ss(0, 0.22, age);
      const hb = heartbeat(t);
      const j = step8(t);
      const jx = (random(`mj${seed}-${j}`) - 0.5) * 4 * (0.4 + hb);
      const jy = (random(`mk${seed}-${j}`) - 0.5) * 2.5 * (0.4 + hb);
      const ghost = 4 + 7 * hb;
      for (const sg of [-1, 1]) drawChar(ctx, col, ch, x, y, {a: 0.22 * hb * a * exit, dx: jx + sg * ghost, dy: jy, sx: 1 - 0.08 * hb, blur: 2, color: '#c3cfdf', shadow: 0});
      drawChar(ctx, col, ch, x, y, {a: a * exit, dx: jx, dy: jy, sx: 1 - 0.08 * hb, blur: 0.2 + 1.4 * hb, color: '#eef2f8'});
      break;
    }
    case 'rain': {
      const T = cue.from + s * 0.85;
      const f = clamp((t - T) / 0.42);
      const g = t - (T + 0.42);
      const bounce = g > 0 ? Math.exp(-g * 14) : 0;
      const wet = ch === '時' || ch === '雨';
      drawChar(ctx, col, ch, x, y, {
        a: (f > 0 ? 0.35 + 0.65 * f : 0) * exit,
        dy: -260 * (col.size / 60) * (1 - f * f),
        sx: 1 + 0.12 * bounce,
        sy: f < 1 ? 1 + 0.8 * (1 - f) : 1 - 0.1 * bounce,
        blur: 2.5 * (1 - f),
        color: wet ? '#e6f2ff' : '#fff',
      });
      break;
    }
    case 'stark': {
      const T = cue.from + s * 1.1;
      const on = t >= T;
      const flash = on ? Math.exp(-(t - T) * 10) : 0;
      drawChar(ctx, col, ch, x, y, {
        a: on ? exit : 0,
        sx: 1 + 0.06 * flash,
        sy: 1 + 0.06 * flash,
        color: ch === '死' ? ACCENT : '#fff',
        glow: flash > 0.02 ? `rgba(255,255,255,${(0.8 * flash).toFixed(3)})` : undefined,
        glowBlur: 24 * flash,
      });
      break;
    }
    case 'evaporate': {
      const R = PORCH_DISSOLVE.D0 + 0.25 + s * 1.76;
      const g = ss(R - 0.5, R, t);
      const gone = ss(R, R + 0.3, t);
      const death = ch === '死';
      drawChar(ctx, col, ch, x, y, {
        a: 1 - gone,
        dy: -6 * gone,
        blur: 3 * gone,
        color: death ? mix([224, 80, 63], [255, 214, 150], g) : mix([255, 255, 255], [255, 244, 207], g),
        glow: g > 0.01 ? `rgba(255,220,140,${g.toFixed(3)})` : undefined,
        glowBlur: 10 + 26 * g,
      });
      burst(ctx, col, ch, x, y, t - R, seed, {dur: 2.2, vx: [30, 120], vy: [-40, -150], color: 'rgba(255,230,160,1)'});
      break;
    }
    case 'flutter': {
      const age = u - s * 0.55;
      const a = ss(0, 0.5, age);
      const flick = age < 0.55 ? (random(`fl${seed}-${step8(t)}`) < 0.35 + 0.65 * a ? 1 : 0.15) : 1;
      drawChar(ctx, col, ch, x, y, {
        a: a * flick * exit,
        dx: (1 - a) * 3 * Math.sin(2 * Math.PI * 28 * t + s * 9),
        blur: 3 * (1 - a),
        color: '#fbfff2',
      });
      break;
    }
    case 'flash': {
      const holds = flickerHolds(38.5, 43.0);
      const T = holds[Math.min(Math.round(s * 7), holds.length - 1)]; // 「君と過ごした夏が」8 个字，一格一个
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
      const shx = (random(`sh${ci}`) - 0.5) * 5 * rgb;
      const summer = ch === '夏';
      const base: Draw = {a: on ? exit : 0, dx: shx, sx: summer ? 1.1 : 1, sy: summer ? 1.1 : 1};
      if (rgb > 0.01 && on) {
        const off = 6 * rgb * (col.size / 60);
        drawChar(ctx, col, ch, x, y, {...base, a: 0.7 * rgb, dx: shx - off, color: '#ff3b3b', shadow: 0, comp: 'lighter'});
        drawChar(ctx, col, ch, x, y, {...base, a: 0.7 * rgb, dx: shx + off, color: '#33e6ff', shadow: 0, comp: 'lighter'});
      }
      drawChar(ctx, col, ch, x, y, {...base, color: summer ? '#fff1dc' : '#fff'});
      break;
    }
    case 'rot': {
      const age = u - s * 0.55;
      const a = ss(0, 0.4, age);
      const dc = ss(cue.from + 0.6, cue.to - 0.9, t);
      const color = dc < 0.5 ? mix([255, 255, 255], [232, 220, 170], dc * 2) : mix([232, 220, 170], [214, 190, 130], (dc - 0.5) * 2);
      const m = ss(cue.from + 1.0, cue.to - 0.5, t);
      const F = cue.to - 1.25 + (1 - s) * 0.7;
      const fa = t - F;
      const fall = fa > 0 ? 0.5 * 2600 * fa * fa : 0;
      const spin = fa > 0 ? (random(`rs${seed}`) - 0.5) * 6 * fa : 0;
      const fadeFall = fa > 0 ? 1 - ss(0.25, 0.6, fa) : 1;
      if (m < 0.02 || fa > 0) {
        drawChar(ctx, col, ch, x, y, {a: a * fadeFall, dy: fall, rot: spin, blur: 4 * (1 - a), color});
      } else {
        meltChar(ctx, col, ch, x, y, m, color, a * 0.75, seed);
        drawChar(ctx, col, ch, x, y, {a, color});
      }
      break;
    }
    case 'farewell': {
      const age = u - s * 0.9;
      const a = ss(0, 0.8, age);
      const R = cue.to - 1.0 + s * 0.45;
      const gone = ss(R, R + 0.35, t);
      drawChar(ctx, col, ch, x, y, {
        a: a * (1 - gone),
        dy: 14 * (1 - a) - 8 * gone,
        blur: 4 * (1 - a) + 3 * gone,
        sx: ch === '夏' ? 1.08 : 1,
        sy: ch === '夏' ? 1.08 : 1,
        color: '#fff4e2',
        glow: 'rgba(255,196,120,0.55)',
        glowBlur: 16,
      });
      burst(ctx, col, ch, x, y, t - R, seed, {dur: 2.2, vx: [-60, -10], vy: [-30, -110], color: 'rgba(255,215,150,1)', toward: {x: 540, y: 430, k: 0.45}});
      break;
    }
  }
}

function drawLine(ctx: Ctx, t: number, cue: Cue, look: Look, ja: string, zh: string, nextSame: boolean, prevSame: boolean) {
  const exit = nextSame ? 1 : 1 - ss(cue.to - 0.12, cue.to, t);
  const u = t - cue.from;
  const cols: [Col, string][] = [
    [JA, ja],
    [ZH, zh],
  ];
  const lens = cols.map(([col, text]) => [...text].length * col.adv);

  // 两列之间的细线：随句子落下，句末收起
  if (t < cue.to) {
    const grow = prevSame ? 1 : easeOut(ss(0, look === 'ripple' ? 0.7 : 0.45, u));
    const len = Math.max(...lens) * grow;
    let a = 0.5 * exit;
    if (look === 'rot') a *= 1 - ss(cue.to - 1.2, cue.to - 0.6, t);
    if (look === 'farewell') a *= 1 - ss(cue.to - 1.0, cue.to - 0.4, t);
    if (look === 'evaporate') a *= 1 - ss(PORCH_DISSOLVE.D0, PORCH_DISSOLVE.D0 + 1.5, t);
    if (a > 0.005 && len > 1) {
      const g = ctx.createLinearGradient(0, JA.top - 20, 0, JA.top - 20 + len + 40);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.08, 'rgba(255,255,255,1)');
      g.addColorStop(0.92, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.fillRect(RULE_X - 0.6, JA.top - 20, 1.2, len + 40);
      ctx.restore();
    }
  }

  cols.forEach(([col, text], ci) => {
    const chars = [...text];
    const n = chars.length;
    chars.forEach((ch, k) => {
      const {x, y} = cell(col, ch, k);
      const s = n > 1 ? k / (n - 1) : 0;
      fxChar(look, {ctx, col, ch, s, x, y, t, cue, seed: `ly${cue.i}-${ci}-${k}`, exit, colLen: lens[ci]});
    });
  });

  // 蝉時雨：句子周围飘落的细雨丝
  if (look === 'rain' && t < cue.to) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.lineWidth = 1.2;
    const span = Math.max(...lens) + 500;
    for (let i = 0; i < 24; i++) {
      const r = (k: string) => random(`drz-${i}-${k}`);
      const yy = JA.top - 250 + ((r('y') * span + (900 + 500 * r('v')) * u) % span);
      const xx = (JA.x + ZH.x) / 2 + (r('x') - 0.5) * 230;
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

export function drawLyrics(ctx: Ctx, t: number, ja: string[], zh: string[]) {
  CUES.forEach((cue, j) => {
    const look = LOOKS[j];
    if (t < cue.from || t >= cue.to + (TAIL[look] ?? 0)) return;
    const next = CUES[j + 1];
    const prev = CUES[j - 1];
    const text = ja[cue.i] ?? '';
    const nextSame = !!next && Math.abs(next.from - cue.to) < 0.01 && ja[next.i] === text;
    const prevSame = !!prev && Math.abs(cue.from - prev.to) < 0.01 && ja[prev.i] === text;
    drawLine(ctx, t, cue, look, text, zh[cue.i] ?? '', nextSame, prevSame);
  });
}
