import React from 'react';
import {P, TAU, V} from '../lib/math';
import {ribbonD, smoothD} from '../lib/shapes';
import {BG, SliceGlitch, Svg} from './Act1';
import {Cast, CastId, Monokuma, MonoDefs} from './chars';
import {b, backOut, C, clamp, E, expoIn, expoOut, F, H, lerp, noise1, prog, rng, W, win} from './core';
import {burstPts, Cracks, glassShards, Glint, Halftone, line, MBlur, poly, Rays, Reticle, Shard, SpeedLines, Txt} from './ui';

// ═════════════ 法庭（2.5D 环形审判席，纸片人公告板） ═════════════
type Seat = CastId | 'x-idol' | 'x-programmer';
const SEATS: Seat[] = ['lucky', 'detective', 'heir', 'x-idol', 'gambler', 'biker', 'x-programmer', 'despair'];
const R_RING = 720;
const YAW_END = 0.13;
const SEAT0 = -Math.PI / 2 - YAW_END + Math.PI / 8;

interface Cam {
  yaw: number;
  D: number;
  Hc: number;
  f: number;
  cy: number;
}
const project = (cam: Cam, X: number, Y: number, Z: number) => {
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const x = X * c - Z * s, z = X * s + Z * c;
  const d = cam.D - z;
  return {x: 960 + (cam.f * x) / d, y: cam.cy + (cam.f * (cam.Hc - Y)) / d, k: cam.f / d, d};
};

export const Court: React.FC<{t: number; cam: Cam; dim?: number}> = ({t, cam, dim = 0}) => {
  const ring = (R: number, n = 72): P[] =>
    Array.from({length: n}, (_, i) => {
      const a = (i / n) * TAU;
      const p = project(cam, Math.cos(a) * R, 0, Math.sin(a) * R);
      return [p.x, p.y];
    });
  const objs: Array<{d: number; el: React.ReactNode}> = [];
  SEATS.forEach((seat, i) => {
    const a = SEAT0 + (i / SEATS.length) * TAU;
    const X = Math.cos(a) * R_RING, Z = Math.sin(a) * R_RING;
    const base = project(cam, X, 0, Z);
    const top = project(cam, X, 210, Z);
    const k = base.k;
    const pw = 300 * k;
    const charOrigin = project(cam, X, 330, Z);
    const el = (
      <g key={i}>
        {seat.startsWith('x-') ? (
          <g transform={`translate(${charOrigin.x} ${charOrigin.y}) scale(${k * 0.8})`}>
            <rect x={-6} y={0} width={12} height={380} fill="#120819" />
            <rect x={-120} y={-200} width={240} height={300} fill="#F3EEF5" stroke="#120819" strokeWidth={12} />
            <g clipPath="url(#portraitClip)">
              <Cast id={seat === 'x-idol' ? 'idol' : 'programmer'} x={0} y={-30} s={0.42} fill="#3B3044" rim="" />
            </g>
            <path d="M-110 -190L110 90M110 -190L-110 90" stroke={C.pink} strokeWidth={22} strokeLinecap="round" />
          </g>
        ) : (
          <Cast id={seat as CastId} x={charOrigin.x} y={charOrigin.y} s={0.56 * k} fill={C.ink} rim={C.pink} rimDx={-9} />
        )}
        {/* 审判台 */}
        <path d={poly([[base.x - pw / 2, top.y], [base.x + pw / 2, top.y], [base.x + pw / 2, base.y], [base.x - pw / 2, base.y]])} fill="#2A1240" />
        <path d={poly([[base.x - pw / 2, top.y], [base.x + pw / 2, top.y], [base.x + pw / 2, top.y + 14 * k], [base.x - pw / 2, top.y + 14 * k]])} fill={C.pink} />
        <path d={poly([[base.x - pw * 0.3, top.y + 50 * k], [base.x + pw * 0.3, top.y + 50 * k], [base.x + pw * 0.3, top.y + 64 * k], [base.x - pw * 0.3, top.y + 64 * k]])} fill={C.pink} opacity={0.5} />
      </g>
    );
    objs.push({d: base.d, el});
  });
  // 黑白熊王座
  {
    const a = -Math.PI / 2 - YAW_END;
    const X = Math.cos(a) * R_RING * 1.4, Z = Math.sin(a) * R_RING * 1.4;
    const base = project(cam, X, 0, Z);
    const k = base.k;
    const top = project(cam, X, 760, Z);
    objs.push({
      d: base.d,
      el: (
        <g key="throne">
          <path d={poly([[base.x - 160 * k, base.y], [base.x - 150 * k, top.y + 120 * k], [base.x, top.y], [base.x + 150 * k, top.y + 120 * k], [base.x + 160 * k, base.y]])} fill="#1A0B24" stroke={C.pink} strokeWidth={4 * k} />
          <Monokuma x={base.x} y={project(cam, X, 470, Z).y} s={0.55 * k} face={1} glow={0.6} grin={0.5 + 0.3 * Math.sin(t * 9)} id="mkT" />
        </g>
      ),
    });
  }
  objs.sort((p, q) => q.d - p.d);
  const radial: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const p0 = project(cam, Math.cos(a) * 140, 0, Math.sin(a) * 140), p1 = project(cam, Math.cos(a) * R_RING * 1.25, 0, Math.sin(a) * R_RING * 1.25);
    radial.push(`M${p0.x} ${p0.y}L${p1.x} ${p1.y}`);
  }
  return (
    <g>
      <defs>
        <linearGradient id="courtBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07030C" />
          <stop offset="0.6" stopColor={C.violet} />
          <stop offset="1" stopColor="#4A0F3A" />
        </linearGradient>
        <clipPath id="portraitClip">
          <rect x={-110} y={-190} width={220} height={280} />
        </clipPath>
      </defs>
      <BG fill="url(#courtBg)" />
      {/* 光柱 */}
      {[0, 1, 2, 3, 4].map(i => {
        const x = 260 + i * 350 + 60 * Math.sin(t * 0.8 + i);
        return <path key={i} d={poly([[x - 40, -50], [x + 40, -50], [x + 180, 1100], [x - 180, 1100]])} fill={C.pink} opacity={0.06} />;
      })}
      {Array.from({length: 14}, (_, j) => {
        const a = (j / 14) * TAU;
        const X = Math.cos(a) * R_RING * 2.3, Z = Math.sin(a) * R_RING * 2.3;
        const p0 = project(cam, X, 0, Z), p1 = project(cam, X, 2600, Z);
        if (p0.d < cam.D) return null;
        const w = 130 * p0.k;
        return (
          <g key={'col' + j}>
            <rect x={p0.x - w} y={p1.y} width={w * 2} height={p0.y - p1.y} fill="#1A0A26" />
            <rect x={p0.x - w} y={p1.y} width={w * 0.25} height={p0.y - p1.y} fill={C.pink} opacity={0.35} />
          </g>
        );
      })}
      <path d={smoothD(ring(R_RING * 1.9))} fill="#1E0C2E" />
      <path d={smoothD(ring(R_RING * 1.25))} fill="#2E1446" />
      <path d={smoothD(ring(R_RING * 0.82))} fill="#43195E" />
      <path d={smoothD(ring(R_RING * 0.55))} fill="#561E72" opacity={0.8} />
      <path d={radial.join('')} stroke={C.pink} strokeWidth={2} opacity={0.35} />
      {[0.3, 0.55, 0.82, 1.25].map((R, i) => (
        <path key={i} d={smoothD(ring(R_RING * R))} fill="none" stroke={C.pink} strokeWidth={i === 3 ? 5 : 3} opacity={0.6} />
      ))}
      <path d={smoothD(ring(R_RING * 0.18))} fill={C.pink} opacity={0.75} />
      {objs.map(o => o.el)}
      {dim > 0 ? <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="#0B0414" opacity={dim} /> : null}
    </g>
  );
};

