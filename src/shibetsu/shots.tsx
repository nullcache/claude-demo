import React from 'react';
import {AbsoluteFill, Img, random} from 'remotion';
import {Canvas, clamp, dust, easeInOut, fireflies, glints, glowDot, img, kbTransform, Layer, lerp, loadImage, Plate, prog, ss, useAsset} from './fx';
import {H, Shot, W} from './timeline';

export interface LayerInfo {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Manifest {
  s01: {bg: string; layers: LayerInfo[]};
  s01b: {bg: string};
  s02: {bg: string};
  s03: {bg: string};
  s04: {bg: string};
  s06: {both: string; alone: string; rmask: string};
  s08: {bg: string; layers: LayerInfo[]};
  s09: {frames: string[]};
  s11a: {bg: string};
  s11b: {bg: string};
  s12: {bg: string; layers: LayerInfo[]};
  s13: {bg: string};
  s14: {bg: string};
}

interface P {
  t: number;
  shot: Shot;
  m: Manifest;
}

const p01 = (t: number, s: Shot) => prog(t, s.from, s.to);

// ── 海边：原图那只望着海（不做任何复制合成） ──
export const S01: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const [a] = m.s01.layers;
  return (
    <AbsoluteFill style={kbTransform({s: [1.0, 1.06], x: [0, 12], ox: 0.45, oy: 0.55}, p)}>
      <Plate src={m.s01.bg} filter="saturate(0.9) contrast(1.03)" />
      <Canvas deps={[t]} draw={ctx => glints(ctx, t, 30, 'sea', [0, 1060, W, 1620], 0.75)} />
      <Layer l={a} t={t} breathe={0.005} filter="saturate(0.92)" />
    </AbsoluteFill>
  );
};

// ── 反打：它望着的那一只，漂在海里仰着脸 ──
export const S01b: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const bob = Math.sin(t * 1.9) * 6 + Math.sin(t * 0.8 + 1) * 4;
  return (
    <AbsoluteFill style={kbTransform({s: [1.1, 1.04], ox: 0.62, oy: 0.4}, p)}>
      <AbsoluteFill style={{transform: `translateY(${bob.toFixed(2)}px) rotate(${(Math.sin(t * 1.3) * 0.35).toFixed(3)}deg)`}}>
        <Plate src={m.s01b.bg} filter="saturate(0.88) contrast(1.02) brightness(1.03)" bloom={0.24} />
      </AbsoluteFill>
      <Canvas deps={[t]} draw={ctx => glints(ctx, t, 46, 'sea2', [160, 400, 1040, 980], 0.9)} />
    </AbsoluteFill>
  );
};

// ── 霍普《晨光》：讨厌起来的阳光 ──
export const S02: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const beam = 0.55 + 0.25 * Math.sin(t * 1.3) + 0.2 * ss(0.2, 1, p);
  return (
    <AbsoluteFill style={kbTransform({s: [1.03, 1.1], x: [10, -14], ox: 0.45, oy: 0.55}, p)}>
      <Plate src={m.s02.bg} filter="saturate(0.92) sepia(0.06) contrast(1.04)" bloom={0.22} />
      {/* 从右上窗口斜照进来的光柱 */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(118deg, rgba(255,236,190,0) 30%, rgba(255,236,190,0.55) 48%, rgba(255,236,190,0.15) 60%, rgba(255,236,190,0) 72%)',
          mixBlendMode: 'screen',
          opacity: 0.32 * beam,
        }}
      />
      <Canvas deps={[t]} draw={ctx => dust(ctx, t, 70, 'morning', [80, 500, 1000, 1500], 'rgba(255,240,205,1)', 0.75)} />
      {/* 越来越刺眼：高光慢慢溢出 */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 45% at 80% 35%, rgba(255,245,220,0.9), rgba(255,245,220,0) 70%)', mixBlendMode: 'screen', opacity: 0.12 + 0.28 * ss(0.4, 1, p)}} />
    </AbsoluteFill>
  );
};

