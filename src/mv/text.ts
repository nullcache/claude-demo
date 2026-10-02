import {clamp, DEG, E, lerp, prog, ss} from '../lib/math';
import {COL, CUE, H, rgba, W} from './config';
import {LYRICS, Lyric, TITLE, ALL_TEXT} from './lyrics';
import {CRANE_DIR} from './scene';
import {blit, glow} from './sprites';
import {Cam, project, rng} from './v3';
import {netPoint} from './world';

type Ctx = CanvasRenderingContext2D;
export const SERIF = '"Noto Serif SC Variable", "Noto Serif SC", serif';
export const LATIN = '"Cormorant Garamond", serif';

export async function loadFonts() {
  const specs = ['300 64px', '400 64px', '500 64px', '200 64px'];
  await Promise.all([
    ...specs.map(sp => document.fonts.load(`${sp} ${SERIF}`, ALL_TEXT)),
    document.fonts.load(`400 30px ${LATIN}`, TITLE.en),
    document.fonts.load(`300 30px ${LATIN}`, TITLE.en),
  ]);
  await document.fonts.ready;
}

/** 每个字的出现时刻：在本句时长里均匀铺开（无音频数据时的近似咬字） */
const charT = (l: Lyric, i: number, span = 0.78) => l.t + 0.04 + (i / Math.max(1, [...l.text].length)) * (l.end - l.t) * span;