const courtCam = (t: number): Cam => {
  const u = expoOut(prog(t, b(16), b(20.5)));
  return {yaw: lerp(-1.7, YAW_END - 0.08, u) + 0.05 * (t - b(16)), D: lerp(1700, 2600, u), Hc: lerp(700, 1100, u), f: 1500, cy: lerp(240, 110, u)};
};

// ═════════════ S5  学级裁判 开庭（b16–b20） ═════════════
export const S5Court: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(16);
  const slam = expoOut(win(lt, 0, 0.16));
  const toCorner = E.io3(win(lt, b(2), b(0.7)));
  const seal = win(lt, b(1), 0.14);
  const tx = lerp(960, 330, toCorner), ty = lerp(540, 140, toCorner), ts = lerp(lerp(3, 1, slam), 0.34, toCorner);
  return (
    <Svg>
      <MonoDefs />
      <Court t={t} cam={courtCam(t)} />
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill={C.ink} opacity={0.55 * (1 - toCorner)} />
      <g transform={`translate(${tx} ${ty}) scale(${ts})`}>
        <Txt x={0} y={-10} size={260} fill={C.white} depth={[12, 4, 5, C.pinkDeep]} ls={16} rgb={lt < 0.1 ? 16 : 0}>
          学级裁判
        </Txt>
        <Txt x={0} y={170} size={58} font={F.latin} fill={C.pink} ls={46} opacity={1 - toCorner}>
          CLASS TRIAL · ALL RISE
        </Txt>
        {seal > 0 ? (
          <g transform={`translate(560 -150) rotate(-14) scale(${lerp(1.8, 1, expoOut(seal))})`} opacity={Math.min(1, seal * 3)}>
            <circle r={118} fill="none" stroke={C.red} strokeWidth={14} />
            <circle r={96} fill="none" stroke={C.red} strokeWidth={4} />
            <Txt x={0} y={0} size={86} fill={C.red} ls={2}>
              开庭
            </Txt>
          </g>
        ) : null}
      </g>
    </Svg>
  );
};

// ═════════════ S6  无休止议论（b20–b24） ═════════════
interface Stmt {
  text: React.ReactNode;
  t0: number;
  t1: number;
  from: [number, number, number, number];
  to: [number, number, number, number];
  size: number;
  ease?: (x: number) => number;
}
const WEAK = (s: string) => <span style={{color: C.yellow, textShadow: `0 0 24px ${C.orange}, 0 0 6px ${C.orange}`}}>{s}</span>;
export const STATEMENT2 = ['凶手是从', '【窗户】', '逃走的！'];
const STMTS: Stmt[] = [
  {text: '那个时间，大家都在食堂吧？', t0: b(20), t1: b(22.4), from: [950, -300, -900, -42], to: [-640, -190, 160, 28], size: 86},
  {
    text: (
      <>
        {STATEMENT2[0]}
        {WEAK(STATEMENT2[1])}
        {STATEMENT2[2]}
      </>
    ),
    t0: b(20.8),
    t1: b(24.2),
    from: [-1200, 300, -1300, 50],
    to: [0, 60, 0, 0],
    size: 100,
    ease: x => expoOut(clamp(x / 0.66)),
  },
  {text: '门可是从里面反锁的！', t0: b(21.7), t1: b(24), from: [1100, -80, -1500, -34], to: [-1000, -420, -100, 34], size: 80},
];
const SPEAKERS: Array<[CastId, number, number, boolean]> = [
  ['gambler', b(20), b(21.9), false],
  ['biker', b(20.8), b(23.2), true],
  ['heir', b(21.7), b(24), false],
];

