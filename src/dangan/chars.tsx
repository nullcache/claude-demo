import React from 'react';
import {P, TAU} from '../lib/math';
import {circleD, ribbonD, smoothD} from '../lib/shapes';
import {C, lerp} from './core';
import {poly} from './ui';

// ═════════════ 黑白熊（致敬造型，原创矢量绘制） ═════════════
// 局部坐标：头部中心 (0,0)，头宽约 600。观者左侧 = 白（希望），右侧 = 黑（绝望）。

/** 头部轮廓（超椭圆，脸颊略宽） */
export function headPts(): P[] {
  const pts: P[] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const k = 2.35;
    const rx = 300 * (1 + 0.04 * Math.max(0, s)), ry = 252;
    pts.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / k) * rx, Math.sign(s) * Math.pow(Math.abs(s), 2 / k) * ry + 6 * s * s]);
  }
  return pts;
}
export const HEAD_D = smoothD(headPts());
export const EARS: Array<[number, number, number]> = [
  [-232, -208, 96],
  [232, -208, 96],
];
/** 红眼：上缘平滑、下缘锯齿 */
export const RED_EYE: P[] = [
  [58, -46], [96, -76], [150, -96], [214, -94], [206, -66], [184, -78], [170, -44], [148, -66], [124, -26], [104, -54], [84, -30],
];

interface MonoProps {
  x: number;
  y: number;
  s: number;
  rot?: number;
  /** 0..1：五官出现 */
  face?: number;
  /** 红眼辉光 */
  glow?: number;
  /** 笑：嘴张开程度 */
  grin?: number;
  sq?: number; // 挤压
  outline?: boolean;
  id?: string;
}
export const Monokuma: React.FC<MonoProps> = ({x, y, s, rot = 0, face = 1, glow = 0, grin = 0.4, sq = 0, outline = true, id = 'mk'}) => {
  const WHITE = '#F8F7F5', BLACK = '#111014';
  const clipL = `${id}-L`;
  const g = grin;
  // 嘴：白侧小弧，黑侧咧开的锯齿笑
  const mouthTop: P[] = [[0, 98], [70, 86], [140, 58], [200, 18]];
  const mouthBot: P[] = [[200, 18], [176, 92 + 40 * g], [110, 140 + 50 * g], [40, 136 + 30 * g], [0, 112 + 12 * g]];
  const mouth = poly([...mouthTop, ...mouthBot]);
  const teeth: P[][] = [];
  for (let i = 0; i < 6; i++) {
    const u0 = i / 6, u1 = (i + 1) / 6;
    const A = lerpP(mouthTop, u0), B = lerpP(mouthTop, u1), M = lerpP(mouthTop, (u0 + u1) / 2);
    teeth.push([A, B, [M[0] - 4, M[1] + 24 + 8 * g]]);
  }
  for (let i = 0; i < 5; i++) {
    const u0 = 0.12 + (i / 5) * 0.8, u1 = 0.12 + ((i + 1) / 5) * 0.8;
    const A = lerpP(mouthBot, u0), B = lerpP(mouthBot, u1), M = lerpP(mouthBot, (u0 + u1) / 2);
    teeth.push([A, B, [M[0] + 4, M[1] - 22 - 6 * g]]);
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s * (1 + sq)} ${s * (1 - sq)})`}>
      <defs>
        <clipPath id={clipL}>
          <rect x={-400} y={-400} width={400} height={800} />
        </clipPath>
      </defs>
      {outline ? (
        <g fill={C.ink} transform="scale(1.035)">
          <path d={HEAD_D} />
          {EARS.map(([ex, ey, er], i) => (
            <path key={i} d={circleD(ex, ey, er + 4)} />
          ))}
        </g>
      ) : null}
      {/* 耳朵 */}
      <path d={circleD(EARS[0][0], EARS[0][1], EARS[0][2])} fill={WHITE} />
      <path d={circleD(EARS[0][0] + 10, EARS[0][1] + 10, 52)} fill="#D9D5DD" />
      <path d={circleD(EARS[1][0], EARS[1][1], EARS[1][2])} fill={BLACK} />
      <path d={circleD(EARS[1][0] - 10, EARS[1][1] + 10, 52)} fill="#2B2830" />
      {/* 头：黑底 + 白色左半 */}
      <path d={HEAD_D} fill={BLACK} />
      <path d={HEAD_D} fill={WHITE} clipPath={`url(#${clipL})`} />
      {face > 0 ? (
        <g opacity={Math.min(1, face * 2)}>
          {/* 口鼻部 */}
          <ellipse cx={0} cy={72} rx={128} ry={94} fill={WHITE} />
          <ellipse cx={0} cy={72} rx={128} ry={94} fill="#E9E6EC" clipPath={`url(#${clipL})`} opacity={0.6} />
          {/* 白侧：小黑眼 */}
          <ellipse cx={-126} cy={-42} rx={24} ry={31} fill={BLACK} />
          <circle cx={-118} cy={-52} r={7} fill={WHITE} />
          {/* 黑侧：咧嘴 */}
          <path d={mouth} fill="#B0002A" />
          {teeth.map((tt, i) => (
            <path key={i} d={poly(tt)} fill={WHITE} />
          ))}
          <path d={mouth} fill="none" stroke={BLACK} strokeWidth={6} strokeLinejoin="round" />
          {/* 白侧嘴 */}
          <path d="M0 96Q-30 128 -70 108" fill="none" stroke={BLACK} strokeWidth={7} strokeLinecap="round" />
          <path d="M0 60L0 98" stroke={BLACK} strokeWidth={7} />
          {/* 鼻子 */}
          <ellipse cx={0} cy={44} rx={38} ry={26} fill={BLACK} />
          <ellipse cx={-12} cy={36} rx={11} ry={6} fill="#4A4752" />
          {/* 红眼 */}
          {glow > 0 ? <path d={poly(RED_EYE)} fill={C.red} opacity={0.55 * glow} filter="url(#mkGlow)" transform="scale(1.04)" /> : null}
          <path d={poly(RED_EYE)} fill={C.red} />
          <path d={poly(RED_EYE.slice(0, 5))} fill="#FF6B7D" opacity={0.6} transform="translate(0 6) scale(0.98)" />
        </g>
      ) : null}
    </g>
  );
};
function lerpP(pts: P[], u: number): P {
  const x = u * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(x));
  const k = x - i;
  return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
}
export const MonoDefs: React.FC = () => (
  <defs>
    <filter id="mkGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
  </defs>
);

