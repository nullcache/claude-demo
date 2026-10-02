import React from 'react';
import {P, TAU} from '../lib/math';
import {circleD, ribbonD} from '../lib/shapes';
import {C, lerp} from './core';

// ═════════════ 黑白熊（按官方设定比例重绘的致敬矢量） ═════════════
// 局部坐标：头部中心 (0,0)，R = 头部半径。观者左 = 白，观者右 = 黑，接缝为正中竖直线。
// 要点：圆头 + 大圆耳；口鼻部白色横跨两侧；白侧小黑眼；黑侧闪电形红眼；
//      从口鼻中央一路咧到右脸颊的方块白牙笑；梨形身体 + 白色肚皮 + ⊗ 肚脐。
const R = 260;
const f = (n: number) => Math.round(n * 10) / 10;
const polyD = (pts: P[]) => 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
const lineD = (pts: P[]) => 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L');
const U = (x: number, y: number): P => [x * R, y * R];

/** 头部轮廓：近圆，脸颊略鼓、头顶略平 */
const HEAD_PTS: P[] = Array.from({length: 120}, (_, i) => {
  const a = (i / 120) * TAU;
  const c = Math.cos(a), s = Math.sin(a);
  const k = 2.08;
  const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / k), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / k);
  const cheek = 1 + 0.05 * Math.max(0, s);
  return [sx * R * 1.06 * cheek, sy * R * (s < 0 ? 0.95 : 1.0)];
});
/** 梨形身体（大部分被头挡住，只在全身构图里露出肚皮） */
const BODY_PTS: P[] = Array.from({length: 96}, (_, i) => {
  const a = (i / 96) * TAU;
  const c = Math.cos(a), s = Math.sin(a);
  const w = 0.88 + 0.1 * s;
  return U(Math.sign(c) * Math.pow(Math.abs(c), 0.9) * w, 1.42 + s * 0.74);
});
export const EARS: Array<[number, number, number]> = [
  [-0.7 * R, -0.8 * R, 0.31 * R],
  [0.7 * R, -0.8 * R, 0.31 * R],
];
const half = (pts: P[]): P[] => pts.map(([x, y]) => [Math.min(x, 0), y] as P);
export const HEAD_D = polyD(HEAD_PTS);
export const BODY_D = polyD(BODY_PTS);

/** 红眼：上缘弧线上扬，下缘三齿锯齿，外端上挑（头部局部坐标） */
const RED_EYE_RAW: P[] = [
  U(0.32, -0.2), U(0.42, -0.31), U(0.55, -0.41), U(0.7, -0.49), U(0.9, -0.56),
  U(0.83, -0.36), U(0.75, -0.41), U(0.7, -0.22), U(0.61, -0.3), U(0.55, -0.12), U(0.47, -0.21), U(0.41, -0.11),
];
const eyeC: P = [0.6 * R, -0.33 * R];
const eyeFit = (p: P): P => [eyeC[0] + (p[0] - eyeC[0]) * 0.88 - 0.035 * R, eyeC[1] + (p[1] - eyeC[1]) * 0.88 + 0.01 * R];
export const RED_EYE: P[] = RED_EYE_RAW.map(eyeFit);
const RED_EYE_IN_RAW: P[] = [U(0.42, -0.22), U(0.52, -0.32), U(0.66, -0.41), U(0.8, -0.47), U(0.74, -0.39), U(0.68, -0.32), U(0.6, -0.33), U(0.55, -0.24), U(0.48, -0.26)];
const RED_EYE_IN = RED_EYE_IN_RAW.map(eyeFit);

// 笑：上唇线与下颌线（从口鼻中央咧到右脸颊）
const GRIN_TOP: P[] = [U(0.0, 0.27), U(0.18, 0.28), U(0.36, 0.24), U(0.54, 0.14), U(0.7, 0.01), U(0.82, -0.12)];
const GRIN_BOT: P[] = [U(0.0, 0.47), U(0.18, 0.47), U(0.38, 0.41), U(0.56, 0.29), U(0.7, 0.14), U(0.82, -0.12)];
const at = (pts: P[], u: number): P => {
  const x = u * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(x));
  const k = x - i;
  return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
};
const GRIN_D = polyD([...Array.from({length: 24}, (_, i) => at(GRIN_TOP, i / 23)), ...Array.from({length: 24}, (_, i) => at(GRIN_BOT, 1 - i / 23))]);
// 牙缝：前两颗大门牙，其余越往脸颊越窄
const TOOTH_U = [0.0, 0.11, 0.22, 0.32, 0.42, 0.51, 0.6, 0.68, 0.76, 0.83, 0.9, 1];