export const S6Debate: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(20);
  const banner = expoOut(win(lt, 0, 0.2));
  const cam = {...courtCam(t), yaw: courtCam(b(20)).yaw + 0.12 * (t - b(20))};
  const lock = expoOut(win(t, b(23), b(0.5)));
  const path: Array<[number, P]> = [
    [b(20), [1560, 860]],
    [b(21.4), [1250, 380]],
    [b(22.4), [700, 720]],
    [b(23.1), [960, 600]],
  ];
  let rp: P = path[0][1];
  for (let i = 0; i < path.length - 1; i++) {
    if (t >= path[i][0]) rp = V.lerp(path[i][1], path[i + 1][1], E.io3(prog(t, path[i][0], path[i + 1][0])));
  }
  const wob = (1 - lock) * 22;
  rp = [rp[0] + wob * noise1(t * 3, 1), rp[1] + wob * noise1(t * 3, 2)];
  const secs = Math.max(0, 300 - (t - b(20)) * 1.6);
  const timer = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}.${String(Math.floor((secs % 1) * 100)).padStart(2, '0')}`;
  return (
    <>
      <Svg style={{filter: 'blur(5px)'}}>
        <MonoDefs />
        <Court t={t} cam={cam} dim={0.45} />
      </Svg>
      <Svg>
        {/* 透视网格地面 */}
        <g opacity={0.5} stroke={C.pink} strokeWidth={2}>
          {Array.from({length: 13}, (_, i) => {
            const x = (i - 6) * 260;
            return <path key={i} d={`M${960 + x * 0.25} 640L${960 + x * 2.4} 1100`} />;
          })}
          {Array.from({length: 7}, (_, i) => {
            const u = ((i + (t * 2.2) % 1) / 7) ** 2;
            const y = 640 + u * 460;
            return <path key={'h' + i} d={`M-100 ${y}L2020 ${y}`} opacity={u} />;
          })}
        </g>
        {SPEAKERS.map(([id, t0, t1, right], i) => {
          const k = expoOut(win(t, t0, 0.25)) * (1 - expoIn(win(t, t1 - 0.25, 0.25)));
          if (k <= 0) return null;
          return <Cast key={i} id={id} x={right ? 1740 + 260 * (1 - k) : 180 - 260 * (1 - k)} y={780} s={0.95} fill="#0B0414" rim={C.pink} flip={right} opacity={0.95} />;
        })}
      </Svg>
      {/* 3D 浮动发言 */}
      <div style={{position: 'absolute', inset: 0, perspective: 1100, perspectiveOrigin: '50% 50%'}}>
        {STMTS.map((s, i) => {
          if (t < s.t0 || t > s.t1) return null;
          const u = (s.ease ?? (x => x))(prog(t, s.t0, s.t1));
          const v = s.from.map((a, j) => lerp(a, s.to[j], u));
          const op = Math.min(win(t, s.t0, 0.15), 1 - win(t, s.t1 - 0.2, 0.2));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                whiteSpace: 'nowrap',
                fontFamily: F.sans,
                fontSize: s.size,
                color: '#fff',
                letterSpacing: 0,
                lineHeight: 1,
                opacity: op,
                textShadow: `0 0 26px rgba(255,45,126,0.85), 5px 5px 0 ${C.violetDeep}`,
                transform: `translate(-50%, -50%) translate3d(${v[0]}px, ${v[1]}px, ${v[2]}px) rotateY(${v[3]}deg)`,
              }}
            >
              {s.text}
            </div>
          );
        })}
      </div>
      <Svg>
        <Reticle x={rp[0]} y={rp[1]} t={t} lock={lock} />
        {lock > 0.6 ? (
          <Txt x={rp[0] + 120} y={rp[1] - 110} size={34} font={F.latin} fill={C.yellow} ls={8} anchor="start">
            WEAK POINT
          </Txt>
        ) : null}
        {/* HUD */}
        <g transform={`translate(${-500 * (1 - banner)} 0)`}>
          <path d="M-20 50L720 50L680 190L-20 190Z" fill={C.pink} />
          <path d="M-20 196L660 196L654 214L-20 214Z" fill={C.white} />
          <Txt x={70} y={112} size={76} fill={C.white} anchor="start" ls={10}>
            议论开始
          </Txt>
          <Txt x={440} y={112} size={32} font={F.latin} fill={C.ink} anchor="start" ls={4}>
            NONSTOP
          </Txt>
          <Txt x={440} y={152} size={32} font={F.latin} fill={C.ink} anchor="start" ls={4}>
            DEBATE
          </Txt>
        </g>
        <g opacity={banner}>
          <Txt x={1840} y={92} size={30} font={F.latin} fill={C.pink} anchor="end" ls={10}>
            TIME LIMIT
          </Txt>
          <Txt x={1840} y={150} size={64} font={F.latin} fill={C.white} anchor="end" ls={4}>
            {timer}
          </Txt>
        </g>
        <g opacity={banner} transform="translate(960 990)">
          <path d="M-430 -46L430 -46L400 46L-460 46Z" fill={C.ink} opacity={0.85} />
          <path d="M-430 -46L-250 -46L-280 46L-460 46Z" fill={C.yellow} />
          <Txt x={-358} y={0} size={40} fill={C.ink}>
            言弹
          </Txt>
          <Txt x={-220} y={0} size={44} fill={C.white} anchor="start" ls={6}>
            铁板封死的窗户
          </Txt>
          <Txt x={380} y={0} size={26} font={F.latin} fill={C.yellow} anchor="end" ls={6}>
            TRUTH BULLET
          </Txt>
        </g>
      </Svg>
    </>
  );
};

// ═════════════ S7  言弹装填 → 发射（b24–b28） ═════════════
const BULLETS = ['铁板封死的窗户', '黑白熊档案', '电子学生手册', '门锁的钥匙', '血迹的位置', '被打碎的水晶球'];
export const S7Revolver: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(24);
  const u = prog(t, b(24), b(25.5));
  const turns = 2.6;
  const ang = -Math.PI / 2 - (1 - expoOut(u)) * turns * TAU + 0.06 * Math.exp(-Math.max(0, t - b(25.5)) / 0.08) * Math.sin(Math.max(0, t - b(25.5)) * 60);
  const omega = Math.abs(turns * TAU * 6.93 * Math.pow(2, -10 * u)) / b(1.5);
  const locked = t >= b(25.5);
  const ghost = clamp(omega / 20);
  const chambers = (a0: number, op: number, key: string) =>
    BULLETS.map((_, i) => {
      const a = a0 + (i / 6) * TAU;
      const x = 960 + Math.cos(a) * 200, y = 540 + Math.sin(a) * 200;
      return (
        <g key={key + i} opacity={op}>
          <circle cx={x} cy={y} r={86} fill="#141119" />
          <circle cx={x} cy={y} r={70} fill="url(#brass)" />
          <circle cx={x} cy={y} r={70} fill="none" stroke="#8A5A12" strokeWidth={6} />
          <circle cx={x} cy={y} r={24} fill="url(#primer)" />
          {locked && i === 0 ? <circle cx={x} cy={y} r={92} fill="none" stroke={C.yellow} strokeWidth={6} /> : null}
        </g>
      );
    });
  return (
    <Svg>
      <defs>
        <radialGradient id="steel" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#8E8B9A" />
          <stop offset="0.45" stopColor="#45424F" />
          <stop offset="1" stopColor="#15131A" />
        </radialGradient>
        <radialGradient id="brass" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#FFF1B8" />
          <stop offset="0.4" stopColor="#E5B13A" />
          <stop offset="1" stopColor="#7A4E0E" />
        </radialGradient>
        <radialGradient id="primer" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#F2E6D0" />
          <stop offset="1" stopColor="#9A8C78" />
        </radialGradient>
        <radialGradient id="s7glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.pink} stopOpacity={0.55} />
          <stop offset="1" stopColor={C.pink} stopOpacity={0} />
        </radialGradient>
      </defs>
      <BG fill="#0C0712" />
      <circle cx={960} cy={540} r={720} fill="url(#s7glow)" />
      <g fill="none" stroke={C.pink} opacity={0.5}>
        <circle cx={960} cy={540} r={400} strokeWidth={2} strokeDasharray="4 18" transform={`rotate(${lt * 30} 960 540)`} />
        <circle cx={960} cy={540} r={560} strokeWidth={2} strokeDasharray="60 30 6 30" transform={`rotate(${-lt * 20} 960 540)`} />
      </g>
      {/* 弹巢 */}
      <circle cx={960} cy={540} r={332} fill="url(#steel)" />
      {Array.from({length: 6}, (_, i) => {
        const a = ang + ((i + 0.5) / 6) * TAU;
        return <ellipse key={i} cx={960 + Math.cos(a) * 318} cy={540 + Math.sin(a) * 318} rx={48} ry={22} transform={`rotate(${(a * 180) / Math.PI + 90} ${960 + Math.cos(a) * 318} ${540 + Math.sin(a) * 318})`} fill="#0C0A10" />;
      })}
      {ghost > 0.05 ? chambers(ang + 0.16, 0.25 * ghost, 'g1') : null}
      {ghost > 0.05 ? chambers(ang + 0.32, 0.12 * ghost, 'g2') : null}
      {chambers(ang, 1, 'c')}
      <circle cx={960} cy={540} r={64} fill="#22202A" stroke="#6E6A7A" strokeWidth={6} />
      <path d={poly(Array.from({length: 12}, (_, i) => {
        const a = ang + (i / 12) * TAU;
        const r = i % 2 ? 26 : 50;
        return [960 + Math.cos(a) * r, 540 + Math.sin(a) * r] as P;
      }))} fill="#4A4655" />
      {/* 言弹名牌 */}
      {BULLETS.map((name, i) => {
        const a = ang + (i / 6) * TAU;
        const x = 960 + Math.cos(a) * 520, y = 540 + Math.sin(a) * 430;
        const sel = locked && i === 0;
        const op = (1 - ghost * 0.8) * (sel ? 1 : locked ? 0.45 : 1);
        return (
          <g key={i} opacity={op} transform={`translate(${x} ${y}) scale(${sel ? 1 + 0.1 * expoOut(win(t, b(25.5), 0.2)) : 1})`}>
            <path d="M-190 -34L190 -34L176 34L-204 34Z" fill={sel ? C.yellow : C.ink} stroke={sel ? C.yellow : C.pink} strokeWidth={3} />
            <Txt x={-6} y={0} size={40} fill={sel ? C.ink : C.white} ls={4}>
              {name}
            </Txt>
          </g>
        );
      })}
      <Txt x={110} y={110} size={72} fill={C.white} anchor="start" ls={10}>
        言弹装填
      </Txt>
      <Txt x={114} y={170} size={30} font={F.latin} fill={C.pink} anchor="start" ls={14}>
        TRUTH BULLET · LOAD
      </Txt>
    </Svg>
  );
};

/** 侧视子弹特写 + 扳机 */
export const S7Bullet: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(25.5);
  const z = 1 + 0.06 * lt;
  const slide = lerp(380, 0, expoOut(win(lt, 0, 0.3)));
  const shine = prog(t, b(26.4), b(26.9));
  const r = rng(Math.floor(t * 30));
  return (
    <Svg>
      <defs>
        <linearGradient id="case" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7A4E0E" />
          <stop offset="0.25" stopColor="#FFE9A3" />
          <stop offset="0.5" stopColor="#E0A630" />
          <stop offset="1" stopColor="#5C3A08" />
        </linearGradient>
        <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8A2D45" />
          <stop offset="0.3" stopColor="#FFB3C8" />
          <stop offset="0.55" stopColor={C.pink} />
          <stop offset="1" stopColor="#5A0F2A" />
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.85} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id="bulletClip">
          <path d="M360 440L1140 440L1180 452L1290 452Q1560 460 1640 540Q1560 620 1290 628L1180 628L1140 640L360 640L340 628L340 452Z" />
        </clipPath>
      </defs>
      <BG fill="#0C0712" />
      {Array.from({length: 40}, (_, i) => {
        const y = r() * 1080, w = 200 + r() * 900;
        return <rect key={i} x={((r() * 2400 - t * 3000) % 2400) + 2400 - 2400} y={y} width={w} height={2 + r() * 4} fill={i % 3 ? C.pink : C.yellow} opacity={0.25} />;
      })}
      <g transform={`translate(960 540) scale(${z}) translate(${-960 + slide} -540)`}>
        <ellipse cx={1000} cy={560} rx={760} ry={180} fill={C.yellow} opacity={0.12} />
        <g clipPath="url(#bulletClip)">
          <rect x={300} y={430} width={900} height={220} fill="url(#case)" />
          <rect x={1170} y={430} width={500} height={220} fill="url(#head)" />
          <rect x={360} y={430} width={34} height={220} fill="#5C3A08" opacity={0.7} />
          <rect x={420} y={430} width={14} height={220} fill="#FFF3C4" opacity={0.6} />
          <rect x={lerp(100, 1700, shine)} y={420} width={260} height={240} fill="url(#shine)" transform="skewX(-20)" />
        </g>
        <Txt x={780} y={542} size={74} fill="#5C3A08" ls={8} opacity={0.9}>
          铁板封死的窗户
        </Txt>
        <Txt x={778} y={538} size={74} fill="#FFF6D6" ls={8} opacity={0.35}>
          铁板封死的窗户
        </Txt>
      </g>
      <Txt x={960} y={850} size={34} font={F.latin} fill={C.yellow} ls={24} opacity={expoOut(win(lt, 0.1, 0.2))}>
        READY — AIM AT THE WEAK POINT
      </Txt>
    </Svg>
  );
};

/** 发言（正面、SVG 版，用于命中与碎裂） */
export const StatementSvg: React.FC<{x: number; y: number; s: number; hit?: number}> = ({x, y, s, hit = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <text x={0} y={0} fontFamily={F.sans} fontSize={100} textAnchor="middle" dominantBaseline="central" fill={C.white} stroke={C.violetDeep} strokeWidth={10} paintOrder="stroke" strokeLinejoin="round">
      {STATEMENT2[0]}
      <tspan fill={hit > 0 ? C.white : C.yellow}>{STATEMENT2[1]}</tspan>
      {STATEMENT2[2]}
    </text>
  </g>
);

export const S7Shot: React.FC<{t: number}> = ({t}) => {
  const x = prog(t, b(27), b(28));
  const u = clamp(x + 0.13 * Math.sin(TAU * x));
  const zoom = lerp(0.6, 1.35, E.i2(x));
  const tgt: P = [960, 540 + 60 * zoom];
  const start: P = [1760, 1040];
  const pos = V.lerp(start, tgt, u);
  const bs = lerp(1.6, 0.35, u);
  const dir = V.norm(V.sub(tgt, start));
  const ang = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const flash = Math.exp(-(t - b(27)) / 0.05);
  const trail: P[] = [], ws: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    trail.push(V.lerp(V.lerp(start, pos, 0.25), pos, k));
    ws.push(lerp(2, 70 * bs, Math.pow(k, 1.5)));
  }
  return (
    <Svg>
      <BG fill="#0B0414" />
      <SpeedLines cx={tgt[0]} cy={tgt[1]} t={t} n={110} inner={220} col={C.pink} opacity={0.45} seed={8} width={9} />
      <g transform={`translate(960 600) scale(${zoom}) translate(-960 -600)`}>
        <StatementSvg x={960} y={540} s={1} />
      </g>
      {/* 冲击波环 */}
      {Array.from({length: 7}, (_, i) => {
        const ts = b(27) + i * 0.06;
        if (t < ts) return null;
        const age = t - ts;
        const p = V.lerp(start, tgt, clamp((ts - b(27)) / b(1) + 0.13 * Math.sin(TAU * ((ts - b(27)) / b(1)))));
        const sc = lerp(1.4, 0.4, (ts - b(27)) / b(1));
        return <ellipse key={i} cx={p[0]} cy={p[1]} rx={(40 + age * 420) * sc} ry={(90 + age * 900) * sc} transform={`rotate(${ang} ${p[0]} ${p[1]})`} fill="none" stroke={C.white} strokeWidth={4 * sc} opacity={clamp(0.8 - age * 2.2)} />;
      })}
      <path d={ribbonD(trail, ws)} fill={C.yellow} opacity={0.8} />
      <g transform={`translate(${pos[0]} ${pos[1]}) rotate(${ang}) scale(${bs})`}>
        <ellipse cx={-60} cy={0} rx={160} ry={50} fill={C.yellow} opacity={0.35} />
        <path d="M-90 -34L40 -34Q120 -30 150 0Q120 30 40 34L-90 34Z" fill="#FFF0B0" />
        <path d="M40 -34Q120 -30 150 0Q120 30 40 34Z" fill={C.pink} />
      </g>
      {flash > 0.02 ? (
        <g opacity={flash}>
          <path d={poly(burstPts(start[0] - 60, start[1] - 40, 380, 300, 12, 5, 0.35))} fill={C.yellow} />
          <path d={poly(burstPts(start[0] - 60, start[1] - 40, 220, 170, 12, 6, 0.4))} fill={C.white} />
        </g>
      ) : null}
    </Svg>
  );
};

// ═════════════ S8  “那是错的！”（b28–b32） ═════════════
const STMT_SHARDS = glassShards(960, 600, 21, 16, [0, 40, 110, 220, 380, 600, 1000]);
export const FlyShards: React.FC<{shards: Shard[]; src: string; tau: number; cx: number; cy: number; pow?: number; slow?: number; edge?: string}> = ({
  shards,
  src,
  tau,
  cx,
  cy,
  pow = 1,
  slow = 1,
  edge = C.white,
}) => (
  <g>
    <defs>
      {shards.map((s, i) => (
        <clipPath key={i} id={`${src}-c${i}`}>
          <path d={poly(s.pts)} />
        </clipPath>
      ))}
    </defs>
    {shards.map((s, i) => {
      const dir = V.norm(V.sub(s.c, [cx, cy]));
      const sp = (400 + 900 * s.rnd) * pow * (1.3 - Math.min(1, s.ring / 6));
      const tt = tau * slow;
      const off = V.mul(dir, sp * tt);
      const sc = 1 + tt * (0.4 + s.rnd2 * 0.8) * pow;
      const rot = (s.rnd2 - 0.5) * 300 * tt;
      const flip = Math.cos(tt * (2 + 6 * s.rnd));
      const op = clamp(1.4 - tt * 0.9);
      return (
        <g key={i} opacity={op} transform={`translate(${s.c[0] + off[0]} ${s.c[1] + off[1]}) rotate(${rot}) scale(${sc * flip} ${sc}) translate(${-s.c[0]} ${-s.c[1]})`}>
          <g clipPath={`url(#${src}-c${i})`}>
            <use href={`#${src}`} />
          </g>
          <path d={poly(s.pts)} fill="none" stroke={edge} strokeWidth={2.5} opacity={0.7} />
        </g>
      );
    })}
  </g>
);

