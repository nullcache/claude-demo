import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Runner, runnerRig, seedInHand, HandCtl, Rig} from './characters/Runner';
import {bump, E, integral, keys, lerp, P, prog, ss, V} from './lib/math';
import {blobD, circleD, ribbonD} from './lib/shapes';

export const FPS = 60;
export const DURATION_S = 10;
const W = 1920, H = 1080;

export const COL = {
  bg: '#D4F3EC', // 开场柔和浅薄荷青
  bgBlob: '#C5EEE3',
  mint: '#7ED8C6',
  emerald: '#12A574',
  jade: '#45C493',
  white: '#FFFFFF',
  blue: '#9DD3F5',
  orange: '#FF8A3D',
  pale: '#D3F1E1',
};

// ───────────── 时间轴 ─────────────
const T_REL = 2.27; // 推出种子
const RUN_PERIOD = 0.58;
const SEED_R = 16;

// 摄像机：从左向右平稳跟随 → 出手后加速追随种子 → 减速
const camVel = keys([[0, 560], [2.15, 560], [2.65, 3000], [3.4, 280, -900], [3.9, 120], [10, 120]]);
const camX = integral(camVel, 0, 10);

// 两人：世界坐标（女孩在左后、男孩在右前，并肩同节奏）
const GROUND = 906;
const boyWX = (t: number) => 1130 + 600 * t;
const gap = (t: number) => 400 - 40 * bump(t, 0.4, 0.75, 1.05, 1.45);
const S_RUN = 1.08;

// 关键姿态轨道（手的目标点，相对肩部）
type HKey = [number, number, number, number]; // t, x, y, open
function handTrack(k: HKey[]) {
  return (t: number): {target: P; open: number} => {
    if (t <= k[0][0]) return {target: [k[0][1], k[0][2]], open: k[0][3]};
    const n = k.length;
    if (t >= k[n - 1][0]) return {target: [k[n - 1][1], k[n - 1][2]], open: k[n - 1][3]};
    let i = 0;
    while (t > k[i + 1][0]) i++;
    const u = E.io3(prog(t, k[i][0], k[i + 1][0]));
    return {target: [lerp(k[i][1], k[i + 1][1], u), lerp(k[i][2], k[i + 1][2], u)], open: lerp(k[i][3], k[i + 1][3], u)};
  };
}
const girlNear = handTrack([
  [0.42, 40, 70, 0], // 预备：手先收
  [0.72, 150, 6, 0.55], // 向前递出
  [0.9, 152, 4, 0.9], // 松手
  [1.2, 120, 30, 0.2],
]);
const girlNearW = (t: number) => ss(0.4, 0.62, t) * (1 - ss(1.05, 1.4, t));
const boyNear = handTrack([
  [0.48, -40, 96, 0.4],
  [0.74, -152, 24, 1], // 向后伸手
  [0.98, -152, 24, 1],
  [1.06, -146, 30, 0.1], // 接住、握拢
  [1.4, 58, 44, 0.35], // 收到胸前
  [1.86, 58, 44, 0.35],
  [2.12, 20, 34, 0], // 蓄力
  [2.27, 158, -14, 0.85], // 推出
  [2.5, 150, 0, 0.6],
]);
const boyNearW = (t: number) => ss(0.45, 0.7, t) * (1 - ss(2.5, 2.95, t));
const boyFar = handTrack([[1.05, 66, 52, 0.35], [1.86, 66, 50, 0.35]]);
const boyFarW = (t: number) => ss(1.05, 1.38, t) * (1 - ss(1.9, 2.15, t));

interface RunState {
  girl: Rig;
  boy: Rig;
  gx: number;
  bx: number;
  gy: number;
  by: number;
}
function runState(t: number): RunState {
  const ph = t / RUN_PERIOD;
  const gn = girlNear(t), bn = boyNear(t), bf = boyFar(t);
  const ctl = (x: {target: P; open: number}, w: number): HandCtl => ({target: x.target, open: x.open, w});
  const girl = runnerRig({kind: 'girl', phase: ph + 0.03, near: ctl(gn, girlNearW(t))});
  const boy = runnerRig({
    kind: 'boy',
    phase: ph,
    near: ctl(bn, boyNearW(t)),
    far: ctl(bf, boyFarW(t)),
    leanAdd: -0.06 * bump(t, 1.95, 2.12, 2.14, 2.3) + 0.05 * bump(t, 2.18, 2.28, 2.35, 2.6),
  });
  const cx = camX(t);
  const bxW = boyWX(t);
  return {girl, boy, gx: bxW - gap(t) - cx, bx: bxW - cx, gy: GROUND - 262 * S_RUN, by: GROUND - 271 * S_RUN};
}
const toW = (x: number, y: number, p: P): P => [x + S_RUN * p[0], y + S_RUN * p[1]];

