import React from 'react';
import {cycle, cycleS, DEG, lerp, P, TAU, V} from '../lib/math';
import {chainD, circleD, endDir, limb, smoothD, subPts} from '../lib/shapes';

export type Kind = 'girl' | 'boy';

export const PAL = {
  girl: {
    skin: '#F8D3B8', skinD: '#EBBD9D', hair: '#2B1F1C', tip: '#12A574',
    top: '#FFFFFF', topD: '#E3EDF1', detail: '#8FCBF2', detailD: '#78B6E0',
    pants: '#CDD4DF', pantsD: '#B5BFCC', shoe: '#FFFFFF', shoeD: '#E3EAEF', sole: '#8FCBF2', soleD: '#78B6E0',
    eye: '#2B1F1C', mouth: '#C9564A',
  },
  boy: {
    skin: '#EAB28C', skinD: '#D89C75', hair: '#15151A', tip: '#15151A',
    top: '#078A5E', topD: '#05714C', detail: '#078A5E', detailD: '#05714C',
    pants: '#FFFFFF', pantsD: '#E1E8EC', shoe: '#FFFFFF', shoeD: '#E1E8EC', sole: '#FF8A3D', soleD: '#E9782F',
    eye: '#1C1818', mouth: '#A9483A',
  },
};

const DIM = {
  girl: {torso: 156, thigh: 140, shin: 134, ua: 82, fa: 78, legW: [40, 27, 21], armW: [18, 15, 13], hand: 13, neckW: 20, gnd: 1},
  boy: {torso: 166, thigh: 145, shin: 139, ua: 86, fa: 82, legW: [44, 30, 24], armW: [21, 17, 15], hand: 14.5, neckW: 23, gnd: 1.035},
};

// ── 跑步循环（相位 0..1，近侧腿）：脚踝相对髋部的轨迹 ──
const FOOT = cycle([
  [0.0, [74, 250]], // 触地
  [0.12, [22, 254]], // 支撑下沉（膝微屈缓冲）
  [0.3, [-60, 255]], // 后蹬
  [0.42, [-112, 214]], // 离地
  [0.55, [-120, 146]], // 后踢
  [0.7, [-30, 126]], // 前摆，高抬膝
  [0.84, [78, 174]], // 前伸
  [0.94, [100, 226]], // 下落
]);
const FOOT_A = cycleS([[0, -10], [0.12, 0], [0.3, 18], [0.42, 52], [0.55, 78], [0.7, 36], [0.84, -6], [0.94, -14]]);
// 摆臂：拳头相对肩部（与同侧腿反相）
const HAND = cycle([
  [0.0, [64, 36]],
  [0.25, [12, 98]],
  [0.5, [-62, 90]],
  [0.75, [-2, 92]],
]);

export interface HandCtl {
  target: P; // 相对肩部
  w: number; // 混合权重
  open?: number; // 0 = 握拳, 1 = 张开手掌
}
export interface RunnerInput {
  kind: Kind;
  phase: number;
  near?: HandCtl;
  far?: HandCtl;
  leanAdd?: number;
}

export interface Arm {
  pts: P[];
  hand: P;
  dir: P;
  open: number;
}
export interface Leg {
  pts: P[];
  ankle: P;
  footA: number;
}
export interface Rig {
  kind: Kind;
  P: number;
  hip: P;
  lean: number;
  neckBase: P;
  headC: P;
  headA: number;
  hairSway: number;
  hemSway: number;
  armNear: Arm;
  armFar: Arm;
  legNear: Leg;
  legFar: Leg;
}

export function runnerRig(inp: RunnerInput): Rig {
  const d = DIM[inp.kind];
  const ph = inp.phase;
  const P_ = ph * TAU;
  const bob = 11 * Math.cos(2 * P_ * 2 - 0.12 * 2 * TAU);
  const lean = 0.19 + 0.025 * Math.sin(2 * P_ * 2) + (inp.leanAdd || 0);
  const hip: P = [0, bob];
  const T = (q: P): P => V.add(hip, V.rot(q, lean));
  const neckBase = T([6, -d.torso + 8]);
  const headA = lean * 0.3 - 0.03 * Math.sin(2 * P_ * 2);
  const headC = V.add(neckBase, V.rot([4, -48 * d.gnd], headA));

  const leg = (p: number, root: P): Leg => {
    const f = FOOT(p);
    const ankle: P = [f[0] * d.gnd, f[1] * d.gnd];
    return {pts: limb(root, ankle, d.thigh, d.shin, -1, 26), ankle, footA: FOOT_A(p) * DEG};
  };
  const arm = (p: number, sh: P, ctl?: HandCtl): Arm => {
    let tgt = HAND(p);
    let open = 0;
    if (ctl && ctl.w > 0) {
      tgt = V.lerp(tgt, ctl.target, ctl.w);
      open = (ctl.open || 0) * ctl.w;
    }
    const wrist = V.add(sh, V.mul(tgt, d.gnd));
    const pts = limb(sh, wrist, d.ua, d.fa, 1, 22, 0.38);
    const dir = endDir(pts);
    return {pts, hand: V.add(wrist, V.mul(dir, d.hand * 0.55)), dir, open};
  };
  return {
    kind: inp.kind,
    P: ph,
    hip,
    lean,
    neckBase,
    headC,
    headA,
    hairSway: 6 * Math.sin(2 * P_ * 2 - 1.4),
    hemSway: Math.sin(2 * P_ * 2 - 0.9),
    legNear: leg(ph, T([4, -2])),
    legFar: leg(ph + 0.5, T([-8, -4])),
    armNear: arm(ph + 0.5, T([0, -d.torso + 22]), inp.near),
    armFar: arm(ph, T([-5, -d.torso + 24]), inp.far),
  };
}