// ── 楼梯间：怎么捂住耳朵也没用 ──
export const S03: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  // 窗外的云影掠过，窗光时明时暗
  const flicker = 0.75 + 0.25 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1);
  const press = ss(0.1, 1, p);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={kbTransform({s: [1.0, 1.12], ox: 0.38, oy: 0.62}, p)}>
        <Plate src={m.s03.bg} filter={`saturate(0.82) contrast(1.06) blur(${(0.0 + 0.9 * press * (0.5 + 0.5 * Math.sin(t * 5.2))).toFixed(2)}px)`} bloom={0.25} />
        <AbsoluteFill style={{background: 'radial-gradient(ellipse 28% 18% at 50% 23%, rgba(235,245,255,0.9), rgba(235,245,255,0) 70%)', mixBlendMode: 'screen', opacity: 0.35 * flicker}} />
      </AbsoluteFill>
      {/* 四周慢慢压暗，像声音被闷住 */}
      <AbsoluteFill style={{background: `radial-gradient(ellipse ${lerp(90, 60, press)}% ${lerp(75, 50, press)}% at 40% 60%, rgba(0,0,0,0) 45%, rgba(0,0,0,${0.35 + 0.35 * press}) 100%)`}} />
    </AbsoluteFill>
  );
};

// ── 阳台：蝉声如雨，事不关己 ──
const CICADA = ['ミーンミンミンミン', 'ジーーーーー', 'ミーンミーン', 'シャワシャワシャワ', 'ジジジジ', 'ミンミンミンミー', 'カナカナカナ'];
export const S04: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  return (
    <AbsoluteFill style={kbTransform({s: [1.08, 1.0], y: [-20, 0], oy: 0.4}, p)}>
      <Plate src={m.s04.bg} filter="saturate(1.04) contrast(1.02)" bloom={0.2} />
      {/* 热气：整张图上方轻轻晃动的亮雾 */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 45%)', mixBlendMode: 'screen'}} />
      <Canvas
        deps={[t]}
        draw={ctx => {
          // 蝉时雨：一串串拟声词像雨一样落下
          ctx.textBaseline = 'top';
          const n = 46;
          for (let i = 0; i < n; i++) {
            const r = (k: string) => random(`cic-${i}-${k}`);
            const word = CICADA[Math.floor(r('w') * CICADA.length)];
            const size = 18 + 16 * r('s');
            const speed = 260 + 380 * r('v');
            const len = word.length * size * 1.05;
            const x = 30 + r('x') * 880;
            const span = H + len;
            const y = ((r('y') * span + speed * (t - shot.from)) % span) - len;
            const a = (0.10 + 0.22 * r('a')) * ss(0, 0.12, p);
            ctx.font = `600 ${size.toFixed(0)}px "Klee One"`;
            ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
            const chars = [...word];
            chars.forEach((ch, k) => {
              const cy = y + k * size * 1.05;
              if (cy < -size || cy > H) return;
              ctx.save();
              if (ch === 'ー') {
                ctx.translate(x + size / 2, cy + size / 2);
                ctx.rotate(Math.PI / 2);
                ctx.fillText(ch, -size / 2, -size / 2);
              } else ctx.fillText(ch, x, cy);
              ctx.restore();
            });
          }
        }}
      />
    </AbsoluteFill>
  );
};

// ── 霍普《夏夜》：两只坐在门廊上 → 右边那只化成光点散去（一个镜头跨两句歌词） ──
// 整幅画面（一只的底图 + 还没散掉的那只 + 柔光）都画在同一张画布上，再统一套调色，
// 所以“散”之前和原图完全一样，不会有抠图贴上去的色差。
export const PORCH_DISSOLVE = {D0: 29.3, D1: 31.7};

interface Porch {
  both: HTMLImageElement;
  alone: HTMLImageElement;
  bd: ImageData;
  mR: Float32Array; // 右边那只（外扩一圈）：随噪声自上而下扫掠消散
  mG: Float32Array; // 其余差别（它投在墙上的影子）：整体淡掉
  noise: Float32Array;
  box: [number, number, number, number];
  seeds: {x: number; y: number; r: number; g: number; b: number; th: number; vx: number; vy: number; s: number}[];
  work: HTMLCanvasElement;
  comp: HTMLCanvasElement;
}