// 种子：位置/半径（屏幕坐标）
function seedsAt(t: number, st: RunState) {
  const gSeed = toW(st.gx, st.gy, seedInHand(st.girl.armNear));
  const bNear = toW(st.bx, st.by, seedInHand(st.boy.armNear));
  const bFar = toW(st.bx, st.by, seedInHand(st.boy.armFar));
  const r = SEED_R * S_RUN;
  // 女孩的种子：递出 → 弧线飞到男孩手中 → 接住挤压
  let passing: {p: P; rx: number; ry: number};
  if (t < 0.86) passing = {p: gSeed, rx: r, ry: r};
  else if (t < 1.0) {
    const u = E.io2(prog(t, 0.86, 1.0));
    const p = V.lerp(gSeed, bNear, u);
    p[1] -= 34 * Math.sin(Math.PI * u);
    const st2 = 1 + 0.25 * Math.sin(Math.PI * u);
    passing = {p, rx: r * st2, ry: r / st2};
  } else {
    const sq = bump(t, 1.0, 1.03, 1.03, 1.16);
    passing = {p: bNear, rx: r * (1 + 0.22 * sq), ry: r * (1 - 0.2 * sq)};
  }
  // 融合：两颗种子在胸前靠近 → 液态融为一颗更大的种子
  const mp = E.io3(prog(t, 1.44, 1.84));
  const mid = V.lerp(bNear, bFar, 0.5);
  const merged = SEED_R * 1.45 * S_RUN;
  const a = V.lerp(passing.p, mid, mp), b = V.lerp(bFar, mid, mp);
  const rm = lerp(r, merged, mp);
  return {passing, farP: bFar, a, b, rm, mp, nearP: bNear, merged};
}

// 出手点 → 飞行轨迹（屏幕坐标）
const REL_P: P = (() => {
  const st = runState(T_REL);
  return toW(st.bx, st.by, seedInHand(st.boy.armNear));
})();
const FX = keys([[T_REL, REL_P[0], 1700], [2.75, 1520, 300], [3.15, 1240, -700], [3.55, 960, 0]]);
const FY = keys([[T_REL, REL_P[1], -160], [2.75, 430, 0], [3.2, 560, 280], [3.55, 640, 0]]);
const seedRFly = (t: number) => lerp(SEED_R * 1.45 * S_RUN, 96, E.oBack(prog(t, 3.18, 3.82), 1.3));

// ───────────── 场景元素 ─────────────
const BG_BLOBS: Array<[number, number, number, number]> = [
  [300, 1080, 470, 280], [1500, 10, 420, 230], [2550, 1090, 520, 300], [3600, 20, 470, 250],
  [4650, 1080, 540, 320], [5700, 0, 500, 280], [6750, 1080, 560, 320],
];
const BgBlobs: React.FC<{t: number}> = ({t}) => {
  const k = 1 - E.io3(prog(t, 3.2, 3.9));
  if (k <= 0) return null;
  const cx = camX(t);
  return (
    <g>
      {BG_BLOBS.map((b, i) => {
        const x = b[0] - cx;
        if (x < -800 || x > W + 800) return null;
        const y = b[1] + (b[1] > H / 2 ? 1 : -1) * (1 - k) * b[3];
        return <path key={i} d={blobD(x, y, b[2], b[3], t, i * 2.1, 0.06)} fill={COL.bgBlob} />;
      })}
    </g>
  );
};

