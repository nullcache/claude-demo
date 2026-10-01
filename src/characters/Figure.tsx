import React from 'react';
import {DEG, lerp, P, PI, TAU, V} from '../lib/math';
import {chainD, resample, smoothD} from '../lib/shapes';

/**
 * 侧视人物（面向 +x），FK 关节驱动 —— 平滑正弦步态，无 IK 弹跳。
 * 两套风格：A 极简优雅（小头长腿、无五官），B 圆润青春（大头圆脸、简笔五官）。
 */
export type Kind = 'girl' | 'boy';
export type StyleId = 'A' | 'B';

export const PAL = {
  girl: {
    skin: '#F8D5BC', skinD: '#ECC1A4', hair: '#2B1F1C', tip: '#12A574',
    top: '#FFFFFF', topD: '#E4EEF2', detail: '#8FCBF2', detailD: '#7AB8E2',
    pants: '#D3D9E3', pantsD: '#BCC5D2', shoe: '#FFFFFF', shoeD: '#E4EBF0', sole: '#8FCBF2', soleD: '#7AB8E2',
    face: '#3A2A26', blush: '#F6B2A2', mouth: '#D0614F',
  },
  boy: {
    skin: '#EDB993', skinD: '#DDA47D', hair: '#16161B', tip: '#16161B',
    top: '#078A5E', topD: '#05714C', detail: '#078A5E', detailD: '#05714C',
    pants: '#FFFFFF', pantsD: '#E1E8EC', shoe: '#FFFFFF', shoeD: '#E1E8EC', sole: '#FF8A3D', soleD: '#E9782F',
    face: '#241A18', blush: '#EE9F86', mouth: '#B5503F',
  },
};

interface Dims {
  torso: number; thigh: number; shin: number; ua: number; fa: number;
  neck: number; neckW: number; head: [number, number];
  legW: [number, number, number, number]; // 髋 / 膝 / 小腿 / 踝
  armW: [number, number, number]; // 肩 / 肘 / 腕
  hand: [number, number]; shoe: number; seat: [number, number];
  torsoPts: P[];
}
const DIMS: Record<StyleId, Record<Kind, Dims>> = {
  A: {
    girl: {
      torso: 190, thigh: 152, shin: 148, ua: 90, fa: 84, neck: 14, neckW: 17, head: [27, 33],
      legW: [44, 29, 27, 16], armW: [16, 11.5, 9], hand: [14, 7.5], shoe: 1, seat: [24, 19],
      torsoPts: [[-22, 4], [-24, -50], [-25, -112], [-23, -160], [-12, -185], [8, -191], [22, -183], [30, -158], [28, -122], [19, -84], [18, -40], [23, 4], [0, 8]],
    },
    boy: {
      torso: 200, thigh: 158, shin: 154, ua: 95, fa: 88, neck: 15, neckW: 20, head: [29, 35],
      legW: [50, 33, 30, 19], armW: [19, 14, 11], hand: [15.5, 8.5], shoe: 1.06, seat: [28, 21],
      torsoPts: [[-26, 4], [-28, -50], [-30, -118], [-28, -168], [-14, -193], [8, -199], [26, -190], [34, -163], [31, -120], [25, -72], [24, -30], [28, 4], [0, 8]],
    },
  },
  B: {
    girl: {
      torso: 150, thigh: 112, shin: 108, ua: 74, fa: 70, neck: 12, neckW: 18, head: [46, 47],
      legW: [44, 34, 31, 22], armW: [19, 16, 14], hand: [13, 11], shoe: 1, seat: [27, 21],
      torsoPts: [[-24, 4], [-27, -45], [-27, -100], [-23, -132], [-11, -148], [8, -151], [22, -143], [29, -120], [27, -86], [22, -50], [22, -16], [25, 4], [0, 8]],
    },
    boy: {
      torso: 158, thigh: 116, shin: 112, ua: 78, fa: 73, neck: 13, neckW: 21, head: [48, 49],
      legW: [48, 37, 33, 24], armW: [22, 18, 16], hand: [14.5, 12], shoe: 1.06, seat: [30, 23],
      torsoPts: [[-29, 4], [-32, -45], [-33, -105], [-29, -140], [-14, -157], [9, -160], [27, -151], [35, -126], [33, -88], [27, -50], [27, -16], [30, 4], [0, 8]],
    },
  },
};