async function prepPorch(m: Manifest): Promise<Porch> {
  const [both, alone, rm] = await Promise.all([loadImage(img(m.s06.both)), loadImage(img(m.s06.alone)), loadImage(img(m.s06.rmask))]);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', {willReadFrequently: true})!;
  g.drawImage(both, 0, 0, W, H);
  const bd = g.getImageData(0, 0, W, H);
  g.clearRect(0, 0, W, H);
  g.drawImage(rm, 0, 0, W, H);
  const md = g.getImageData(0, 0, W, H).data;
  const mR = new Float32Array(W * H);
  const mG = new Float32Array(W * H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  let ry0 = H, ry1 = 0;
  for (let i = 0; i < W * H; i++) {
    const r = md[i * 4] / 255, gg = md[i * 4 + 1] / 255;
    mR[i] = r;
    mG[i] = gg;
    if (r > 0.01 || gg > 0.01) {
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (r > 0.5) {
        if (y < ry0) ry0 = y;
        if (y > ry1) ry1 = y;
      }
    }
  }
  // 平滑噪声 + 自上而下：从头顶开始散
  const noise = new Float32Array(W * H);
  const lat = (gx: number, gy: number, s: string) => random(`${s}-${gx}-${gy}`);
  const vnoise = (x: number, y: number, cell: number, s: string) => {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    const fx = x / cell - gx, fy = y / cell - gy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return lerp(lerp(lat(gx, gy, s), lat(gx + 1, gy, s), u), lerp(lat(gx, gy + 1, s), lat(gx + 1, gy + 1, s), u), v);
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const n = 0.55 * vnoise(x, y, 70, 'n1') + 0.3 * vnoise(x, y, 24, 'n2') + 0.15 * vnoise(x, y, 8, 'n3');
      const top = clamp((y - ry0) / Math.max(1, ry1 - ry0));
      noise[y * W + x] = clamp(0.18 * n + 0.82 * top);
    }
  }
  // 光点只从身体（亮的黄色）上取，影子不发光
  const seeds: Porch['seeds'] = [];
  let k = 0;
  while (seeds.length < 5200 && k < 600000) {
    k++;
    const x = Math.floor(lerp(x0, x1, random(`sx${k}`)));
    const y = Math.floor(lerp(y0, y1, random(`sy${k}`)));
    const i = y * W + x;
    if (mR[i] < 0.5) continue;
    const R = bd.data[i * 4], G = bd.data[i * 4 + 1], B = bd.data[i * 4 + 2];
    if (R + G + B < 3 * 70) continue;
    seeds.push({x, y, r: R, g: G, b: B, th: noise[i], vx: 30 + 90 * random(`vx${k}`), vy: -(40 + 120 * random(`vy${k}`)), s: 3 + 7 * random(`ss${k}`) ** 2});
  }
  const work = document.createElement('canvas');
  work.width = W;
  work.height = H;
  const comp = document.createElement('canvas');
  comp.width = W;
  comp.height = H;
  return {both, alone, bd, mR, mG, noise, box: [x0, y0, x1, y1], seeds, work, comp};
}