/** 手中种子的位置（局部坐标） */
export const seedInHand = (a: Arm): P => V.add(a.hand, V.add(V.mul(a.dir, 4), [0, -9]));

// ── 造型 ──
const TORSO: Record<Kind, P[]> = {
  girl: [[-27, 4], [-30, -36], [-29, -92], [-24, -128], [-11, -151], [9, -155], [24, -144], [33, -116], [28, -76], [22, -38], [28, 4], [0, 8]],
  boy: [[-35, 6], [-38, -38], [-38, -98], [-32, -138], [-15, -163], [10, -165], [30, -154], [43, -120], [38, -74], [33, -32], [37, 6], [0, 10]],
};
const HEAD: Record<Kind, P[]> = {
  girl: [[-34, -4], [-30, -28], [-12, -42], [12, -41], [28, -29], [33, -13], [36, -3], [42, 8], [34, 13], [35, 19], [33, 24], [29, 31], [16, 38], [0, 36], [-14, 28], [-28, 14]],
  boy: [[-36, -4], [-32, -30], [-12, -44], [14, -43], [30, -31], [35, -13], [38, -3], [44, 9], [36, 14], [37, 20], [35, 27], [31, 35], [16, 42], [-2, 40], [-16, 31], [-30, 15]],
};
const HAIR_BACK: P[] = [[14, -45], [-10, -51], [-36, -40], [-50, -14], [-53, 14], [-53, 36], [-60, 54], [-45, 51], [-33, 57], [-21, 50], [-10, 52], [-5, 34], [1, 8], [10, -20]];
const HAIR_FRONT: Record<Kind, P[]> = {
  girl: [[-34, -24], [-22, -45], [0, -53], [24, -47], [38, -31], [43, -16], [45, -5], [35, -12], [22, -22], [6, -26], [-10, -18], [-22, -5], [-30, 5]],
  boy: [[-38, -2], [-41, -26], [-31, -47], [-9, -57], [15, -62], [31, -57], [43, -43], [45, -29], [37, -31], [25, -35], [12, -31], [0, -24], [-10, -12], [-20, 0], [-28, 9]],
};

const Shoe: React.FC<{leg: Leg; fill: string; sole: string; s: number}> = ({leg, fill, sole, s}) => (
  <g transform={`translate(${leg.ankle[0]} ${leg.ankle[1]}) rotate(${leg.footA / DEG}) scale(${s})`}>
    <path d="M-15 -6C-17 6 -12 15 -2 15L41 15C51 15 53 4 45 -2C37 -8 23 -10 11 -14C2 -18 -10 -17 -15 -6Z" fill={fill} />
    <path d="M-14 8C-13 13 -8 16 -2 16L41 16C48 16 51 13 50 8Z" fill={sole} />
  </g>
);

const widths = (n: number, w0: number, w1: number) =>
  Array.from({length: n}, (_, i) => lerp(w0, w1, Math.pow(i / (n - 1), 0.85)) / 2);
/** 三段宽度：根部 → 关节 → 末端（半径数组） */
const limbW = (n: number, w: number[]) =>
  Array.from({length: n}, (_, i) => {
    const s = i / (n - 1);
    return (s < 0.5 ? lerp(w[0], w[1], Math.pow(s / 0.5, 0.8)) : lerp(w[1], w[2], (s - 0.5) / 0.5)) / 2;
  });

