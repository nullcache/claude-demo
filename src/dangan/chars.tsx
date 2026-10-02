import React from 'react';
import {P, TAU} from '../lib/math';
import {circleD, ribbonD, smoothD} from '../lib/shapes';
import {C, lerp} from './core';
import {poly} from './ui';

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
  '..OO........OO..',
  '.OWWO......OKKO.',
  '.OWWWOOOOOOKKKO.',
  '..OWWWWWKKKKKO..',
  '.OWWWWWWKKKKKKO.',
  '.OWWWWWWKKKKKKO.',
  '.OWBWWWWKKKRRKO.',
  '.OWBWWWWKKRRKKO.',
  '.OWWWWBBBWKKKKO.',
  '.OPWWWWBWWWKKKO.',
  '.OWWWBBTUTUTUKO.',
  '..OWWWWWWWKKKO..',
  '...OOWWWKKKOO...',
  '..OWWWWWKKKKKO..',
  '.OWWWWWWWWWKKKO.',
  '.OWWWWWWWWWKKKO.',
  '..OWWWWWWWWKKO..',
  '..OWWO...OKKO...',
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
const PX_COL: Record<string, string> = {
  W: '#F4F4F4', K: '#1C1B22', R: C.red, B: '#111', S: '#F2C9A0', G: '#3A7D5C', N: '#2C3A63',
  O: '#5A5766', P: '#F4A6BC', T: '#FFFFFF', U: '#C9C6D2',
};
export const PixelSprite: React.FC<{which: 'mono' | 'prisoner'; x: number; y: number; px: number; frame?: number; flip?: boolean}> = ({which, x, y, px, frame = 0, flip}) => {
  const rows = which === 'mono' ? MONO_PX : PRISONER_PX;
  const rects: React.ReactNode[] = [];
  const feet = rows.length - (rows[rows.length - 1].replace(/\./g, '') ? 1 : 2);
  rows.forEach((row, j) => {
    // 走路动画：脚所在行两帧交替错位
    const shift = j === feet && frame % 2 === 1 ? 1 : 0;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      rects.push(<rect key={`${i}-${j}`} x={(i + shift) * px} y={j * px} width={px + 0.5} height={px + 0.5} fill={PX_COL[ch]} />);
    }
  });
  return <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>{rects}</g>;
};
