import {rgba} from './config';
import {rng} from './v3';

// 预渲染的光晕/星芒/散景/颗粒贴图（每个浏览器标签只生成一次）
const cache = new Map<string, HTMLCanvasElement>();
const mk = (w: number, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
function memo(key: string, f: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (!c) {
    c = f();
    cache.set(key, c);
  }
  return c;
}

/** 柔光：中心偏白 → 颜色 → 透明（衰减近似 1/(1+r²)） */
export const glow = (col: readonly number[], hot = 0.6) =>
  memo(`g${col}${hot}`, () => {
    const S = 128, c = mk(S), x = c.getContext('2d')!;
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    const w = [255, 255, 255];
    const m = (k: number) => col.map((v, i) => Math.round(v + (w[i] - v) * k));
    g.addColorStop(0, rgba(m(hot), 1));
    for (let i = 1; i <= 8; i++) {
      const r = i / 8;
      const a = 1 / (1 + 30 * r * r) - 1 / 31;
      g.addColorStop(r, rgba(m(hot * (1 - r) * (1 - r)), a * (31 / 30)));
    }
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return c;
  });

/** 星芒：亮核 + 四道细长衍射光 */
export const flare = (col: readonly number[]) =>
  memo(`f${col}`, () => {
    const S = 256, c = mk(S), x = c.getContext('2d')!;
    x.globalCompositeOperation = 'lighter';
    x.drawImage(glow(col, 0.8), S * 0.3, S * 0.3, S * 0.4, S * 0.4);
    for (const [w, h, a] of [
      [S, 5, 0.9],
      [5, S, 0.9],
      [S * 0.55, 2.4, 0.5],
      [2.4, S * 0.55, 0.5],
    ] as const) {
      x.save();
      x.translate(S / 2, S / 2);
      const horiz = w > h;
      const L = horiz ? w : h;
      const g = horiz ? x.createLinearGradient(-L / 2, 0, L / 2, 0) : x.createLinearGradient(0, -L / 2, 0, L / 2);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba([255, 255, 255], a));
      g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g;
      x.beginPath();
      if (horiz) x.ellipse(0, 0, L / 2, h / 2, 0, 0, Math.PI * 2);
      else x.ellipse(0, 0, w / 2, L / 2, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    return c;
  });

/** 散景圆斑：柔边 + 微亮边缘 */
export const bokeh = (col: readonly number[]) =>
  memo(`b${col}`, () => {
    const S = 128, c = mk(S), x = c.getContext('2d')!;
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(col, 0.55));
    g.addColorStop(0.72, rgba(col, 0.62));
    g.addColorStop(0.86, rgba(col, 0.8));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return c;
  });

/** 胶片颗粒（灰度噪声，用 soft-light 叠加） */
export const grain = (i: number) =>
  memo(`n${i}`, () => {
    const S = 256, c = mk(S), x = c.getContext('2d')!;
    const img = x.createImageData(S, S), r = rng(9173 + i * 31);
    for (let p = 0; p < S * S; p++) {
      const v = 128 + (r() + r() + r() - 1.5) * 90;
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v;
      img.data[p * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  });

/** 离屏画布（按尺寸复用） */
export const offscreen = (key: string, w: number, h: number) =>
  memo(`o${key}${w}x${h}`, () => mk(w, h));

/** 在 (x, y) 处以直径 d 画贴图 */
export function blit(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, d: number, a: number) {
  if (a <= 0.003 || d < 0.3) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
}