/** 宽阔液态尾迹：世界坐标中“铺下”的色带，随后被种子回收 */
const Trail: React.FC<{t: number}> = ({t}) => {
  if (t <= T_REL + 0.004 || t >= 3.62) return null;
  const k = ss(2.95, 3.6, t);
  const tau0 = T_REL + (t - T_REL) * k;
  const n = 96;
  const cx = camX(t);
  const base: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const tau = lerp(tau0, t, i / (n - 1));
    const wx = FX(tau) + camX(tau);
    base.push([wx - cx, FY(tau), wx]);
  }
  const grow = (0.3 + 0.7 * ss(T_REL, 2.7, t)) * (1 - ss(3.3, 3.62, t));
  const bands = [
    {col: COL.mint, W: 250, dy: -6, amp: 40, ph: 0},
    {col: COL.emerald, W: 150, dy: 16, amp: 46, ph: 2.1},
    {col: COL.blue, W: 46, dy: -40, amp: 62, ph: 4.0},
  ];
  return (
    <g>
      {bands.map((b, j) => {
        const pts: P[] = [], ws: number[] = [];
        for (let i = 0; i < n; i++) {
          const s = i / (n - 1);
          const f = Math.pow(1 - s, 0.8) * (1 - ss(0.85, 1, s));
          const [x, y, wx] = base[i];
          pts.push([x, y + b.dy * f + b.amp * Math.sin(0.0042 * wx - 7 * t + b.ph) * f]);
          // 尾端尖细 → 中段最宽 → 收进种子
          const g = ss(0, 0.42, s) * (1 - 0.86 * ss(0.5, 1, s));
          ws.push(b.W * grow * g * (1 + 0.14 * Math.sin(0.008 * wx - 4 * t + b.ph)));
        }
        return <path key={j} d={ribbonD(pts, ws)} fill={b.col} />;
      })}
    </g>
  );
};

const FlyingSeed: React.FC<{t: number}> = ({t}) => {
  const x = FX(t), y = FY(t);
  const dt = 1 / 240;
  const vx = (FX(t + dt) + camX(t + dt) - FX(t - dt) - camX(t - dt)) / (2 * dt);
  const vy = (FY(t + dt) - FY(t - dt)) / (2 * dt);
  const sp = Math.hypot(vx, vy);
  const stretch = 1 + Math.min(0.9, Math.max(0, (sp - 500) / 2600)) * (1 - ss(3.2, 3.5, t));
  const r = seedRFly(t);
  const spread = bump(t, 3.32, 3.56, 3.6, 3.88);
  const rx = r * stretch * (1 + 0.32 * spread), ry = (r / Math.sqrt(stretch)) * (1 - 0.16 * spread);
  const rot = sp > 1 ? Math.atan2(vy, vx) * (1 - ss(3.3, 3.5, t)) : 0;
  const rc = r * 0.75 * E.o3(prog(t, 3.3, 3.86));
  return (
    <g>
      <path d={blobD(x, y, rx, ry, t * 2, 1.3, 0.035 * ss(3.4, 3.7, t), 14, rot)} fill={COL.white} />
      {rc > 0.5 ? <path d={blobD(x, y + 2, rc, rc, t * 2.4, 4.1, 0.05 * ss(3.4, 3.7, t), 12)} fill={COL.emerald} /> : null}
    </g>
  );
};

const RunScene: React.FC<{t: number}> = ({t}) => {
  if (t >= 3.5) return null;
  const st = runState(t);
  const sd = seedsAt(t, st);
  const merging = t >= 1.36 && t < 1.92;
  const gooBlur = 7 * (1 - ss(1.82, 1.92, t));
  return (
    <g>
      {st.gx > -400 ? <Runner rig={st.girl} x={st.gx} y={st.gy} s={S_RUN} /> : null}
      {st.bx > -400 ? <Runner rig={st.boy} x={st.bx} y={st.by} s={S_RUN} farSeed={t < 1.36 ? SEED_R : 0} /> : null}
      {t < T_REL ? (
        merging ? (
          <g filter="url(#gooSeed)">
            <defs>
              <filter id="gooSeed" filterUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <feGaussianBlur in="SourceGraphic" stdDeviation={Math.max(0.01, gooBlur)} result="b" />
                <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
              </filter>
            </defs>
            <path d={circleD(sd.a[0], sd.a[1], sd.rm) + circleD(sd.b[0], sd.b[1], sd.rm)} fill={COL.white} />
          </g>
        ) : t >= 1.92 ? (
          <path d={circleD(sd.nearP[0], sd.nearP[1], sd.merged)} fill={COL.white} />
        ) : (
          <g>
            <ellipse cx={sd.passing.p[0]} cy={sd.passing.p[1]} rx={sd.passing.rx} ry={sd.passing.ry} fill={COL.white} />
            {t >= 1.36 ? <path d={circleD(sd.farP[0], sd.farP[1], SEED_R * S_RUN)} fill={COL.white} /> : null}
          </g>
        )
      ) : null}
    </g>
  );
};

export const Promo: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{backgroundColor: COL.bg}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0}}>
        <rect width={W} height={H} fill={COL.bg} />
        <BgBlobs t={t} />
        <Trail t={t} />
        <RunScene t={t} />
        {t >= T_REL && t < 3.9 ? <FlyingSeed t={t} /> : null}
      </svg>
    </AbsoluteFill>
  );
};