/** 指向剪影（侧面，指向画面右侧） */
const POINTER = (() => {
  const head = smoothD(Array.from({length: 24}, (_, i) => {
    const a = (i / 24) * TAU;
    return [Math.cos(a) * 112, -230 + Math.sin(a) * 128] as P;
  }));
  const hair = smoothD([[-130, -250], [-170, -330], [-100, -330], [-120, -380], [-40, -350], [0, -400], [40, -350], [110, -340], [120, -260], [60, -300], [-60, -300]]);
  const ahoge = ribbonD([[10, -350], [30, -440], [90, -470], [120, -440]], [26, 18, 10, 3]);
  const torso = smoothD([[-60, -110], [60, -110], [150, -60], [190, 120], [200, 500], [-220, 500], [-200, 120], [-150, -60]]);
  const arm = ribbonD([[90, -40], [330, -90], [560, -140]], [90, 74, 64]);
  const fist = smoothD([[540, -190], [610, -200], [640, -150], [630, -95], [560, -88], [530, -130]]);
  const finger = ribbonD([[600, -178], [690, -196], [730, -204]], [30, 26, 24]);
  const thumb = ribbonD([[560, -110], [610, -112]], [26, 22]);
  return head + hair + ahoge + torso + arm + fist + finger + thumb;
})();

