import {clamp, DEG, E, lerp, prog} from '../lib/math';
import {CUE, H, W} from './config';
import {C0, craneFrame, cranePos, GAP, GAP_DIR, R, railAt, railFrame, STAR, T_HIT, threadTip, trainHead} from './scene';
import {add, Cam, cross, lookAt, mix, mul, norm, sph, sub, V3} from './v3';

// 分镜：按乐句/强拍硬切。每个镜头给出 机位、看向、焦段、景深。

interface Spec {
  pos: V3;
  tgt: V3;
  fov: number;
  roll?: number;
  focus?: number; // 对焦距离（缺省 = 纸鹤）
  ap?: number; // 光圈（越大景深越浅）
}
interface Shot {
  t: number;
  name: string;
  f: (u: number, s: number) => Spec;
}

/** 纸鹤局部坐标：x 侧、y 上、z 前 */
function rel(s: number, x: number, y: number, z: number): V3 {
  const fr = craneFrame(s);
  const side = norm(cross(fr.fwd, [0, 1, 0]));
  const up = norm(cross(side, fr.fwd));
  return add(fr.p, add(add(mul(side, x), mul(up, y)), mul(fr.fwd, z)));
}
const io = E.io2;
const N_OUT = GAP_DIR;
const TEXT_ROW = mul(sph(-8.75 * DEG, 19 * DEG), R); // 「困在一张没空隙的网」那一行的中心
const toStar = (s: number) => norm(sub(STAR, cranePos(s)));