/** 一个字从星尘里凝结：模糊→清晰、轻微上浮；离场时散开上飘 */
function dustChar(ctx: Ctx, ch: string, x: number, y: number, size: number, weight: number, t0: number, t1: number, s: number, col: readonly number[], seed: number, glowA = 0.5) {
  const a = E.o2(prog(s, t0, t0 + 0.45));
  const out = E.i2(prog(s, t1 - 0.15, t1 + 0.55));
  if (a <= 0 || out >= 1) return;
  const r = rng(seed);
  const dx = (r() - 0.5) * 40 * out, dy = -26 * out - 10 * (1 - a);
  const blur = 9 * (1 - a) + 7 * out;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, glow(col, 0.1), x + dx, y + dy, size * 2.6, glowA * 0.35 * a * (1 - out));
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
  ctx.globalAlpha = a * (1 - out);
  ctx.fillStyle = rgba(col, 1);
  ctx.font = `${weight} ${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + dx, y + dy);
  ctx.restore();
  // 散开时剥落的几粒光点
  if (out > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = glow(col, 0.8);
    for (let k = 0; k < 7; k++) {
      const px = x + (r() - 0.5) * size * 0.9 + (r() - 0.5) * 120 * out;
      const py = y + (r() - 0.5) * size * 0.9 - (40 + 140 * r()) * out;
      blit(ctx, g, px, py, 5 + r() * 6, 0.8 * Math.sin(Math.PI * out));
    }
    ctx.restore();
  }
}

const INK = [243, 236, 223];

function drawWhisper(ctx: Ctx, l: Lyric, s: number) {
  const chars = [...l.text];
  const gap = 52;
  chars.forEach((ch, i) => {
    const x = W / 2 + (i - (chars.length - 1) / 2) * gap;
    dustChar(ctx, ch, x, H * 0.8, 30, 300, l.t - 0.1 + i * 0.12, l.end + 0.15, s, INK, i + 1, 0.3);
  });
}

function drawColumn(ctx: Ctx, l: Lyric, s: number, x: number, y0: number, size: number, weight = 300) {
  const chars = [...l.text];
  chars.forEach((ch, i) => {
    dustChar(ctx, ch, x, y0 + i * size * 1.32, size, weight, charT(l, i), l.end - 0.05 + i * 0.03, s, INK, 100 + i + Math.round(l.t * 10));
  });
}

function drawWave(ctx: Ctx, l: Lyric, s: number, y: number) {
  const chars = [...l.text];
  const emph = l.emph ? l.text.indexOf(l.emph) : -1;
  const sizes = chars.map((_, i) => (emph >= 0 && i >= emph && i < emph + l.emph!.length ? 78 : 54));
  const adv = sizes.map(z => z * 1.5);
  const total = adv.reduce((a, b) => a + b, 0) - adv[adv.length - 1] * 0.5 - adv[0] * 0.5;
  let x = W / 2 - total / 2;
  chars.forEach((ch, i) => {
    const big = sizes[i] > 60;
    const col = big ? [255, 226, 196] : INK;
    dustChar(ctx, ch, x, y - (big ? 6 : 0), sizes[i], big ? 400 : 300, charT(l, i, 0.72), l.end + i * 0.025, s, col, 300 + i + Math.round(l.t * 10), big ? 0.9 : 0.5);
    x += (adv[i] + (adv[i + 1] ?? 0)) / 2;
  });
}

/** 一个字困在一格网里：写在世界空间的网格上，格线泛起朱红 */
function drawNetText(ctx: Ctx, cam: Cam, l: Lyric, s: number, bul: number, hole: number) {
  const chars = [...l.text];
  const AZ = 2.5 * DEG, EL = 2 * DEG;
  // 纸鹤头顶上方的一行，沿网壁向远处退去（近大远小）
  const el0 = 18 * DEG, el1 = el0 + EL;
  const fadeOut = ss(l.end + 0.6, l.end + 2.2, s);
  chars.forEach((ch, i) => {
    const t0 = charT(l, i, 0.8);
    const a = E.o2(prog(s, t0, t0 + 0.35)) * (1 - fadeOut);
    if (a <= 0) return;
    const az0 = 2.5 * DEG - i * AZ;
    const A = project(cam, netPoint(az0, el1, s, bul, hole));
    const B = project(cam, netPoint(az0 - AZ, el1, s, bul, hole));
    const C = project(cam, netPoint(az0, el0, s, bul, hole));
    const D = project(cam, netPoint(az0 - AZ, el0, s, bul, hole));
    if (A[2] <= 0 || B[2] <= 0 || C[2] <= 0 || D[2] <= 0) return;
    // 格子
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
    // 落进格子时的一下“收紧”
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

function drawSide(ctx: Ctx, l: Lyric, s: number) {
  const x = l.at === 'left' ? 170 : W - 170;
  drawColumn(ctx, l, s, x, 250, 44);
}

/** 标题：副歌后的间奏里，竖排的「反乌托邦」 */
function drawTitle(ctx: Ctx, s: number) {
  const t0 = CUE.post + 0.9, t1 = CUE.bridge - 0.5;
  if (s < t0 - 0.1 || s > t1 + 0.8) return;
  const chars = [...TITLE.zh];
  const x = 330, y0 = 300, size = 92;
  chars.forEach((ch, i) => dustChar(ctx, ch, x, y0 + i * size * 1.42, size, 300, t0 + i * 0.32, t1 + i * 0.06, s, INK, 900 + i, 0.8));
  const a = ss(t0 + 1.2, t0 + 2.2, s) * (1 - ss(t1, t1 + 0.6, s));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = rgba(INK, 1);
  ctx.font = `300 26px ${LATIN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 英文竖着贴在标题右侧
  ctx.translate(x + 92, y0 + 1.5 * size * 1.42);
  ctx.rotate(Math.PI / 2);
  ctx.letterSpacing = '14px';
  ctx.fillText(TITLE.en, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = a * 0.7;
  ctx.fillStyle = rgba(INK, 1);
  ctx.font = `300 22px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.fillText(TITLE.credit, x - 46, y0 + 4 * size * 1.42 + 40);
  ctx.restore();
}

export function drawWorldText(ctx: Ctx, cam: Cam, s: number, bul: number, hole: number) {
  for (const l of LYRICS) if (l.look === 'net' && l.text && s > l.t - 0.2 && s < l.end + 2.4) drawNetText(ctx, cam, l, s, bul, hole);
}

export function drawScreenText(ctx: Ctx, s: number) {
  for (const l of LYRICS) {
    if (!l.text || s < l.t - 0.3 || s > l.end + 1) continue;
    if (l.look === 'whisper') drawWhisper(ctx, l, s);
    else if (l.look === 'column') drawColumn(ctx, l, s, W * 0.14, 235, 56);
    else if (l.look === 'wave') drawWave(ctx, l, s, H * 0.8);
    else if (l.look === 'side') drawSide(ctx, l, s);
  }
  drawTitle(ctx, s);
}

export {clamp, lerp, CRANE_DIR};