export const S06: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const d = useAsset('porch', () => prepPorch(m));
  const {D0, D1} = PORCH_DISSOLVE;
  const q = prog(t, D0, D1); // 消散进度
  const cool = ss(0, 1, prog(t, D0, D1 + 1.5));
  const glow = ss(28.6, D0 + 0.4, t); // 第二句一开始，右边那只先微微发亮
  const grade = `saturate(${lerp(1.06, 0.78, cool).toFixed(3)}) sepia(${lerp(0.12, 0.02, cool).toFixed(3)}) hue-rotate(${lerp(0, -8, cool).toFixed(2)}deg) brightness(${lerp(1, 0.94, cool).toFixed(3)}) contrast(1.03)`;
  return (
    <AbsoluteFill style={kbTransform({s: [1.0, 1.1], oy: 0.6}, p)}>
      <Canvas
        ready={!!d}
        deps={[t]}
        style={{filter: grade}}
        draw={ctx => {
          if (!d) return;
          const cc = d.comp.getContext('2d')!;
          cc.clearRect(0, 0, W, H);
          if (glow <= 0 && q <= 0) {
            cc.drawImage(d.both, 0, 0, W, H);
          } else {
            cc.drawImage(d.alone, 0, 0, W, H);
            const [x0, y0, x1, y1] = d.box;
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            const wc = d.work.getContext('2d')!;
            const out = wc.createImageData(bw, bh);
            const src = d.bd.data;
            const shadowA = 1 - ss(0, 0.8, q);
            for (let y = 0; y < bh; y++) {
              for (let x = 0; x < bw; x++) {
                const gi = (y + y0) * W + (x + x0);
                const r = d.mR[gi], gg = d.mG[gi];
                if (r <= 0.004 && gg <= 0.004) continue;
                const th = d.noise[gi];
                const keep = 1 - clamp((q * 1.08 - th) / 0.04 + 1);
                const edge = q > 0 ? clamp(1 - Math.abs(q * 1.08 - th + 0.02) / 0.06) : 0;
                // 只让黄色的身体发光：暗的门洞、偏蓝的白墙都不提亮，免得外圈亮出一道“抠图边”
                const R0 = src[gi * 4], G0 = src[gi * 4 + 1], B0 = src[gi * 4 + 2];
                const body = clamp(((R0 + G0) / 2 - B0 - 25) / 45) * clamp((R0 + G0 - 120) / 120);
                const lit = (glow * 70 * body + 170 * edge * Math.max(body, 0.35)) * r;
                const o = (y * bw + x) * 4;
                out.data[o] = Math.min(255, src[gi * 4] + lit);
                out.data[o + 1] = Math.min(255, src[gi * 4 + 1] + lit * 0.82);
                out.data[o + 2] = Math.min(255, src[gi * 4 + 2] + lit * 0.45);
                out.data[o + 3] = 255 * clamp(r * keep + gg * shadowA);
              }
            }
            wc.clearRect(0, 0, W, H);
            wc.putImageData(out, x0, y0);
            cc.drawImage(d.work, 0, 0);
          }
          ctx.drawImage(d.comp, 0, 0);
          // 柔光：和其它镜头的 Plate 一样，模糊后“滤色”叠一层
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.2;
          ctx.filter = 'blur(22px) brightness(1.15)';
          ctx.drawImage(d.comp, 0, 0);
          ctx.restore();
        }}
      />
      <Canvas
        ready={!!d}
        deps={[t]}
        draw={ctx => {
          if (!d) return;
          // 光点：被“释放”之后随晚风往右上飘，渐暗
          if (q > 0) {
            const dot = glowDot('rgba(255,236,170,1)');
            ctx.globalCompositeOperation = 'lighter';
            const dur = 2.4;
            for (const s of d.seeds) {
              const rel = (q * 1.08 - s.th) / 1.08;
              if (rel <= 0) continue;
              const age = rel * (D1 - D0) + Math.max(0, t - D1);
              if (age > dur) continue;
              const life = age / dur;
              const x = s.x + s.vx * age + 22 * Math.sin(age * 2 + s.y * 0.05);
              const y = s.y + s.vy * age - 18 * age * age;
              const a = (1 - life) ** 1.6 * 0.9;
              const sz = s.s * (1 + life);
              ctx.globalAlpha = a;
              ctx.drawImage(dot, x - sz, y - sz, sz * 2, sz * 2);
              ctx.globalAlpha = a * 0.8;
              ctx.fillStyle = `rgb(${Math.min(255, s.r + 90)},${Math.min(255, s.g + 80)},${Math.min(255, s.b + 40)})`;
              ctx.fillRect(x - 1, y - 1, 2, 2);
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
          fireflies(ctx, t, 16, 'ff', [100, 120, 1000, 1500], lerp(0.85, 0.35, cool));
        }}
      />
    </AbsoluteFill>
  );
};

// ── 草地：并排躺着听蝉 ──
export const S08: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const [l, r] = m.s08.layers;
  // 树影斑驳：几块柔和的暗斑缓缓移动
  return (
    <AbsoluteFill style={kbTransform({s: [1.12, 1.02], y: [30, 0], oy: 0.6}, p)}>
      <Plate src={m.s08.bg} filter="saturate(0.98) brightness(1.02)" bloom={0.14} />
      <Layer l={l} t={t} breathe={0.012} phase={2.1} />
      <Layer l={r} t={t} breathe={0.012} />
      <Canvas
        deps={[t]}
        style={{mixBlendMode: 'multiply'}}
        draw={ctx => {
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.fillRect(0, 0, W, H);
          for (let i = 0; i < 9; i++) {
            const rr = (k: string) => random(`leaf-${i}-${k}`);
            const x = lerp(-100, W + 100, rr('x')) + 40 * Math.sin(t * 0.5 + 6 * rr('p'));
            const y = lerp(-100, H * 0.7, rr('y')) + 25 * Math.cos(t * 0.4 + 6 * rr('q'));
            const rad = 160 + 220 * rr('r');
            const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, 'rgba(120,150,110,0.55)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          }
        }}
      />
      <Canvas deps={[t]} draw={ctx => dust(ctx, t, 26, 'grass', [0, 0, W, H * 0.8], 'rgba(255,255,230,1)', 0.5)} />
    </AbsoluteFill>
  );
};

// ── 一个个夏天闪过：两只站在画面同一个位置（致敬原 PV 季节轮转） ──
/** 每格停留多久：从一拍一换加速到 8fps 一换 */
/** 闪切每一格的起点：一拍一换 ×3 → 半拍一换 ×4 → 之后 8fps 一换 */
export function flickerHolds(from: number, to: number) {
  const holds: number[] = [];
  let acc = from;
  for (const b of [1, 1, 1, 0.5, 0.5, 0.5, 0.5]) {
    holds.push(acc);
    acc += 0.6502 * b;
  }
  while (acc < to) {
    holds.push(acc);
    acc += 0.125;
  }
  return holds;
}

export function flickerIndex(t: number, shot: Shot, n: number) {
  const holds = flickerHolds(shot.from, shot.to);
  let k = 0;
  for (let i = 0; i < holds.length; i++) if (t >= holds[i]) k = i;
  return {idx: k % n, k, t0: holds[k]};
}

export const S09: React.FC<P> = ({t, shot, m}) => {
  const frames = m.s09.frames;
  const {idx, k, t0} = flickerIndex(t, shot, frames.length);
  const flash = 1 - clamp((t - t0) / 0.12);
  const jx = (random(`fj${k}`) - 0.5) * 10, jy = (random(`fk${k}`) - 0.5) * 8;
  const late = ss(41.2, 43.0, t);
  return (
    <AbsoluteFill style={{transform: `translate(${jx}px, ${jy}px) scale(${1.02 + 0.02 * random(`fs${k}`)})`}}>
      <Plate src={frames[idx]} filter={`saturate(${1.08 - 0.2 * late}) contrast(1.03) brightness(${1 + 0.05 * flash})`} bloom={0.18} />
      <AbsoluteFill style={{background: 'white', opacity: 0.12 * flash, mixBlendMode: 'screen'}} />
      {/* 越到后面越像过曝的旧胶片 */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 90% 70% at 50% 50%, rgba(255,240,220,0) 40%, rgba(255,220,180,0.6) 100%)', mixBlendMode: 'screen', opacity: 0.6 * late}} />
    </AbsoluteFill>
  );
};

// ── 腐烂：被藤蔓覆盖 ──
export const S11a: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  return (
    <AbsoluteFill style={kbTransform({s: [1.0, 1.1], ox: 0.35, oy: 0.52}, p)}>
      <Plate src={m.s11a.bg} filter={`saturate(${lerp(0.85, 0.45, p)}) contrast(1.08) brightness(${lerp(0.98, 0.85, p)}) sepia(${0.15 * p})`} bloom={0.12} />
    </AbsoluteFill>
  );
};