export const Runner: React.FC<{rig: Rig; x: number; y: number; s: number; farSeed?: number}> = ({rig, x, y, s, farSeed}) => {
  const p = PAL[rig.kind];
  const d = DIM[rig.kind];
  const girl = rig.kind === 'girl';

  const arm = (a: Arm, far: boolean) => {
    const sk = far ? p.skinD : p.skin;
    const rs = limbW(a.pts.length, d.armW);
    const sl = subPts(a.pts, 0, 0.44, 8);
    const slR = widths(sl.length, d.armW[0] + 11, d.armW[1] + 9);
    const hx = d.hand * lerp(1, 1.3, a.open), hy = d.hand * lerp(1, 0.82, a.open);
    const ang = Math.atan2(a.dir[1], a.dir[0]) / DEG;
    return (
      <g>
        <path d={chainD(a.pts, rs)} fill={sk} />
        <ellipse cx={a.hand[0]} cy={a.hand[1]} rx={hx} ry={hy} transform={`rotate(${ang} ${a.hand[0]} ${a.hand[1]})`} fill={sk} />
        <path d={chainD(sl, slR)} fill={far ? p.topD : p.top} />
        {girl ? <path d={chainD(subPts(a.pts, 0.35, 0.44, 3), widths(4, d.armW[1] + 10.6, d.armW[1] + 9.4))} fill={far ? p.detailD : p.detail} /> : null}
      </g>
    );
  };
  const leg = (l: Leg, far: boolean) => (
    <g>
      <path d={chainD(l.pts, limbW(l.pts.length, d.legW))} fill={far ? p.pantsD : p.pants} />
      <Shoe leg={l} fill={far ? p.shoeD : p.shoe} sole={far ? p.soleD : p.sole} s={d.gnd * 1.18} />
    </g>
  );
  const torsoPts = TORSO[rig.kind].map(([px, py], i): P => (i === 0 || i === 10 ? [px - 3 * rig.hemSway, py + 1.5 * rig.hemSway] : [px, py]));
  const torsoD = smoothD(torsoPts);
  const lean = rig.lean / DEG;
  const clipId = `torso-${rig.kind}`;
  const hairClip = `hair-${rig.kind}`;

  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {arm(rig.armFar, true)}
      {farSeed ? <path d={circleD(...seedInHand(rig.armFar), farSeed)} fill="#FFFFFF" /> : null}
      {leg(rig.legFar, true)}
      {leg(rig.legNear, false)}
      <ellipse cx={rig.hip[0]} cy={rig.hip[1] + 4} rx={girl ? 26 : 30} ry={girl ? 22 : 24} fill={p.pants} />
      <path d={chainD([rig.neckBase, V.add(rig.headC, V.rot([-2, 26], rig.headA))], [d.neckW / 2, d.neckW / 2])} fill={p.skin} />
      <g transform={`translate(${rig.hip[0]} ${rig.hip[1]}) rotate(${lean})`}>
        <defs>
          <clipPath id={clipId}>
            <path d={torsoD} />
          </clipPath>
        </defs>
        <path d={torsoD} fill={p.top} />
        {girl ? (
          <g clipPath={`url(#${clipId})`}>
            <rect x={-60} y={-8} width={120} height={30} fill={p.detail} />
            <rect x={-4} y={-170} width={8} height={180} fill={p.detail} />
          </g>
        ) : null}
      </g>
      <g transform={`translate(${rig.headC[0]} ${rig.headC[1]}) rotate(${rig.headA / DEG}) scale(${d.gnd})`}>
        {girl ? (
          <g transform={`rotate(${rig.hairSway} -6 -30)`}>
            <defs>
              <clipPath id={hairClip}>
                <path d={smoothD(HAIR_BACK)} />
              </clipPath>
            </defs>
            <path d={smoothD(HAIR_BACK)} fill={p.hair} />
            <path d="M-82 32Q-64 26 -52 39Q-42 49 -30 41L-22 80L-82 80Z" fill={p.tip} clipPath={`url(#${hairClip})`} />
          </g>
        ) : null}
        <path d={smoothD(HEAD[rig.kind])} fill={p.skin} />
        {!girl ? <ellipse cx={-6} cy={4} rx={7} ry={9.5} fill={p.skinD} /> : null}
        <ellipse cx={girl ? 21 : 22} cy={-4} rx={3.6} ry={5.2} fill={p.eye} />
        <path d={girl ? 'M13 -15Q20 -19 27 -15L27 -12.5Q20 -16 13 -12.5Z' : 'M13 -16Q21 -20 29 -16L29 -12.5Q21 -16.5 13 -12.5Z'} fill={p.hair} />
        <path d={girl ? 'M25 19Q31 27 36 19Z' : 'M26 21Q32 29 37 21Z'} fill={p.mouth} />
        <path d={smoothD(HAIR_FRONT[rig.kind])} fill={p.hair} />
      </g>
      {arm(rig.armNear, false)}
    </g>
  );
};

export const runnerDims = DIM;