export const legLength = (style: StyleId, kind: Kind) => DIMS[style][kind].thigh + DIMS[style][kind].shin;

// ── 平滑步态（相位 0..1）：全部为低阶正弦组合 ──
export interface ArmCtl { a: number; b: number; w: number } // 绝对角度（弧度）+ 权重
export interface Pose {
  thigh: [number, number]; knee: [number, number]; foot: [number, number]; // [近, 远]
  arm: [[number, number], [number, number]]; // [近(a,b), 远(a,b)]
  bob: number; lean: number; headTilt: number; hair: number;
}
const legAt = (p: number) => {
  const q = TAU * p;
  const thigh = (14 + 40 * Math.sin(q)) * DEG;
  const knee = (12 + 92 * Math.pow(0.5 + 0.5 * Math.cos(q + TAU * 0.06), 2.1)) * DEG;
  const plantar = 34 * Math.pow(0.5 + 0.5 * Math.cos(q + TAU * 0.22), 1.6) * DEG;
  return {thigh, knee, foot: thigh - knee + PI / 2 - plantar + 6 * DEG};
};
const armAt = (p: number): [number, number] => {
  const q = TAU * p;
  return [(-4 - 30 * Math.sin(q)) * DEG, (88 + 16 * Math.sin(q + 0.5)) * DEG];
};
export function gait(p: number, near?: ArmCtl, far?: ArmCtl, leanAdd = 0): Pose {
  const n = legAt(p), f = legAt(p + 0.5);
  const mix = (base: [number, number], c?: ArmCtl): [number, number] =>
    c && c.w > 0 ? [lerp(base[0], c.a, c.w), lerp(base[1], c.b, c.w)] : base;
  return {
    thigh: [n.thigh, f.thigh], knee: [n.knee, f.knee], foot: [n.foot, f.foot],
    arm: [mix(armAt(p + 0.5), near), mix(armAt(p), far)],
    bob: 4 * Math.cos(2 * TAU * p - 0.5),
    lean: 9 * DEG + leanAdd,
    headTilt: 1.5 * DEG * Math.sin(2 * TAU * p - 1.2),
    hair: Math.sin(2 * TAU * p - 1.6),
  };
}

const dir = (a: number, L: number): P => [Math.sin(a) * L, Math.cos(a) * L];

/** 关节处带圆角的平滑骨链（中心线） */
function boneLine(A: P, K: P, B: P, round: number, n: number): P[] {
  const l1 = V.len(V.sub(K, A)), l2 = V.len(V.sub(B, K));
  const rf = Math.min(l1, l2) * round;
  const u1 = V.norm(V.sub(K, A)), u2 = V.norm(V.sub(B, K));
  const P1 = V.sub(K, V.mul(u1, rf)), P2 = V.add(K, V.mul(u2, rf));
  const dense: P[] = [];
  for (let i = 0; i <= 12; i++) dense.push(V.lerp(A, P1, i / 12));
  for (let i = 1; i <= 12; i++) {
    const s = i / 12, q = 1 - s;
    dense.push([q * q * P1[0] + 2 * q * s * K[0] + s * s * P2[0], q * q * P1[1] + 2 * q * s * K[1] + s * s * P2[1]]);
  }
  for (let i = 1; i <= 12; i++) dense.push(V.lerp(P2, B, i / 12));
  return resample(dense, n);
}
/** 宽度曲线：关键点 (s, w) 间 smoothstep 插值 → 半径 */
const profile = (n: number, k: Array<[number, number]>) =>
  Array.from({length: n}, (_, i) => {
    const s = i / (n - 1);
    let j = 0;
    while (j < k.length - 2 && s > k[j + 1][0]) j++;
    const u = Math.min(1, Math.max(0, (s - k[j][0]) / (k[j + 1][0] - k[j][0])));
    return lerp(k[j][1], k[j + 1][1], u * u * (3 - 2 * u)) / 2;
  });