export const S8Wrong: React.FC<{t: number}> = ({t}) => {
  const tau = t - b(28);
  const cutIn = expoOut(win(t, b(28.5), 0.16));
  const cutOut = expoIn(win(t, b(30.3), 0.2));
  const balloon = win(t, b(29), 0.16);
  const jit = (s: number) => noise1(t * 40, s) * 5;
  const charge = prog(t, b(30.5), b(31.75));
  const blackout = t >= b(31.75);
  if (blackout) return <Svg><BG fill="#000" /></Svg>;
  return (
    <Svg>
      <defs>
        <g id="stmtSrc">
          <StatementSvg x={960} y={600} s={1.35} hit={1} />
        </g>
        <radialGradient id="s8core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.white} stopOpacity={0.9} />
          <stop offset="0.12" stopColor={C.pinkHot} stopOpacity={0.75} />
          <stop offset="0.5" stopColor={C.pinkDeep} stopOpacity={0.25} />
          <stop offset="1" stopColor={C.violetDeep} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="s8flash" cx="50%" cy="55%" r="55%">
          <stop offset="0" stopColor={C.yellow} stopOpacity={0.9} />
          <stop offset="0.4" stopColor={C.pink} stopOpacity={0.5} />
          <stop offset="1" stopColor={C.pink} stopOpacity={0} />
        </radialGradient>
      </defs>
      <BG fill="#0B0414" />
      <circle cx={960} cy={600} r={1100} fill="url(#s8flash)" opacity={Math.exp(-tau / 0.3)} />
      {charge > 0 ? (
        <g>
          <circle cx={960} cy={540} r={1000} fill="url(#s8core)" opacity={0.35 + 0.65 * charge} />
          {[30.5, 31].map((x, i) => {
            const a = prog(t, b(x), b(x + 0.5));
            if (t < b(x)) return null;
            return <circle key={i} cx={960} cy={540} r={lerp(1150, 30, E.i2(a))} fill="none" stroke={i ? C.white : C.yellow} strokeWidth={lerp(3, 18, a)} opacity={0.3 + 0.7 * a} />;
          })}
        </g>
      ) : null}
      <SpeedLines cx={960} cy={charge > 0 ? 540 : 600} t={t} n={charge > 0 ? 130 : 80} inner={charge > 0 ? lerp(420, 120, charge) : 500} col={charge > 0 ? C.pinkHot : C.pink} opacity={0.3 + charge * 0.6} seed={12} width={8 + charge * 16} />
      <FlyShards shards={STMT_SHARDS} src="stmtSrc" tau={tau < b(2.5) ? tau : b(2.5) + (tau - b(2.5)) * 0.18} cx={960} cy={600} pow={0.9} />
      {/* 蓄力：“论”“破”两字从两侧加速撞向中心 */}
      {charge > 0 ? (
        <MBlur id="s8gl" x={1 + 36 * charge * charge}>
          <g opacity={clamp(charge * 5)}>
            <Txt x={lerp(150, 735, E.i3(charge))} y={540} size={lerp(330, 400, charge)} fill={C.pink} stroke={C.white} sw={10} rot={-8}>
              论
            </Txt>
            <Txt x={lerp(1770, 1185, E.i3(charge))} y={540} size={lerp(330, 400, charge)} fill={C.pink} stroke={C.white} sw={10} rot={6}>
              破
            </Txt>
          </g>
        </MBlur>
      ) : null}
      {/* 切入：指向剪影 */}
      {cutIn > 0 && cutOut < 1 ? (
        <g transform={`translate(${-1400 * (1 - cutIn) - 1800 * cutOut} 0)`}>
          <defs>
            <clipPath id="s8band">
              <path d="M-100 -50L1180 -50L760 1130L-100 1130Z" />
            </clipPath>
          </defs>
          <g clipPath="url(#s8band)">
            <rect x={-200} y={-200} width={1500} height={1500} fill={C.pink} />
            <SpeedLines cx={700} cy={330} t={t} n={70} inner={200} col={C.white} opacity={0.4} seed={3} width={12} />
            <Halftone step={22} col={C.pinkDeep} fn={(x, y) => clamp((y - 300) / 900) * 0.8} x0={-100} w={1300} />
            <g transform={`translate(${190 + jit(1)} ${600 + jit(2)}) scale(1.1)`}>
              <path d={POINTER} fill={C.yellow} transform="translate(-12 -8)" />
              <path d={POINTER} fill={C.ink} />
            </g>
          </g>
          <path d="M1180 -50L1206 -50L786 1130L760 1130Z" fill={C.white} />
        </g>
      ) : null}
      {balloon > 0 && cutOut < 1 ? (
        <g transform={`translate(${1340 + jit(3) + 1200 * cutOut} ${430 + jit(4)}) rotate(-8) scale(${backOut(balloon, 2.6)})`}>
          <path d={poly(burstPts(0, 0, 560, 300, 16, 9, 0.8))} fill={C.ink} transform="translate(16 16)" />
          <path d={poly(burstPts(0, 0, 560, 300, 16, 9, 0.8))} fill={C.yellow} stroke={C.ink} strokeWidth={12} strokeLinejoin="round" />
          <Txt x={0} y={-10} size={150} fill={C.ink} ls={4} rgb={balloon < 1 ? 8 : 0}>
            那是错的！
          </Txt>
        </g>
      ) : null}
      {balloon > 0 && cutOut < 1 ? (
        <g transform={`translate(${1200 * cutOut} 0)`}>
          <path d={poly([[560, 860], [2000, 760], [2000, 880], [560, 980]])} fill={C.ink} />
          <Txt x={1300 - 120 * expoOut(balloon)} y={862} size={78} font={F.latin} fill={C.white} ls={14} rot={-4}>
            NO, THAT&apos;S WRONG!
          </Txt>
        </g>
      ) : null}
    </Svg>
  );
};