export const SHOTS: Shot[] = [
  // ── 副歌 ──
  {t: 39.15, name: '只因为｜心的微距', f: (u, s) => ({pos: rel(s, 1.2 - 0.25 * io(u), 0.22, 0.3), tgt: rel(s, 0, 0.02, 0.02), fov: 28, ap: 0.035})},
  {t: CUE.c1, name: '你那渴望自由｜侧面特写', f: (u, s) => ({pos: rel(s, -2.2 + 0.2 * u, 0.5, -0.2 + 0.5 * u), tgt: rel(s, 0, 0.18, 0.1), fov: 34, ap: 0.022})},
  {t: CUE.c1 + 1, name: '的心脏｜从下往上', f: (u, s) => ({pos: rel(s, 0.45, -1.15 + 0.15 * u, 0.55), tgt: rel(s, 0, 0.08, 0), fov: 40 - 4 * u, ap: 0.025})},
  {t: CUE.c2, name: '困在一张｜正对网壁，网织满', f: u => ({pos: mul(sph(-7.5 * DEG, 16.5 * DEG), R - 9.6 + 1.0 * io(u)), tgt: add(TEXT_ROW, [0, -1.0, 0]), fov: 46, focus: 9, ap: 0.008})},
  {t: CUE.c2 + 1, name: '没空隙的网｜笼外仰拍看进来', f: u => ({pos: add(C0, add(mul(N_OUT, 3.0 + 1.8 * E.o3(u)), [0.35, -1.5, 0])), tgt: add(C0, [0, 0.4, 0]), fov: 36, ap: 0.018})},
  {t: CUE.c3, name: '我们的周围并非没光亮｜仰望城市', f: u => ({pos: [-6.5, 1.3, -1.5], tgt: [3.5, lerp(5.5, 9.5, io(u)), 30], fov: 58, focus: 40, ap: 0.004})},
  {t: CUE.c4, name: '只是太耀眼｜追着冲向光', f: (u, s) => ({pos: rel(s, 0.45, 0.32, -1.7), tgt: rel(s, 0, 0.1, 3), fov: 44 - 8 * u, ap: 0.015})},
  {
    t: T_HIT,
    name: '灼伤｜撞网（侧面）',
    f: u => {
      const sh = 0.12 * Math.exp(-u * 8);
      const side = norm(cross(N_OUT, [0, 1, 0]));
      return {pos: add(add(C0, mul(side, -3.2)), [sh * Math.sin(u * 90), 0.45 + sh * Math.cos(u * 70), -0.2]), tgt: add(C0, mul(N_OUT, 0.7)), fov: 40, ap: 0.012};
    },
  },
  {t: CUE.c5, name: '在这个世界难免会迷茫｜俯拍下沉', f: (u, s) => ({pos: add(cranePos(s), [0.2, 3.3 + 0.6 * u, -0.5]), tgt: cranePos(s), fov: 46, roll: 0.15 + 0.55 * io(u), ap: 0.012})},
  {t: CUE.c6, name: '但别再把｜仰拍，星亮了', f: (u, s) => ({pos: add(cranePos(s), [0.9, -1.3, -1.4]), tgt: mix(cranePos(s), STAR, 0.045 + 0.02 * u), fov: 56, ap: 0.008})},
  {t: CUE.c6 + 1, name: '小刀带在身上｜主观看星', f: (u, s) => ({pos: add(cranePos(s), [0, 0.3, 0]), tgt: STAR, fov: 34 - 5 * io(u), focus: 30, ap: 0.004})},
  {t: CUE.c7, name: '至少我还在为你而歌唱｜正上方光环', f: u => ({pos: [0, 4, 0], tgt: [0.01, 30, 0.5], fov: 70, roll: 0.1 + 0.35 * u, focus: 25, ap: 0.003})},
  {t: CUE.c8, name: '在黑暗漫长的｜贴着网壁', f: u => ({pos: [-8.5 + 1.2 * u, 8.5, 9.5], tgt: [5.5, 9.5, 22], fov: 34, focus: 18, ap: 0.005})},
  {t: CUE.c8 + 1, name: '反乌托邦｜笼外全景', f: u => ({pos: [lerp(6, 0, u), lerp(17, 19, u), lerp(78, 70, io(u))], tgt: [0, 10, 0], fov: 36, focus: 70, ap: 0.002})},
  // ── 间奏 / 标题 ──
  {t: CUE.post, name: '标题｜笼内满天星', f: u => ({pos: [lerp(-0.6, 0.5, u), 5.3, lerp(0.5, 3.5, io(u))], tgt: add(C0, [0, 2.6, 0]), fov: 56, focus: 20, ap: 0.004})},
  {t: CUE.post + 3, name: '等待｜纸鹤仰望', f: (u, s) => ({pos: rel(s, 1.5 - 0.15 * u, -0.7, -0.9), tgt: rel(s, -0.4, 1.3, 0.2), fov: 42, ap: 0.016})},
  // ── 「即便……」光线垂下 ──
  {
    t: CUE.bridge,
    name: '即便｜跟着光线往下',
    f: (u, s) => {
      const fr = railFrame(Math.max(2, threadTip(s)));
      return {pos: add(fr.p, add(mul(fr.N, 6), [0, 1.8, 0])), tgt: fr.p, fov: 50, focus: 6.5, ap: 0.008};
    },
  },
  {t: CUE.bridge + 2.4, name: '光线穿过网｜笼内特写', f: (u, s) => ({pos: rel(s, 1.9, 0.45, -1.3), tgt: mix(rel(s, 0, 0.2, 0.5), GAP, 0.35), fov: 40, ap: 0.018})},
  {t: CUE.bridge + 4.4, name: '网结松开｜笼外近景', f: u => ({pos: add(GAP, add(mul(N_OUT, 1.9 - 0.3 * u), [0.7, 0.45, 0])), tgt: add(GAP, [0, -0.1, 0]), fov: 36, focus: 2.0, ap: 0.02})},
  {t: CUE.bridge + 6.4, name: '缺口张开｜笼外仰拍', f: u => ({pos: add(GAP, add(mul(N_OUT, 3.4 - 0.9 * io(u)), [1.0, -1.4, 0])), tgt: add(C0, [0, 0.5, 0]), fov: 38, ap: 0.015})},
  {t: CUE.v1 - 2, name: '穿过缺口｜纸鹤背后', f: (u, s) => ({pos: rel(s, 0.3, 0.38, -1.8), tgt: rel(s, 0, 0.1, 4), fov: 46, ap: 0.012})},
  // ── 第二段主歌：笼外 ──
  {
    t: CUE.v1,
    name: '忍着想要挣脱的生活｜飞出来（侧跟）',
    f: (u, s) => {
      const cp = cranePos(s), fr = railFrame(nearestRail(cp));
      return {pos: add(cp, add(add(mul(fr.T, -2.6), mul(fr.N, 2.6)), mul(fr.B, 0.9))), tgt: cp, fov: 46, ap: 0.012};
    },
  },
  {t: CUE.v2, name: '做出不想做的承诺｜大全景', f: u => ({pos: [lerp(42, 36, u), lerp(20, 24, u), lerp(70, 62, u)], tgt: [0, 12, 8], fov: 36, focus: 60, ap: 0.002})},
  {
    t: CUE.train,
    name: '列车上坐错站的乘客｜列车冲进来',
    f: (u, s) => {
      const fr = railFrame(16);
      const head = railAt(Math.max(0, trainHead(s) - 2));
      return {pos: add(fr.p, add(mul(fr.N, 2.6), mul(fr.B, -0.6))), tgt: head, fov: 52, focus: 4, ap: 0.01};
    },
  },
  {
    t: CUE.v4,
    name: '困惑着沉默｜贴着车窗',
    f: (u, s) => {
      const cp = cranePos(s), fr = railFrame(nearestRail(cp));
      return {pos: add(cp, add(add(mul(fr.N, 1.8), mul(fr.T, 0.6)), mul(fr.B, 0.15))), tgt: add(cp, mul(fr.N, -1.2)), fov: 44, ap: 0.014};
    },
  },
  {
    t: CUE.v5,
    name: '但我还想做些什么｜仰拍升起',
    f: (u, s) => {
      const cp = cranePos(s), fr = railFrame(nearestRail(cp));
      return {pos: add(cp, add(add(mul(fr.B, -2.6), mul(fr.N, 1.6)), mul(fr.T, -1.4))), tgt: add(cp, mul(fr.B, 1)), fov: 54, ap: 0.01};
    },
  },
  {t: CUE.v6, name: '其实还想要说很多｜螺旋全景', f: u => ({pos: [lerp(32, 26, u), lerp(30, 34, u), lerp(-22, -27, u)], tgt: [0, 25, 0], fov: 40, focus: 45, ap: 0.002})},
  {
    t: CUE.please1,
    name: '请你等等我｜追向那颗星',
    f: (u, s) => {
      const cp = cranePos(s), d = toStar(s);
      return {pos: add(cp, add(mul(d, -3.6), [0, 0.9, 0])), tgt: STAR, fov: 44, ap: 0.01};
    },
  },
  {
    t: CUE.please2,
    name: '请你等等我｜逆光剪影',
    f: (u, s) => {
      const cp = cranePos(s), d = toStar(s);
      const side = norm(cross(d, [0, 1, 0]));
      return {pos: add(cp, add(add(mul(d, -1.8 + 0.4 * u), mul(side, 0.5)), [0, 0.3, 0])), tgt: add(cp, mul(d, 2)), fov: 34, ap: 0.018};
    },
  },
];

function nearestRail(p: V3) {
  let best = 0, bd = 1e9;
  for (let d = 0; d < 160; d += 0.5) {
    const q = railAt(d);
    const e = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
    if (e < bd) {
      bd = e;
      best = d;
    }
  }
  return best;
}

export const shotAt = (s: number) => {
  let i = 0;
  while (i + 1 < SHOTS.length && s >= SHOTS[i + 1].t) i++;
  return i;
};

export function camera(s: number): Cam {
  const i = shotAt(s);
  const t0 = SHOTS[i].t, t1 = SHOTS[i + 1]?.t ?? t0 + 2;
  const sp = SHOTS[i].f(clamp(prog(s, t0, t1)), s);
  // 极轻的手持呼吸
  const drift: V3 = [0.012 * Math.sin(s * 0.9), 0.01 * Math.sin(s * 1.3 + 1), 0.012 * Math.sin(s * 0.7 + 2)];
  const focus = sp.focus ?? Math.hypot(...sub(cranePos(s), sp.pos));
  return lookAt(add(sp.pos, drift), sp.tgt, sp.roll ?? 0, sp.fov, W, H, focus, sp.ap ?? 0.012);
}

export {R};