// ═════════════ 学生剪影（半身） ═════════════
// 局部坐标：头心 (0,-150)，肩线 y≈130，底边 y=420
export type CastId = 'lucky' | 'idol' | 'detective' | 'gambler' | 'programmer' | 'biker' | 'heir' | 'despair';

const torso = (wide = 1): string => {
  const w = 250 * wide;
  return smoothD([
    [-56, -40], [56, -40], [62, 40], [w * 0.62, 78], [w * 0.92, 130], [w, 260], [w * 1.04, 440], [-w * 1.04, 440], [-w, 260], [-w * 0.92, 130], [-w * 0.62, 78], [-62, 40],
  ]);
};
const head = (rx = 104, ry = 124, cy = -150) => {
  const pts: P[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    // 下巴略尖
    const k = Math.sin(a) > 0 ? 1 - 0.18 * Math.pow(Math.sin(a), 6) : 1;
    pts.push([Math.cos(a) * rx * k, cy + Math.sin(a) * ry]);
  }
  return smoothD(pts);
};
const strand = (pts: P[], w0: number, w1 = 0.5) => ribbonD(pts, pts.map((_, i) => lerp(w0, w1, i / (pts.length - 1))));
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
  const pts: P[] = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return smoothD(pts);
};

export function castPath(id: CastId): string {
  switch (id) {
    case 'lucky': // 呆毛 + 连帽衫
      return (
        torso(1) +
        smoothD([[-150, 70], [-120, -10], [-60, 30], [60, 30], [120, -10], [150, 70], [80, 110], [-80, 110]]) +
        head() +
        ell(0, -190, 128, 110) +
        strand([[-120, -150], [-150, -95], [-158, -60]], 40) +
        strand([[120, -150], [148, -100], [150, -62]], 40) +
        strand([[8, -290], [24, -360], [70, -392], [96, -368]], 26, 4)
      );
    case 'idol': // 及肩长直发 + 发卡
      return torso(0.95) + head(100, 120) + ell(0, -186, 130, 112) + smoothD([[-128, -200], [-150, -60], [-160, 80], [-120, 110], [-90, -20], [90, -20], [120, 110], [160, 80], [150, -60], [128, -200]]) + ell(-96, -238, 26, 14, -0.5);
    case 'detective': {
      // 长发 + 侧编辫 + 蝴蝶结
      let d = torso(0.95) + head(100, 120) + ell(0, -188, 128, 110) + smoothD([[-126, -190], [-148, -40], [-150, 140], [-110, 160], [-90, -40], [90, -40], [110, 160], [150, 140], [148, -40], [126, -190]]);
      for (let i = 0; i < 5; i++) d += ell(-120 - i * 6, -70 + i * 44, 30 - i * 2, 26, 0.2);
      d += poly([[-150, 150], [-200, 120], [-196, 186]]) + poly([[-126, 156], [-80, 124], [-86, 190]]) + circleD(-138, 156, 18);
      return d;
    }
    case 'gambler': {
      // 双螺旋卷 + 头饰
      let d = torso(0.92) + head(98, 118) + ell(0, -192, 126, 106);
      for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) d += ell(sx * (140 + i * 4), -110 + i * 62, 46 - i * 5, 38, sx * 0.35);
      d += smoothD([[-110, -270], [-60, -320], [0, -330], [60, -320], [110, -270], [70, -250], [0, -258], [-70, -250]]);
      return d;
    }
    case 'programmer': // 短波波头 + 小呆毛
      return torso(0.82) + head(94, 112, -140) + smoothD([[-120, -170], [-122, -60], [-96, -40], [-80, -110], [80, -110], [96, -40], [122, -60], [120, -170], [80, -248], [0, -268], [-80, -248]]) + strand([[0, -262], [12, -300], [-8, -322]], 16, 3);
    case 'biker': // 飞机头 + 宽肩
      return torso(1.18) + head(108, 126) + smoothD([[-118, -180], [-110, -270], [-60, -360], [40, -400], [120, -390], [140, -330], [110, -250], [118, -180], [60, -220], [-60, -220]]);
    case 'heir': // 整齐侧分 + 眼镜（在 castDetail 中勾边）
      return torso(1.02) + head(100, 122) + smoothD([[-118, -160], [-122, -230], [-60, -284], [30, -290], [110, -250], [124, -170], [90, -214], [-20, -236], [-90, -200]]);
    case 'despair': {
      // 高双马尾 + 熊发饰
      let d = torso(0.94) + head(100, 120) + ell(0, -190, 128, 110);
      for (const sx of [-1, 1]) {
        d += strand([[sx * 110, -246], [sx * 210, -230], [sx * 260, -120], [sx * 250, 60], [sx * 214, 250], [sx * 230, 360]], 92, 18);
        d += circleD(sx * 104, -262, 38) + circleD(sx * 78, -298, 15) + circleD(sx * 130, -298, 15);
      }
      return d;
    }
  }
}