export const MonoDefs: React.FC = () => (
  <defs>
    <radialGradient id="mkW" cx="0.62" cy="0.3" r="0.85">
      <stop offset="0" stopColor="#FFFFFF" />
      <stop offset="0.6" stopColor="#F3F2F5" />
      <stop offset="1" stopColor="#BDBBC4" />
    </radialGradient>
    <radialGradient id="mkK" cx="0.25" cy="0.25" r="0.9">
      <stop offset="0" stopColor="#4A4852" />
      <stop offset="0.45" stopColor="#1E1D23" />
      <stop offset="1" stopColor="#09090C" />
    </radialGradient>
    <radialGradient id="mkMuz" cx="0.45" cy="0.3" r="0.8">
      <stop offset="0" stopColor="#FFFFFF" />
      <stop offset="0.7" stopColor="#F4F3F6" />
      <stop offset="1" stopColor="#CFCDD6" />
    </radialGradient>
    <linearGradient id="mkTooth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#FFFFFF" />
      <stop offset="1" stopColor="#D8D6DE" />
    </linearGradient>
    <filter id="mkGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
  </defs>
);

interface MonoProps {
  x: number;
  y: number;
  s: number;
  rot?: number;
  /** 0..1：五官出现 */
  face?: number;
  /** 红眼辉光 */
  glow?: number;
  /** 笑：白侧张嘴幅度 */
  grin?: number;
  sq?: number; // 挤压
  body?: boolean;
  outline?: boolean;
  id?: string;
  blush?: boolean;
}

const INK = '#111015';
const ARM_L = ribbonD([U(-0.8, 0.95), U(-0.72, 1.2), U(-0.46, 1.36)], [0.34 * R, 0.31 * R, 0.29 * R]) + circleD(-0.38 * R, 1.37 * R, 0.17 * R);
const ARM_R = ribbonD([U(0.8, 0.95), U(0.74, 1.2), U(0.5, 1.36)], [0.34 * R, 0.31 * R, 0.29 * R]) + circleD(0.42 * R, 1.37 * R, 0.17 * R);
const SW = 0.032 * R;

