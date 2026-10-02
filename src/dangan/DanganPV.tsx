import React from 'react';
import {AbsoluteFill, Audio, getStaticFiles, staticFile, useCurrentFrame} from 'remotion';
import {S1Split, S2Mono, S2Rules, S3Academy, S3Roster, S3Window, S4Body, S4Descent} from './Act1';
import {S5Court, S6Debate, S7Bullet, S7Revolver, S7Shot, S8Wrong, S9Break} from './Act2';
import {S10GameOver, S10Vote, S11Title} from './Act3';
import {b, C, clamp, expoIn, FLASH, FPS, H, prog, rng, shake, W} from './core';
import {loadFonts} from './fonts';

loadFonts();

// 配乐由 scripts/dangan-audio.py 生成（素材许可原因不入库）；缺失时静音渲染
const SCORE = 'dangan/score.m4a';
const hasScore = () => getStaticFiles().some(f => f.name === SCORE);

type Scene = [number, number, React.FC<{t: number}>];
// [起始拍, 结束拍, 组件]：每个镜头只在自己的区间内渲染，剪辑点全部落在拍点
const SCENES: Scene[] = [
  [0, 4, S1Split],
  [4, 6, S2Mono],
  [6, 8, S2Rules],
  [8, 9, S3Academy],
  [9, 10, S3Window],
  [10, 12, S3Roster],
  [12, 14, S4Body],
  [14, 16, S4Descent],
  [16, 20, S5Court],
  [20, 24, S6Debate],
  [24, 25.5, S7Revolver],
  [25.5, 27, S7Bullet],
  [27, 28, S7Shot],
  [28, 32, S8Wrong],
  [35, 38, S10Vote], // 在 S9 碎屏下方提前出现
  [32, 36.3, S9Break],
  [38, 40, S10GameOver],
  [40, 48, S11Title],
];

/** 程序生成的胶片颗粒贴图（只生成一次） */
let GRAIN: string | null = null;
function grainUrl() {
  if (GRAIN || typeof document === 'undefined') return GRAIN;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  const r = rng(2024);
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.floor(r() * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  GRAIN = c.toDataURL('image/png');
  return GRAIN;
}

const Overlays: React.FC<{t: number; frame: number}> = ({t, frame}) => {
  const r = rng(Math.floor(frame / 2) * 13 + 7);
  const g = grainUrl();
  const flash = FLASH.find(([t0, n]) => t >= t0 && t < t0 + n / FPS);
  return (
    <>
      {g ? (
        <AbsoluteFill
          style={{
            backgroundImage: `url(${g})`,
            backgroundPosition: `${Math.floor(r() * 256)}px ${Math.floor(r() * 256)}px`,
            mixBlendMode: 'overlay',
            opacity: 0.12,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0px, rgba(0,0,0,0.10) 1px, transparent 1px, transparent 4px)',
          opacity: 0.55,
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.42) 100%)'}} />
      {flash ? (
        <AbsoluteFill
          style={
            flash[2] === 'invert'
              ? {backdropFilter: 'invert(1)', WebkitBackdropFilter: 'invert(1)'}
              : {background: flash[2] === 'white' ? '#fff' : flash[2] === 'pink' ? C.pink : '#000', opacity: 0.92}
          }
        />
      ) : null}
    </>
  );
};

export const DanganPV: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const [sx, sy, sr] = shake(t);
  // 结尾：显像管关机（纵向压扁成一条亮线 → 收缩成点）
  const off0 = b(47.1);
  const squash = expoIn(prog(t, off0, off0 + 0.11));
  const shrink = expoIn(prog(t, off0 + 0.11, off0 + 0.24));
  const dot = 1 - prog(t, off0 + 0.24, off0 + 0.36);
  const crt = t >= off0;
  const active = SCENES.filter(([a, z]) => t >= b(a) - 1e-6 && t < b(z) - 1e-6);
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {hasScore() ? <Audio src={staticFile(SCORE)} /> : null}
      <AbsoluteFill
        style={{
          transform: crt ? `scale(${Math.max(0.002, 1 - shrink)}, ${Math.max(0.003, 1 - squash)})` : undefined,
          filter: crt ? `brightness(${1 + squash * 4})` : undefined,
          opacity: crt ? clamp(dot) : 1,
        }}
      >
        <AbsoluteFill style={{transform: `translate(${sx}px, ${sy}px) rotate(${sr}deg) scale(${1 + Math.min(0.06, (Math.abs(sx) + Math.abs(sy)) / W)})`}}>
          {active.map(([a, , Comp]) => (
            <AbsoluteFill key={a}>
              <Comp t={t} />
            </AbsoluteFill>
          ))}
        </AbsoluteFill>
        <Overlays t={t} frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export {H, W};