/** 剪影 + 轮廓光 */
export const Cast: React.FC<{id: CastId; x: number; y: number; s: number; fill?: string; rim?: string; rimDx?: number; flip?: boolean; opacity?: number}> = ({
  id,
  x,
  y,
  s,
  fill = C.ink,
  rim = C.pink,
  rimDx = -9,
  flip = false,
  opacity = 1,
}) => {
  const d = castPath(id);
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} opacity={opacity}>
      {rim ? <path d={d} fill={rim} transform={`translate(${rimDx} ${-Math.abs(rimDx) * 0.6})`} /> : null}
      <path d={d} fill={fill} />
      {id === 'heir' ? (
        <g fill="none" stroke={rim || C.white} strokeWidth={6} opacity={0.9}>
          <rect x={-86} y={-170} width={70} height={44} rx={8} />
          <rect x={16} y={-170} width={70} height={44} rx={8} />
          <path d="M-16 -150L16 -150" />
        </g>
      ) : null}
    </g>
  );
};

// ═════════════ 像素黑白熊 / 像素犯人（GAME OVER 画面） ═════════════
const MONO_PX = [
  '..WW......KK....',
  '.WWWW....KKKK...',
  '.WWWWWWKKKKKK...',
  '..WWWWWKKKKK....',
  '.WWWWWWKKKKKK...',
  '.WBWWWWKKRRRK...',
  '.WWWWWWKKKKKK...',
  '.WWWWBBBBKKKK...',
  '..WWWWWWWWKK....',
  '...WWWWKKKK.....',
  '..WWWWWKKKKK....',
  '.WWWWWWKKKKKK...',
  '.WWWWWWKKKKKK...',
  '..WWWWWKKKKK....',
  '..WW.......KK...',
  '................',
];
const PRISONER_PX = [
  '....KKKK........',
  '...KKKKKK.......',
  '...KSSSSK.......',
  '...SSKSKS.......',
  '...SSSSSS.......',
  '....SSSS........',
  '..GGGGGGGG......',
  '.GGGGGGGGGG.....',
  '.SGGGGGGGGS.....',
  '.SGGGGGGGGS.....',
  '..GGGGGGGG......',
  '..NNNNNNNN......',
  '..NNN..NNN......',
  '..NNN..NNN......',
  '.KKKK..KKKK.....',
  '................',
];
const PX_COL: Record<string, string> = {W: '#F4F4F4', K: '#1C1B22', R: C.red, B: '#111', S: '#F2C9A0', G: '#3A7D5C', N: '#2C3A63'};
export const PixelSprite: React.FC<{which: 'mono' | 'prisoner'; x: number; y: number; px: number; frame?: number; flip?: boolean}> = ({which, x, y, px, frame = 0, flip}) => {
  const rows = which === 'mono' ? MONO_PX : PRISONER_PX;
  const rects: React.ReactNode[] = [];
  rows.forEach((row, j) => {
    // 走路动画：两帧交替抬脚
    const legShift = j >= 13 && frame % 2 === 1 ? (row.indexOf('.') < 3 ? 1 : -1) : 0;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      rects.push(<rect key={`${i}-${j}`} x={(i + (j >= 14 ? legShift : 0)) * px} y={j * px} width={px + 0.5} height={px + 0.5} fill={PX_COL[ch]} />);
    }
  });
  return <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>{rects}</g>;
};
