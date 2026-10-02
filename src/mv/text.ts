import {E, prog, ss} from '../lib/math';
import {CUE, rgba} from './config';
import {allText, TITLE} from './lyrics';
import {SERIF} from './lyricfx';
import {blit, glow} from './sprites';
import {rng} from './v3';

type Ctx = CanvasRenderingContext2D;
export const LATIN = '"Cormorant Garamond", serif';
const INK = [243, 236, 223];

export async function loadFonts() {
  const text = allText();
  await Promise.all([
    ...['300', '400', '500', '600'].map(w => document.fonts.load(`${w} 64px ${SERIF}`, text)),
    document.fonts.load(`400 30px ${LATIN}`, TITLE.en),
    document.fonts.load(`300 30px ${LATIN}`, TITLE.en),
  ]);
  await document.fonts.ready;
}

/** 一个字从星尘里凝结：模糊→清晰、轻微上浮；离场时散开上飘 */
function dustChar(ctx: Ctx, ch: string, x: number, y: number, size: number, t0: number, t1: number, s: number, seed: number) {
  const a = E.o2(prog(s, t0, t0 + 0.45));
  const out = E.i2(prog(s, t1 - 0.15, t1 + 0.55));
  if (a <= 0 || out >= 1) return;
  const r = rng(seed);
  const dx = (r() - 0.5) * 40 * out, dy = -26 * out - 10 * (1 - a);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, glow(INK, 0.1), x + dx, y + dy, size * 2.6, 0.3 * a * (1 - out));
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = `blur(${(9 * (1 - a) + 7 * out).toFixed(1)}px)`;
  ctx.globalAlpha = a * (1 - out);
  ctx.fillStyle = rgba(INK, 1);
  ctx.font = `300 ${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + dx, y + dy);
  ctx.restore();
}

/** 标题：副歌后的间奏里，竖排的「反乌托邦」，四个字落在四拍上 */
export function drawTitle(ctx: Ctx, s: number) {
  const t0 = CUE.post + 0.5, t1 = CUE.bridge - 0.5;
  if (s < t0 - 0.1 || s > t1 + 0.8) return;
  const chars = [...TITLE.zh];
  const x = 330, y0 = 300, size = 92;
  chars.forEach((ch, i) => dustChar(ctx, ch, x, y0 + i * size * 1.42, size, t0 + i * 0.5, t1 + i * 0.06, s, 900 + i));
  const a = ss(t0 + 1.6, t0 + 2.6, s) * (1 - ss(t1, t1 + 0.6, s));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = rgba(INK, 1);
  ctx.font = `300 26px ${LATIN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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
