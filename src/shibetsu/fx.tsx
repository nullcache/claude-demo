import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, Img, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {H, W} from './timeline';

// ───────────────────────── 小工具 ─────────────────────────

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const ss = (a: number, b: number, x: number) => {
  const t = prog(x, a, b);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 原曲时间（秒） */
export const useT = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return frame / fps;
};

/** 8fps 的“格”，用来做胶片抖动、颗粒——致敬原 PV 的 8 帧作画 */
export const step8 = (t: number) => Math.floor(t * 8);

export const img = (name: string) => staticFile(`shibetsu/img/${name}`);

// ───────────────────────── 图片加载（给 canvas 用）─────────────────────────

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string) {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('图片加载失败 ' + src));
      im.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** 等一组异步资源就绪再渲染这一帧 */
export function useAsset<T>(key: string, fn: () => Promise<T>): T | null {
  const [v, setV] = useState<T | null>(null);
  const [handle] = useState(() => delayRender('资源 ' + key));
  useEffect(() => {
    let alive = true;
    fn()
      .then(x => {
        if (alive) setV(() => x);
        continueRender(handle);
      })
      .catch(e => cancelRender(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return v;
}

/** 每帧重画的 canvas。draw 在 layout effect 里同步执行，截帧前一定画完。 */
export const Canvas: React.FC<{
  draw: (ctx: CanvasRenderingContext2D) => void;
  deps: unknown[];
  style?: React.CSSProperties;
  ready?: boolean;
}> = ({draw, deps, style, ready = true}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    const ctx = ref.current.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);
  return <canvas ref={ref} width={W} height={H} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}} />;
};

// ───────────────────────── 画面层 ─────────────────────────

export interface KB {
  s: [number, number]; // 缩放 起→止
  x?: [number, number]; // 平移（px）
  y?: [number, number];
  ox?: number; // 缩放中心（0..1）
  oy?: number;
}

export const kbTransform = (kb: KB, p: number) => {
  const e = easeInOut(clamp(p));
  const s = lerp(kb.s[0], kb.s[1], e);
  const x = kb.x ? lerp(kb.x[0], kb.x[1], e) : 0;
  const y = kb.y ? lerp(kb.y[0], kb.y[1], e) : 0;
  return {transform: `translate(${x}px, ${y}px) scale(${s})`, transformOrigin: `${(kb.ox ?? 0.5) * 100}% ${(kb.oy ?? 0.5) * 100}%`};
};

/** 一张铺满的图，带推拉、调色和柔光（bloom 用同一张图模糊后叠“滤色”）。 */
export const Plate: React.FC<{src: string; filter?: string; bloom?: number; style?: React.CSSProperties}> = ({src, filter, bloom = 0.16, style}) => (
  <AbsoluteFill style={style}>
    <Img src={img(src)} style={{width: '100%', height: '100%', objectFit: 'cover', filter}} />
    {bloom > 0 ? (
      <Img src={img(src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: `${filter ?? ''} blur(22px) brightness(1.15)`, mixBlendMode: 'screen', opacity: bloom}} />
    ) : null}
  </AbsoluteFill>
);

/** 抠出来的奶娃一层：按 manifest 的位置摆，脚底为轴轻轻呼吸。 */
export const Layer: React.FC<{
  l: {src: string; x: number; y: number; w: number; h: number};
  t: number;
  breathe?: number;
  phase?: number;
  style?: React.CSSProperties;
  filter?: string;
  extra?: string; // 额外 transform
}> = ({l, t, breathe = 0.008, phase = 0, style, filter, extra = ''}) => {
  const b = Math.sin((t * 2 * Math.PI) / 3.6 + phase);
  const sy = 1 + breathe * b;
  const sx = 1 - breathe * 0.35 * b;
  return (
    <Img
      src={img(l.src)}
      style={{
        position: 'absolute',
        left: l.x,
        top: l.y,
        width: l.w,
        height: l.h,
        transformOrigin: '50% 100%',
        transform: `${extra} scale(${sx}, ${sy})`,
        filter,
        ...style,
      }}
    />
  );
};

// ───────────────────────── 粒子 ─────────────────────────

type Ctx = CanvasRenderingContext2D;

const glowCache = new Map<string, HTMLCanvasElement>();
/** 预渲染的柔光点（径向渐变），比每次 shadowBlur 快得多 */
export function glowDot(color: string) {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, color);
    grd.addColorStop(0.18, color);
    grd.addColorStop(0.45, color.replace(/[\d.]+\)$/, '0.25)'));
    grd.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
  }
  return c;
}