export interface FigureRig {
  style: StyleId; kind: Kind; pose: Pose;
  hip: P; sh: [P, P]; el: [P, P]; wr: [P, P]; hand: [P, P]; handDir: [P, P];
  knee: [P, P]; ankle: [P, P]; neckBase: P; headC: P;
}
export function figureRig(style: StyleId, kind: Kind, pose: Pose): FigureRig {
  const d = DIMS[style][kind];
  const hip: P = [0, pose.bob];
  const T = (q: P): P => V.add(hip, V.rot(q, pose.lean));
  const shN = T([2, -d.torso + 16]), shF = T([-6, -d.torso + 18]);
  const knee: [P, P] = [0, 1].map(i => V.add(hip, dir(pose.thigh[i], d.thigh))) as [P, P];
  const ankle: [P, P] = [0, 1].map(i => V.add(knee[i], dir(pose.thigh[i] - pose.knee[i], d.shin))) as [P, P];
  const el: [P, P] = [0, 1].map(i => V.add(i ? shF : shN, dir(pose.arm[i][0], d.ua))) as [P, P];
  const wr: [P, P] = [0, 1].map(i => V.add(el[i], dir(pose.arm[i][0] + pose.arm[i][1], d.fa))) as [P, P];
  const handDir: [P, P] = [0, 1].map(i => dir(pose.arm[i][0] + pose.arm[i][1], 1)) as [P, P];
  const hand: [P, P] = [0, 1].map(i => V.add(wr[i], V.mul(handDir[i], d.hand[0] * 0.7))) as [P, P];
  const neckBase = T([5, -d.torso - 2]);
  const headC = V.add(neckBase, V.rot([3, -d.neck - d.head[1] * 0.82], pose.lean * 0.4 + pose.headTilt));
  return {style, kind, pose, hip, sh: [shN, shF], el, wr, hand, handDir, knee, ankle, neckBase, headC};
}

// ── 头部（局部坐标，头心为原点，面向 +x） ──
const HEAD_A: Record<Kind, P[]> = {
  girl: [[-27, -6], [-23, -27], [-7, -35], [12, -32], [23, -21], [27, -7], [29, 1], [32, 7], [27, 11], [26, 18], [20, 27], [6, 31], [-8, 27], [-21, 15]],
  boy: [[-29, -6], [-25, -29], [-8, -37], [13, -35], [25, -23], [29, -8], [31, 1], [34, 8], [29, 12], [28, 20], [22, 30], [6, 34], [-9, 30], [-23, 16]],
};
const HAIR_A = {
  girlBack: [[10, -38], [-10, -42], [-30, -32], [-40, -10], [-42, 14], [-43, 34], [-49, 47], [-36, 45], [-26, 50], [-15, 44], [-7, 44], [-4, 26], [2, 4], [8, -16]] as P[],
  girlFront: [[-29, -20], [-18, -38], [2, -44], [21, -38], [32, -24], [35, -10], [36, -2], [27, -8], [16, -17], [2, -20], [-11, -13], [-20, -3], [-26, 6]] as P[],
  boy: [[-31, 0], [-33, -21], [-25, -38], [-6, -47], [14, -50], [27, -45], [36, -33], [37, -22], [29, -24], [18, -27], [7, -24], [-3, -17], [-12, -7], [-19, 4], [-25, 10]] as P[],
};
const HEAD_B: Record<Kind, P[]> = {
  girl: [[-46, 0], [-42, -26], [-24, -44], [2, -48], [26, -40], [42, -22], [47, 2], [42, 26], [26, 42], [2, 47], [-24, 42], [-42, 24]],
  boy: [[-48, 0], [-44, -27], [-25, -46], [2, -50], [27, -42], [44, -23], [49, 2], [44, 27], [27, 44], [2, 49], [-25, 44], [-44, 25]],
};
const HAIR_B = {
  girlBack: [[14, -52], [-14, -56], [-42, -42], [-56, -14], [-58, 18], [-56, 44], [-62, 60], [-46, 58], [-32, 64], [-18, 56], [-8, 54], [-6, 30], [0, 0], [10, -28]] as P[],
  girlFront: [[-44, -18], [-30, -46], [0, -58], [30, -50], [48, -30], [53, -10], [53, 4], [40, -6], [24, -18], [4, -22], [-16, -14], [-30, -2], [-38, 10]] as P[],
  boy: [[-49, 4], [-52, -22], [-40, -46], [-14, -58], [14, -62], [34, -56], [48, -40], [52, -24], [40, -26], [24, -30], [8, -26], [-6, -18], [-18, -6], [-28, 6], [-36, 16]] as P[],
};