// ═════════════ S9  论破！BREAK（b32–b36） ═════════════
const BREAK_BURST = glassShards(960, 520, 5, 12, [0, 60, 150, 280]);
const SCREEN_SHARDS = glassShards(980, 520, 44, 11, [0, 120, 300, 560, 900, 1500]);
const S9Content: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(32);
  const slam = expoOut(win(lt, 0, 0.14));
  const vib = Math.exp(-lt / 0.4) * 10;
  const sc = lerp(2.6, 1, slam);
  const bandX = -((lt * 2200) % 640);
  return (
    <g>
      <BG fill={C.pink} />
      <Rays cx={960} cy={520} n={26} rot={lt * 0.6} col={C.pinkHot} />
      <Rays cx={960} cy={520} n={13} rot={-lt * 0.3} col={C.yellow} R={2600} />
      <circle cx={960} cy={520} r={430} fill={C.pink} opacity={0.6} />
      <path d={poly(burstPts(960, 520, 820, 470, 20, 3, 0.78))} fill={C.white} />
      <g transform={`translate(${960 + noise1(t * 50, 1) * vib} ${520 + noise1(t * 50, 2) * vib}) rotate(-6) scale(${sc}) translate(-960 -520)`}>
        <Txt x={720} y={500} size={430} fill={C.white} stroke={C.ink} sw={22} depth={[14, 6, 7, C.ink]} rgb={lt < 0.12 ? 22 : 0}>
          论
        </Txt>
        <Txt x={1200} y={500} size={430} fill={C.white} stroke={C.ink} sw={22} depth={[14, 6, 7, C.ink]} rgb={lt < 0.12 ? 22 : 0}>
          破
        </Txt>
        <Txt x={1500} y={560} size={260} fill={C.yellow} stroke={C.ink} sw={18} depth={[8, 5, 6, C.ink]} rot={10}>
          ！
        </Txt>
      </g>
      <g transform="rotate(-7 960 900)">
        <rect x={-300} y={830} width={2600} height={140} fill={C.ink} />
        <rect x={-300} y={818} width={2600} height={6} fill={C.yellow} />
        <rect x={-300} y={976} width={2600} height={6} fill={C.yellow} />
        {Array.from({length: 6}, (_, i) => (
          <Txt key={i} x={bandX - 200 + i * 640} y={902} size={110} font={F.latin} fill={C.yellow} anchor="start" ls={8}>
            BREAK!!
          </Txt>
        ))}
      </g>
    </g>
  );
};
export const S9Break: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(32);
  const crack = expoOut(win(t, b(34), 0.28));
  const fall = t - b(35.25);
  return (
    <Svg>
      <defs>
        <g id="s9src">
          <S9Content t={t} />
          <Cracks shards={SCREEN_SHARDS} cx={980} cy={520} p={crack} col={C.ink} w={9} maxR={1500} />
          <Cracks shards={SCREEN_SHARDS} cx={980} cy={520} p={crack} col={C.white} w={3.5} maxR={1500} />
        </g>
        {SCREEN_SHARDS.map((s, i) => (
          <clipPath key={i} id={`s9c${i}`}>
            <path d={poly(s.pts)} />
          </clipPath>
        ))}
      </defs>
      {fall < 0 ? (
        <use href="#s9src" />
      ) : (
        SCREEN_SHARDS.map((s, i) => {
          const delay = s.ring * 0.03 + s.rnd * 0.08;
          const tt = Math.max(0, fall - delay);
          const dir = V.norm(V.sub(s.c, [980, 520]));
          const off = [dir[0] * 260 * tt + (s.rnd - 0.5) * 300 * tt, dir[1] * 120 * tt + 2600 * tt * tt];
          const rot = (s.rnd2 - 0.5) * 220 * tt;
          const sc = 1 + 0.5 * tt;
          return (
            <g key={i} transform={`translate(${s.c[0] + off[0]} ${s.c[1] + off[1]}) rotate(${rot}) scale(${sc * Math.cos(tt * 3 * s.rnd)} ${sc}) translate(${-s.c[0]} ${-s.c[1]})`}>
              <g clipPath={`url(#s9c${i})`}>
                <use href="#s9src" />
              </g>
              <path d={poly(s.pts)} fill="none" stroke={C.white} strokeWidth={3} opacity={0.8} />
            </g>
          );
        })
      )}
      {/* 爆裂玻璃碎片 */}
      {lt < 1.2
        ? BREAK_BURST.map((s, i) => {
            const tt = lt;
            const dir = V.norm(V.sub(s.c, [960, 520]));
            const sp = 1500 + 1800 * s.rnd;
            const off = V.mul(dir, sp * tt);
            const sc = (0.35 + 0.5 * s.rnd2) * (1 + tt * 2);
            return (
              <path
                key={i}
                d={poly(s.pts)}
                transform={`translate(${s.c[0] + off[0]} ${s.c[1] + off[1] + 600 * tt * tt}) rotate(${(s.rnd - 0.5) * 900 * tt}) scale(${sc}) translate(${-s.c[0]} ${-s.c[1]})`}
                fill={i % 3 ? C.white : C.yellow}
                stroke={C.ink}
                strokeWidth={4}
                opacity={clamp(1.2 - tt * 1.2)}
              />
            );
          })
        : null}
    </Svg>
  );
};

export {courtCam, Glint, line, SliceGlitch};