/** 萤火虫：慢慢游走，一明一灭 */
export function fireflies(ctx: Ctx, t: number, n: number, seed: string, area: [number, number, number, number], alpha = 1) {
  const [x0, y0, x1, y1] = area;
  const dot = glowDot('rgba(220,255,140,1)');
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const bx = lerp(x0, x1, r('x')), by = lerp(y0, y1, r('y'));
    const ax = 30 + 70 * r('ax'), ay = 20 + 50 * r('ay');
    const fx = 0.05 + 0.12 * r('fx'), fy = 0.04 + 0.1 * r('fy');
    const x = bx + ax * Math.sin(2 * Math.PI * fx * t + 6 * r('px')) + 12 * Math.sin(2 * Math.PI * 0.7 * t + 9 * r('qx'));
    const y = by + ay * Math.sin(2 * Math.PI * fy * t + 6 * r('py')) + 8 * Math.cos(2 * Math.PI * 0.55 * t + 9 * r('qy'));
    const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.25 + 0.35 * r('f')) * t + 6 * r('pp'));
    const a = alpha * (0.25 + 0.75 * pulse ** 2);
    const s = 18 + 16 * r('s');
    ctx.globalAlpha = a;
    ctx.drawImage(dot, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** 光里漂浮的灰尘 */
export function dust(ctx: Ctx, t: number, n: number, seed: string, area: [number, number, number, number], color = 'rgba(255,240,210,1)', alpha = 0.8) {
  const [x0, y0, x1, y1] = area;
  const dot = glowDot(color);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const w = x1 - x0, h = y1 - y0;
    const vx = (r('vx') - 0.5) * 18, vy = -4 - 10 * r('vy');
    let x = x0 + ((r('x') * w + vx * t + 20 * Math.sin(t * 0.6 + 7 * r('p'))) % w + w) % w;
    let y = y0 + ((r('y') * h + vy * t) % h + h) % h;
    const tw = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.2 + 0.5 * r('f')) * t + 6 * r('ph'));
    const s = 4 + 9 * r('s') ** 2;
    ctx.globalAlpha = alpha * (0.2 + 0.8 * tw) * (0.4 + 0.6 * r('a'));
    ctx.drawImage(dot, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** 水面/积水上的闪光：十字星芒，一闪一闪 */
export function glints(ctx: Ctx, t: number, n: number, seed: string, area: [number, number, number, number], alpha = 1) {
  const [x0, y0, x1, y1] = area;
  const dot = glowDot('rgba(255,250,235,1)');
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const period = 1.2 + 2.5 * r('T');
    const ph = ((t + r('ph') * period) % period) / period;
    const life = 0.22 + 0.2 * r('L');
    if (ph > life) continue;
    const k = Math.sin((ph / life) * Math.PI);
    const cycle = Math.floor((t + r('ph') * period) / period);
    const rx = random(`${seed}-${i}-x-${cycle}`), ry = random(`${seed}-${i}-y-${cycle}`);
    const x = lerp(x0, x1, rx), y = lerp(y0, y1, ry ** 0.8);
    const s = (10 + 26 * r('s')) * (0.6 + 0.4 * ry);
    ctx.globalAlpha = alpha * k;
    ctx.drawImage(dot, x - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = alpha * k * 0.7;
    ctx.fillStyle = 'rgba(255,252,240,0.9)';
    ctx.fillRect(x - s * 1.2, y - 0.6, s * 2.4, 1.2);
    ctx.fillRect(x - 0.6, y - s * 0.7, 1.2, s * 1.4);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ───────────────────────── 胶片质感 ─────────────────────────

let grainTiles: HTMLCanvasElement[] | null = null;
function grain() {
  if (grainTiles) return grainTiles;
  grainTiles = [];
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas');
    c.width = W / 2;
    c.height = H / 2;
    const g = c.getContext('2d')!;
    const d = g.createImageData(c.width, c.height);
    let s = 12345 + k * 7919;
    for (let i = 0; i < d.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = 128 + ((s >> 8) % 120) - 60;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    grainTiles.push(c);
  }
  return grainTiles;
}

export const FilmGrain: React.FC<{t: number; amount?: number}> = ({t, amount = 0.09}) => {
  const k = step8(t) % 6;
  return (
    <Canvas
      deps={[k, amount]}
      style={{mixBlendMode: 'overlay', opacity: amount * 4}}
      draw={ctx => {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(grain()[k], 0, 0, W, H);
      }}
    />
  );
};

export const Vignette: React.FC<{amount?: number}> = ({amount = 0.55}) => (
  <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 62% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,${amount}) 100%)`}} />
);

/** 8fps 的轻微画面抖动（片门晃动） */
export const weave = (t: number, amp = 1.6) => {
  const k = step8(t);
  return {x: (random(`wx${k}`) - 0.5) * 2 * amp, y: (random(`wy${k}`) - 0.5) * 2 * amp};
};

/** 漏光：切镜时边缘泛起一层暖色 */
export const LightLeak: React.FC<{a: number; hue?: string; side?: 'left' | 'right' | 'top'}> = ({a, hue = '255,160,80', side = 'right'}) => {
  if (a <= 0.001) return null;
  const pos = side === 'left' ? '0% 40%' : side === 'top' ? '50% 0%' : '100% 60%';
  return <AbsoluteFill style={{background: `radial-gradient(ellipse 80% 60% at ${pos}, rgba(${hue},${0.75 * a}) 0%, rgba(${hue},${0.25 * a}) 40%, rgba(${hue},0) 75%)`, mixBlendMode: 'screen'}} />;
};