/** 一缕顺着发流、两头尖的挑染 */
const streak = (k: number) =>
  `M${-14 * k} ${-30 * k}C${-30 * k} ${-18 * k} ${-38 * k} ${8 * k} ${-40 * k} ${40 * k}C${-35 * k} ${10 * k} ${-26 * k} ${-14 * k} ${-14 * k} ${-30 * k}Z`;

const Head: React.FC<{rig: FigureRig}> = ({rig}) => {
  const p = PAL[rig.kind];
  const girl = rig.kind === 'girl';
  const A = rig.style === 'A';
  const sway = rig.pose.hair * 4;
  const clipId = `hairclip-${rig.style}-${rig.kind}`;
  const back = A ? HAIR_A.girlBack : HAIR_B.girlBack;
  const tipY = A ? 33 : 44;
  return (
    <g>
      {girl ? (
        <g transform={`rotate(${sway} -4 ${A ? -24 : -30})`}>
          <defs>
            <clipPath id={clipId}>
              <path d={smoothD(back)} />
            </clipPath>
          </defs>
          <path d={smoothD(back)} fill={p.hair} />
          <g clipPath={`url(#${clipId})`}>
            <path d={`M-90 ${tipY + 2}Q-62 ${tipY - 4} -44 ${tipY + 6}Q-30 ${tipY + 14} -14 ${tipY + 8}L-10 ${tipY + 60}L-90 ${tipY + 60}Z`} fill={p.tip} />
            <path d={streak(A ? 1 : 1.35)} fill={p.tip} />
          </g>
        </g>
      ) : null}
      <path d={smoothD(A ? HEAD_A[rig.kind] : HEAD_B[rig.kind])} fill={p.skin} />
      {!A ? (
        <g>
          <ellipse cx={-4} cy={6} rx={8} ry={11} fill={p.skinD} />
          <ellipse cx={24} cy={-2} rx={4.4} ry={6} fill={p.face} />
          <ellipse cx={26} cy={14} rx={8} ry={5} fill={p.blush} />
          <path d="M30 22Q37 29 43 21Z" fill={p.mouth} />
        </g>
      ) : null}
      <path d={smoothD(girl ? (A ? HAIR_A.girlFront : HAIR_B.girlFront) : A ? HAIR_A.boy : HAIR_B.boy)} fill={p.hair} />
    </g>
  );
};

const Shoe: React.FC<{at: P; a: number; s: number; fill: string; sole: string}> = ({at, a, s, fill, sole}) => (
  <g transform={`translate(${at[0]} ${at[1]}) rotate(${(PI / 2 - a) / DEG}) scale(${s})`}>
    <path d="M-12 -7C-14 3 -10 12 -1 12L42 12C51 12 54 5 48 -1C40 -7 26 -9 14 -13C5 -16 -7 -15 -12 -7Z" fill={fill} />
    <path d="M-11 6C-10 11 -6 13 -1 13L43 13C49 13 52 10 51 6Z" fill={sole} />
  </g>
);