export const Monokuma: React.FC<MonoProps> = ({x, y, s, rot = 0, face = 1, glow = 0, grin = 0.4, sq = 0, body = false, outline = true, blush = true}) => {
  const stroke = outline ? INK : 'none';
  // 白侧张开的嘴（黑色月牙），随笑声张合
  const open = 0.04 + 0.07 * grin;
  const mouthL = polyD([
    ...Array.from({length: 12}, (_, i) => {
      const u = i / 11;
      return U(-0.24 + 0.24 * u, 0.27 + 0.015 * Math.sin(Math.PI * u));
    }),
    ...Array.from({length: 12}, (_, i) => {
      const u = 1 - i / 11;
      return U(-0.24 + 0.24 * u, 0.28 + (0.1 + open) * Math.pow(Math.sin(Math.PI * u), 0.8) * (0.45 + 0.55 * u));
    }),
  ]);
  return (
    <g transform={`translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s * (1 + sq)} ${s * (1 - sq)})`}>
      {body ? (
        <g>
          <path d={BODY_D} fill="url(#mkK)" stroke={stroke} strokeWidth={SW * 2} strokeLinejoin="round" />
          <path d={polyD(half(BODY_PTS))} fill="url(#mkW)" />
          {/* 脚 */}
          {[-1, 1].map(sx => (
            <ellipse key={sx} cx={sx * 0.42 * R} cy={2.12 * R} rx={0.26 * R} ry={0.15 * R} fill={sx < 0 ? 'url(#mkW)' : 'url(#mkK)'} stroke={stroke} strokeWidth={SW} />
          ))}
          {/* 肚皮 */}
          <ellipse cx={0.04 * R} cy={1.5 * R} rx={0.6 * R} ry={0.56 * R} fill="url(#mkMuz)" stroke="#9C99A6" strokeWidth={SW * 0.5} />
          <g transform={`translate(${0.3 * R} ${1.7 * R})`} stroke="#3A3842" strokeWidth={0.022 * R} fill="none" strokeLinecap="round">
            <path d={`M${-0.1 * R} ${-0.02 * R}A${0.1 * R} ${0.1 * R} 0 1 0 ${0.06 * R} ${-0.08 * R}`} />
            <path d={`M${-0.045 * R} ${-0.045 * R}L${0.045 * R} ${0.045 * R}M${0.045 * R} ${-0.045 * R}L${-0.045 * R} ${0.045 * R}`} />
          </g>
          {/* 手臂 */}
          {[
            [ARM_L, 'url(#mkW)'],
            [ARM_R, 'url(#mkK)'],
          ].map(([d, fill], i) => (
            <g key={i}>
              {outline ? <path d={d} fill={INK} stroke={INK} strokeWidth={SW * 2} strokeLinejoin="round" /> : null}
              <path d={d} fill={fill} />
            </g>
          ))}
        </g>
      ) : null}
      {/* 耳朵 */}
      <path d={circleD(EARS[0][0], EARS[0][1], EARS[0][2])} fill="url(#mkW)" stroke={stroke} strokeWidth={SW * 2} />
      <path d={circleD(EARS[1][0], EARS[1][1], EARS[1][2])} fill="url(#mkK)" stroke={stroke} strokeWidth={SW * 2} />
      <path d={circleD(EARS[0][0] + 0.03 * R, EARS[0][1] + 0.04 * R, 0.17 * R)} fill="#E2E0E7" />
      <path d={circleD(EARS[1][0] - 0.03 * R, EARS[1][1] + 0.04 * R, 0.17 * R)} fill="#26252C" />
      {/* 头 */}
      <path d={HEAD_D} fill="url(#mkK)" stroke={stroke} strokeWidth={SW * 2} strokeLinejoin="round" />
      <path d={polyD(half(HEAD_PTS))} fill="url(#mkW)" />
      {face > 0 ? (
        <g opacity={Math.min(1, face * 2)}>
          {/* 白侧腮红 */}
          {blush ? <ellipse cx={-0.6 * R} cy={0.12 * R} rx={0.14 * R} ry={0.08 * R} fill="#F7B6C6" opacity={0.55} /> : null}
          {/* 口鼻部：两侧皆白 */}
          <ellipse cx={0} cy={0.22 * R} rx={0.38 * R} ry={0.36 * R} fill="url(#mkMuz)" stroke="#8F8C99" strokeWidth={0.02 * R} />
          {/* 白侧：小黑眼 + 高光 */}
          <ellipse cx={-0.38 * R} cy={-0.25 * R} rx={0.085 * R} ry={0.105 * R} fill={INK} />
          <circle cx={-0.405 * R} cy={-0.29 * R} r={0.03 * R} fill="#fff" />
          {/* 白侧张开的嘴 */}
          <path d={mouthL} fill={INK} />
          {/* 黑侧：方块白牙咧嘴笑 */}
          <path d={GRIN_D} fill="url(#mkTooth)" stroke={INK} strokeWidth={0.03 * R} strokeLinejoin="round" />
          <g stroke={INK} strokeWidth={0.022 * R} strokeLinecap="round">
            {TOOTH_U.slice(1, -1).map((u, i) => {
              const a = at(GRIN_TOP, u), b_ = at(GRIN_BOT, u);
              return <path key={i} d={lineD([a, b_])} />;
            })}
          </g>
          {/* 人中 + 上唇 */}
          <path d={lineD([U(0, 0.06), U(0, 0.27)])} stroke={INK} strokeWidth={0.026 * R} strokeLinecap="round" />
          <path d={lineD([U(-0.3, 0.25), U(-0.15, 0.285), U(0, 0.27)])} fill="none" stroke={INK} strokeWidth={0.026 * R} strokeLinecap="round" />
          {/* 鼻子 */}
          <ellipse cx={0} cy={0.0} rx={0.12 * R} ry={0.08 * R} fill={INK} />
          <ellipse cx={-0.04 * R} cy={-0.025 * R} rx={0.04 * R} ry={0.02 * R} fill="#6E6B78" />
          {/* 红眼 */}
          {glow > 0 ? <path d={polyD(RED_EYE)} fill={C.red} opacity={0.6 * Math.min(1.5, glow)} filter="url(#mkGlow)" /> : null}
          <path d={polyD(RED_EYE)} fill="#C8102A" stroke="#4A0010" strokeWidth={0.024 * R} strokeLinejoin="miter" />
          <path d={polyD(RED_EYE_IN)} fill="#FF4D63" opacity={0.85} />
          <ellipse cx={0.7 * R} cy={-0.41 * R} rx={0.025 * R} ry={0.015 * R} fill="#FFE3E8" />
        </g>
      ) : null}
    </g>
  );
};

/** 用于遮罩/剪影的整体轮廓（头 + 耳 + 可选身体），局部坐标 */
// 注意：<clipPath> 内不允许 <g>，所以变换直接挂在每个 path 上
export const MonoSilhouette: React.FC<{body?: boolean; grow?: number; transform?: string}> = ({body = true, grow = 0, transform}) => (
  <>
    {body ? <path d={BODY_D} transform={transform} stroke={grow ? '#000' : undefined} strokeWidth={grow} /> : null}
    <path d={HEAD_D} transform={transform} stroke={grow ? '#000' : undefined} strokeWidth={grow} />
    {EARS.map(([ex, ey, er], i) => (
      <path key={i} d={circleD(ex, ey, er + grow / 2)} transform={transform} />
    ))}
  </>
);
export const RED_EYE_CENTER: P = RED_EYE.reduce((acc, p) => [acc[0] + p[0] / RED_EYE.length, acc[1] + p[1] / RED_EYE.length] as P, [0, 0] as P);