// ── 融化滴落 ──
export const S11b: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const melt = easeInOut(p) ** 1.3;
  const scale = 8 + 210 * melt;
  const EXT = 320;
  return (
    <AbsoluteFill style={kbTransform({s: [1.04, 1.0], oy: 0.4}, p)}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id="melt" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.0065 0.00035" numOctaves={1} seed={7} result="n" />
          {/* R 固定 0.5（不左右偏），G 只取 0..0.5（只往下拖） */}
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 -0.62 0 0 0.62  0 0 0 0 0  0 0 0 0 1" result="d" />
          <feDisplacementMap in="SourceGraphic" in2="d" scale={scale} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div style={{position: 'absolute', left: 0, top: -EXT, width: W, height: H + EXT, filter: 'url(#melt)'}}>
        <Img src={img(m.s11b.bg)} style={{position: 'absolute', left: 0, top: 0, width: W, height: H + EXT, objectFit: 'cover', objectPosition: '50% 100%', filter: `saturate(${lerp(1, 0.7, p)}) contrast(1.05)`}} />
      </div>
      <Img src={img(m.s11b.bg)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(22px) brightness(1.15)', mixBlendMode: 'screen', opacity: 0.2}} />
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(10,4,20,${0.5 * melt}) 100%)`}} />
    </AbsoluteFill>
  );
};

// ── 夕阳小路：身边的影子散去，只剩一只走远 ──
export const S12: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  const [ghost, a] = m.s12.layers;
  const ga = 0.62 * (1 - ss(shot.from + 0.6, shot.from + 3.4, t));
  const walk = easeInOut(p);
  const bob = Math.abs(Math.sin(t * Math.PI * 1.55)) * 5;
  const sc = lerp(1, 0.9, walk);
  const flare = 0.75 + 0.25 * Math.sin(t * 1.7) * Math.sin(t * 0.9 + 2);
  return (
    <AbsoluteFill style={kbTransform({s: [1.0, 1.08], oy: 0.38}, p)}>
      <Plate src={m.s12.bg} filter="saturate(1.02) contrast(1.04)" bloom={0.28} />
      <Canvas deps={[t]} draw={ctx => glints(ctx, t, 40, 'road', [140, 1380, 940, 1900], 0.9)} />
      {ga > 0.005 ? (
        <Layer
          l={ghost}
          t={t}
          phase={1.3}
          extra={`translate(${-40 * (1 - ga / 0.62)}px, ${-40 * (1 - ga / 0.62) - bob * 0.8}px) scale(${lerp(1, 0.94, walk)})`}
          filter={`brightness(1.9) saturate(0.25) blur(${(1 + 5 * (1 - ga / 0.62)).toFixed(1)}px)`}
          style={{opacity: ga, mixBlendMode: 'screen'}}
        />
      ) : null}
      <Layer l={a} t={t} breathe={0.004} extra={`translate(0px, ${-bob - 70 * walk}px) scale(${sc})`} />
      {/* 太阳 */}
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 22%, rgba(255,230,170,0.95) 0%, rgba(255,190,110,0.45) 9%, rgba(255,160,80,0) 30%)', mixBlendMode: 'screen', opacity: 0.55 * flare}} />
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(255,200,120,0) 0%, rgba(255,210,140,0.35) 50%, rgba(255,200,120,0) 100%)', height: 6, top: H * 0.22 - 3, mixBlendMode: 'screen', opacity: 0.6 * flare}} />
    </AbsoluteFill>
  );
};

// ── 镜面湖上的空椅子 ──
export const S13: React.FC<P> = ({t, shot, m}) => {
  const p = p01(t, shot);
  return (
    <AbsoluteFill style={kbTransform({s: [1.0, 1.08], ox: 0.72, oy: 0.68}, p)}>
      <Plate src={m.s13.bg} filter="saturate(0.86) brightness(0.99) contrast(1.02)" bloom={0.2} />
      <Canvas deps={[t]} draw={ctx => glints(ctx, t, 14, 'lake', [0, 1150, W, 1800], 0.45)} />
    </AbsoluteFill>
  );
};

// ── 草丛里白色的幽灵 ──
export const S14: React.FC<P> = ({t, shot, m}) => {
  const p = prog(t, shot.from, shot.from + 4.2);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  return (
    <AbsoluteFill style={kbTransform({s: [1.0, 1.1], ox: 0.42, oy: 0.25}, p)}>
      <Plate src={m.s14.bg} filter="saturate(0.92) contrast(1.04)" bloom={0.22} />
      {/* 幽灵的白微微发亮 */}
      <Img
        src={img(m.s14.bg)}
        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) brightness(1.6) contrast(4) blur(6px)', mixBlendMode: 'screen', opacity: 0.12 + 0.12 * pulse}}
      />
      <Canvas deps={[t]} draw={ctx => fireflies(ctx, t, 8, 'ghost', [120, 300, 980, 1500], 0.55)} />
    </AbsoluteFill>
  );
};

export const SHOT_COMPONENTS: Record<string, React.FC<P>> = {
  s01: S01, s01b: S01b, s02: S02, s03: S03, s04: S04, s06: S06, s08: S08, s09: S09, s11a: S11a, s11b: S11b, s12: S12, s13: S13, s14: S14,
};