export const Figure: React.FC<{rig: FigureRig; x: number; y: number; s: number; farItem?: React.ReactNode}> = ({rig, x, y, s, farItem}) => {
  const d = DIMS[rig.style][rig.kind];
  const p = PAL[rig.kind];
  const girl = rig.kind === 'girl';
  const N = 28;
  const legD = (i: number) => {
    const pts = boneLine(rig.hip, rig.knee[i], rig.ankle[i], 0.5, N);
    return chainD(pts, profile(N, [[0, d.legW[0]], [0.5, d.legW[1]], [0.64, d.legW[2]], [1, d.legW[3]]]));
  };
  const armD = (i: number) => {
    const pts = boneLine(rig.sh[i], rig.el[i], rig.wr[i], 0.4, N);
    return chainD(pts, profile(N, [[0, d.armW[0]], [0.5, d.armW[1]], [1, d.armW[2]]]));
  };
  const sleeveD = (i: number) => {
    const a = rig.sh[i], b = V.lerp(rig.sh[i], rig.el[i], 0.5);
    return chainD([a, V.lerp(a, b, 0.5), b], [d.armW[0] / 2 + 5, d.armW[0] / 2 + 4.5, d.armW[1] / 2 + 5]);
  };
  const handEl = (i: number, col: string) => {
    const h = rig.hand[i], dd = rig.handDir[i];
    return (
      <ellipse cx={h[0]} cy={h[1]} rx={d.hand[0]} ry={d.hand[1]} transform={`rotate(${Math.atan2(dd[1], dd[0]) / DEG} ${h[0]} ${h[1]})`} fill={col} />
    );
  };
  const arm = (i: number) => {
    const far = i === 1;
    return (
      <g>
        <path d={armD(i)} fill={far ? p.skinD : p.skin} />
        {handEl(i, far ? p.skinD : p.skin)}
        <path d={sleeveD(i)} fill={far ? p.topD : p.top} />
        {girl ? (
          <path
            d={chainD([V.lerp(rig.sh[i], rig.el[i], 0.42), V.lerp(rig.sh[i], rig.el[i], 0.5)], [d.armW[1] / 2 + 5.4, d.armW[1] / 2 + 5.2])}
            fill={far ? p.detailD : p.detail}
          />
        ) : null}
      </g>
    );
  };
  const leg = (i: number) => {
    const far = i === 1;
    return (
      <g>
        <path d={legD(i)} fill={far ? p.pantsD : p.pants} />
        <Shoe at={rig.ankle[i]} a={rig.pose.foot[i]} s={d.shoe * (rig.style === 'A' ? 1 : 0.95)} fill={far ? p.shoeD : p.shoe} sole={far ? p.soleD : p.sole} />
      </g>
    );
  };
  const torsoD = smoothD(d.torsoPts);
  const clipT = `torso-${rig.style}-${rig.kind}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {arm(1)}
      {farItem}
      {leg(1)}
      {leg(0)}
      <ellipse cx={rig.hip[0]} cy={rig.hip[1] + 2} rx={d.seat[0]} ry={d.seat[1]} fill={p.pants} />
      <path d={chainD([rig.neckBase, V.add(rig.headC, V.rot([0, d.head[1] * 0.6], rig.pose.lean * 0.4))], [d.neckW / 2, d.neckW / 2])} fill={p.skin} />
      <g transform={`translate(${rig.hip[0]} ${rig.hip[1]}) rotate(${rig.pose.lean / DEG})`}>
        <defs>
          <clipPath id={clipT}>
            <path d={torsoD} />
          </clipPath>
        </defs>
        <path d={torsoD} fill={p.top} />
        {girl ? (
          <g clipPath={`url(#${clipT})`}>
            <rect x={-60} y={-10} width={120} height={30} fill={p.detail} />
          </g>
        ) : null}
      </g>
      <g transform={`translate(${rig.headC[0]} ${rig.headC[1]}) rotate(${(rig.pose.lean * 0.4 + rig.pose.headTilt) / DEG})`}>
        <Head rig={rig} />
      </g>
      {arm(0)}
    </g>
  );
};
