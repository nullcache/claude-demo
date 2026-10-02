import React from 'react';
import {P, TAU} from '../lib/math';
import {BG, Svg} from './Act1';
import {Cast, CastId, PixelSprite} from './chars';
import {RED_EYE, RED_EYE_CENTER} from './monokuma';
import {b, backOut, C, clamp, E, expoIn, expoOut, F, H, lerp, noise1, prog, rng, W, win} from './core';
import {bulletCracks, Glint, Halftone, line, poly, Rays, Txt, zigzag} from './ui';

// ═════════════ S10  投票老虎机 → GAME OVER（b35–b40） ═════════════
const REEL: CastId[] = ['lucky', 'detective', 'gambler', 'biker', 'heir', 'programmer', 'idol', 'despair'];
const CULPRIT = 3; // REEL 中的索引：暴走族
const ICON = 300;
const REEL_BG = [C.pink, C.white, C.yellow, C.cyan];

export const S10Vote: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(35);
  const stops = [b(36.5), b(37), b(37.5)];
  const bulbs = Math.floor(t / b(0.25)) % 2;
  const landed = t >= stops[2];
  const coinsT = t - stops[2];
  return (
    <Svg>
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF2A8" />
          <stop offset="0.4" stopColor={C.yellow} />
          <stop offset="1" stopColor={C.orange} />
        </linearGradient>
        <radialGradient id="s10glow" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor={C.pink} stopOpacity={0.6} />
          <stop offset="1" stopColor={C.violetDeep} stopOpacity={0} />
        </radialGradient>
        {[0, 1, 2].map(i => (
          <clipPath key={i} id={`reel${i}`}>
            <rect x={960 + (i - 1) * 360 - 150} y={350} width={300} height={430} rx={18} />
          </clipPath>
        ))}
        <clipPath id="iconClip">
          <circle r={118} />
        </clipPath>
      </defs>
      <BG fill={C.violetDeep} />
      <Rays cx={960} cy={500} n={24} rot={t * 0.4} col="#24103A" />
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="url(#s10glow)" />
      {/* 机身 */}
      <rect x={330} y={240} width={1260} height={640} rx={60} fill="url(#gold)" />
      <rect x={362} y={272} width={1196} height={576} rx={42} fill="#1A0B24" />
      {Array.from({length: 28}, (_, i) => {
        const u = i / 28;
        const per = 2 * (1260 + 640);
        let d = u * per, x = 0, y = 0;
        if (d < 1260) [x, y] = [330 + d, 240];
        else if ((d -= 1260) < 640) [x, y] = [1590, 240 + d];
        else if ((d -= 640) < 1260) [x, y] = [1590 - d, 880];
        else [x, y] = [330, 880 - (d - 1260)];
        const on = (i + bulbs) % 2 === 0;
        return <circle key={i} cx={x} cy={y} r={13} fill={on ? '#FFFDF0' : '#B36A00'} stroke={C.ink} strokeWidth={3} />;
      })}
      {/* 拉杆：第一根卷轴停下时被拉下 */}
      {(() => {
        const pull = Math.sin(Math.PI * clamp((t - b(35.6)) / 0.35));
        const a = (-70 + 95 * pull) * (Math.PI / 180);
        const L = 300;
        return (
          <g>
            <rect x={1670} y={470} width={60} height={160} rx={18} fill="url(#gold)" stroke={C.ink} strokeWidth={6} />
            <path d={`M1700 550L${1700 + Math.cos(a) * L * 0.2} ${550 + Math.sin(a) * L}`} stroke="#C9C4D2" strokeWidth={22} strokeLinecap="round" />
            <circle cx={1700 + Math.cos(a) * L * 0.2} cy={550 + Math.sin(a) * L} r={46} fill={C.red} stroke={C.ink} strokeWidth={6} />
            <circle cx={1688 + Math.cos(a) * L * 0.2} cy={538 + Math.sin(a) * L} r={14} fill="#FF8A9A" />
          </g>
        );
      })()}
      {/* 顶部招牌 */}
      <path d="M560 120L1360 120L1400 250L520 250Z" fill={C.pink} stroke={C.ink} strokeWidth={8} />
      <Txt x={960} y={186} size={92} fill={C.white} stroke={C.ink} sw={10} ls={14}>
        投票时间
      </Txt>
      <Txt x={960} y={306} size={28} font={F.latin} fill={C.yellow} ls={12}>
        VOTE  ·  WHO IS THE BLACKENED?
      </Txt>
      {/* 卷轴 */}
      {[0, 1, 2].map(i => {
        const cx = 960 + (i - 1) * 360;
        const stop = stops[i];
        const N = REEL.length;
        const total = N * ICON;
        // 旋转：匀速滚动 → 在 stop 处回弹落定到犯人
        const targetOff = CULPRIT * ICON + total * (6 + i * 2);
        const spinV = 5200;
        let off: number;
        if (t < stop - 0.12) off = targetOff - (stop - 0.12 - t) * spinV - spinV * 0.06;
        else off = targetOff + 26 * Math.sin(Math.min(1, (t - stop + 0.12) / 0.3) * Math.PI) * Math.exp(-(t - stop + 0.12) * 8) - spinV * 0.06 * (1 - expoOut(clamp((t - stop + 0.12) / 0.12)));
        const moving = t < stop;
        const items: React.ReactNode[] = [];
        for (let k = -2; k <= 2; k++) {
          const raw = off / ICON;
          const idx = Math.floor(raw) + k;
          const frac = raw - Math.floor(raw);
          const y = 565 - (k - frac) * ICON;
          const id = REEL[((idx % N) + N) % N];
          items.push(
            <g key={k} transform={`translate(${cx} ${y})`}>
              <circle r={118} fill={REEL_BG[((idx % 4) + 4) % 4]} />
              <g clipPath="url(#iconClip)">
                <Cast id={id} x={0} y={70} s={0.36} fill={C.ink} rim="" />
              </g>
              <circle r={118} fill="none" stroke={C.ink} strokeWidth={8} />
            </g>,
          );
        }
        return (
          <g key={i}>
            <rect x={cx - 150} y={350} width={300} height={430} rx={18} fill="#F6F0F8" />
            <g clipPath={`url(#reel${i})`} filter={moving ? 'url(#reelBlur)' : undefined}>
              {items}
            </g>
            <rect x={cx - 150} y={350} width={300} height={430} rx={18} fill="url(#reelShade)" />
            <rect x={cx - 150} y={350} width={300} height={430} rx={18} fill="none" stroke={C.ink} strokeWidth={8} />
            {t >= stop ? <rect x={cx - 150} y={350} width={300} height={430} rx={18} fill="none" stroke={C.pink} strokeWidth={10} opacity={Math.exp(-(t - stop) / 0.2)} /> : null}
          </g>
        );
      })}
      <defs>
        <filter id="reelBlur" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="0 26" />
        </filter>
        <linearGradient id="reelShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0.55} />
          <stop offset="0.25" stopColor="#000" stopOpacity={0} />
          <stop offset="0.75" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.55} />
        </linearGradient>
      </defs>
      {/* 中奖：金币喷涌 + 判决 */}
      {landed
        ? Array.from({length: 46}, (_, i) => {
            const r = rng(i * 7 + 3);
            const vx = (r() - 0.5) * 1700, vy = -900 - r() * 1300;
            const x = 960 + vx * coinsT, y = 840 + vy * coinsT + 2600 * coinsT * coinsT;
            const spin = Math.cos(coinsT * (8 + r() * 14) + r() * 6);
            const rr = 22 + r() * 16;
            return (
              <g key={i} transform={`translate(${x} ${y}) scale(${spin} 1)`}>
                <circle r={rr} fill={C.yellow} stroke={C.orange} strokeWidth={5} />
                <circle r={rr * 0.55} fill="none" stroke="#FFF6C8" strokeWidth={3} />
              </g>
            );
          })
        : null}
      {landed ? (
        <g transform={`translate(960 950) scale(${backOut(win(t, stops[2], 0.16), 2.5)})`}>
          <path d="M-420 -60L420 -60L390 60L-450 60Z" fill={C.ink} stroke={C.pink} strokeWidth={5} />
          <Txt x={-20} y={0} size={64} fill={C.white} ls={10}>
            全员一致 · 有罪
          </Txt>
        </g>
      ) : null}
      {void lt}
    </Svg>
  );
};

export const S10GameOver: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(38);
  const step = b(0.125);
  const letters = 'GAME OVER';
  const shown = Math.floor(lt / step) + 1;
  const walk = Math.floor(lt / b(0.5));
  const mx = lerp(-300, 1500, lt / b(2.2));
  const px = 13;
  const blink = lt > b(1.5) && Math.floor(lt / b(0.25)) % 2 === 0;
  return (
    <Svg style={{shapeRendering: 'crispEdges'}}>
      <BG fill="#050307" />
      {/* 像素边框 */}
      <g fill="none" stroke={C.pink} strokeWidth={8} strokeDasharray="24 16">
        <rect x={60} y={60} width={1800} height={960} />
      </g>
      <Txt x={968} y={338} size={140} font={F.pixel} fill={C.pinkDeep} ls={6} style={{shapeRendering: 'crispEdges'}}>
        {letters.slice(0, shown)}
      </Txt>
      <Txt x={960} y={330} size={140} font={F.pixel} fill={blink ? C.white : C.pink} ls={6}>
        {letters.slice(0, shown)}
      </Txt>
      <Txt x={960} y={500} size={34} font={F.pixel} fill={C.white} ls={4} opacity={lt > b(0.9) ? 1 : 0}>
        THE BLACKENED HAS BEEN FOUND GUILTY.
      </Txt>
      <Txt x={960} y={580} size={46} font={F.sans} fill={C.white} ls={10} opacity={lt > b(1.1) ? 1 : 0}>
        犯人已被判定有罪 · 处刑开始
      </Txt>
      <Txt x={960} y={650} size={34} font={F.pixel} fill={C.yellow} ls={4} opacity={lt > b(1.3) && Math.floor(lt / b(0.25)) % 2 === 0 ? 1 : 0}>
        IT&apos;S PUNISHMENT TIME!
      </Txt>
      {/* 像素黑白熊拖着犯人 */}
      <g transform={`translate(0 0)`}>
        <PixelSprite which="prisoner" x={mx - 340} y={958 - 15 * px} px={px} frame={walk} />
        <path d={`M${mx - 340 + 10 * px} ${958 - 6 * px}L${mx + 2 * px} ${958 - 7 * px}`} stroke="#9A97A8" strokeWidth={px * 0.6} strokeDasharray={`${px} ${px * 0.6}`} />
        <PixelSprite which="mono" x={mx} y={958 - 15 * px} px={px} frame={walk + 1} />
      </g>
      <rect x={0} y={958} width={W} height={px} fill="#2A2234" />
    </Svg>
  );
};

// ═════════════ S11  主标题 + 收尾（b40–b48） ═════════════
const SEAM = zigzag(960, -80, 1160, 18, 64, 7);
const GLYPHS: Array<[string, number, number]> = [
  ['弹', 520, -3],
  ['丸', 790, 2],
  ['论', 1130, -2],
  ['破', 1400, 3],
];
const HOLE: P = [1508, 318];
const HOLE_CRACKS = bulletCracks(66);
const EMBERS = Array.from({length: 34}, (_, i) => {
  const r = rng(i * 31 + 5);
  return {x: r() * W, y: r() * H, s: 4 + r() * 10, v: 30 + r() * 90, ph: r() * TAU, pink: r() < 0.7};
});

export const S11Title: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(40);
  const close = expoOut(win(lt, 0, 0.1));
  const push = 1 + 0.035 * E.io2(prog(t, b(41), b(48)));
  const shot = t >= b(42);
  const crack = expoOut(win(t, b(42), 0.22));
  const eye = win(t, b(45), 0.12);
  const eyeGlint = Math.exp(-Math.max(0, t - b(45.1)) / 0.15) * (t >= b(45.1) ? 1 : 0);
  return (
    <Svg>
      <defs>
        <clipPath id="s11L">
          <path d={poly([[-400, -400], ...SEAM.map(([x, y]) => [x, y] as P), [-400, 1500]])} />
        </clipPath>
        <filter id="s11glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <radialGradient id="holeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.pink} stopOpacity={0.95} />
          <stop offset="1" stopColor={C.pink} stopOpacity={0} />
        </radialGradient>
      </defs>
      <BG fill="#111014" />
      <g transform={`translate(${-1000 * (1 - close)} 0)`}>
        <rect x={-400} y={-200} width={1500} height={1500} fill="#F8F7F5" clipPath="url(#s11L)" />
      </g>
      <Halftone step={26} col="#E6E1EA" fn={(x, y) => (x < 960 ? clamp((960 - x) / 1600 + (y - 600) / 2400) : 0)} />
      <Halftone step={26} col="#1E1C24" fn={(x, y) => (x > 960 ? clamp((x - 960) / 1600 + (600 - y) / 2400) : 0)} />
      <path d={line(SEAM)} fill="none" stroke={C.pink} strokeWidth={14} filter="url(#s11glow)" opacity={0.85} />
      <path d={line(SEAM)} fill="none" stroke={C.pink} strokeWidth={5} />
      {/* 飘散的粉色余烬 */}
      {EMBERS.map((e, i) => {
        const y = ((((e.y - lt * e.v) % (H + 100)) + H + 100) % (H + 100)) - 50;
        const x = e.x + 30 * Math.sin(lt * 1.3 + e.ph);
        return <rect key={i} x={x} y={y} width={e.s} height={e.s} fill={e.pink ? C.pink : C.white} opacity={0.5 * prog(lt, 0.2, 1)} transform={`rotate(${lt * 90 + e.ph * 50} ${x} ${y})`} />;
      })}
      <g transform={`translate(960 520) scale(${push}) translate(-960 -520)`}>
        {GLYPHS.map(([ch, x, rot], i) => {
          const q = win(t, b(40) + 0.1 + i * b(0.5) - (i === 0 ? 0 : 0.1), 0.16);
          if (q <= 0) return null;
          const e = expoOut(q);
          const dark = x > 960;
          const sc = lerp(1.9, 1, e);
          const j = Math.exp(-(t - b(40) - i * b(0.5)) / 0.15) * 8;
          return (
            <g key={i} transform={`translate(${x + noise1(t * 50, i) * j} 420) rotate(${lerp(rot * 4, rot, e)}) scale(${sc})`} opacity={Math.min(1, q * 4)}>
              <Txt x={14} y={14} size={290} font={F.sans} fill={C.pink}>
                {ch}
              </Txt>
              <Txt x={0} y={0} size={290} font={F.sans} fill={dark ? C.white : C.ink}>
                {ch}
              </Txt>
            </g>
          );
        })}
        {/* 弹孔 */}
        {shot ? (
          <g>
            <circle cx={HOLE[0]} cy={HOLE[1]} r={120} fill="url(#holeGlow)" opacity={0.35 + 0.65 * Math.exp(-(t - b(42)) / 0.3)} />
            <g transform={`translate(${HOLE[0]} ${HOLE[1]})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
              {HOLE_CRACKS.map((c, i) => (
                <path key={'g' + i} d={line(c.pts)} pathLength={1} strokeDasharray={`${crack} 2`} stroke={C.pink} strokeWidth={c.w * 3} opacity={0.55} filter="url(#s11glow)" />
              ))}
              {HOLE_CRACKS.map((c, i) => (
                <path key={'c' + i} d={line(c.pts)} pathLength={1} strokeDasharray={`${crack} 2`} stroke={i % 3 ? C.white : '#FFC2DA'} strokeWidth={c.w} />
              ))}
            </g>
            <path d={poly(Array.from({length: 14}, (_, i) => {
              const a = (i / 14) * TAU;
              const r = i % 2 ? 22 : 34;
              return [HOLE[0] + Math.cos(a) * r, HOLE[1] + Math.sin(a) * r] as P;
            }))} fill={C.ink} stroke={C.pink} strokeWidth={4} />
            <Glint x={HOLE[0]} y={HOLE[1]} s={2.2 * Math.exp(-(t - b(42)) / 0.12)} col="#FFE1EC" />
          </g>
        ) : null}
        {/* DANGANRONPA */}
        {'DANGANRONPA'.split('').map((ch, i) => {
          const q = expoOut(win(t, b(41.5) + i * 0.025, 0.2));
          if (q <= 0) return null;
          const x = i < 6 ? 655 + (i - 2.5) * 78 : 1270 + (i - 8) * 78;
          return (
            <Txt key={i} x={x} y={688 + 30 * (1 - q)} size={86} font={F.latin} fill={C.pink} opacity={q}>
              {ch}
            </Txt>
          );
        })}
        {/* 副标题：接缝即“与” */}
        <g opacity={expoOut(win(t, b(43), 0.3))}>
          <Txt x={900} y={830} size={50} font={F.serif} fill={C.ink} anchor="end" ls={12}>
            {'希望的学园'.slice(0, Math.floor((t - b(43)) / 0.05) + 1)}
          </Txt>
          <Txt x={1022} y={830} size={50} font={F.serif} fill={C.white} anchor="start" ls={12}>
            {'绝望的高中生'.slice(0, Math.floor((t - b(43)) / 0.05) + 1)}
          </Txt>
          <rect x={560} y={876} width={340} height={4} fill={C.pink} />
          <rect x={1022} y={876} width={340} height={4} fill={C.pink} />
        </g>
      </g>
      {/* 收尾：黑侧的红眼 + 噗噗噗 */}
      {eye > 0 ? (
        <g>
          <g transform={`translate(1700 900) scale(${1.05 * expoOut(eye)})`}>
            <path d={poly(RED_EYE.map(([x, y]) => [x - RED_EYE_CENTER[0], y - RED_EYE_CENTER[1]] as P))} fill={C.red} filter="url(#s11glow)" opacity={0.7} />
            <path d={poly(RED_EYE.map(([x, y]) => [x - RED_EYE_CENTER[0], y - RED_EYE_CENTER[1]] as P))} fill="#C8102A" stroke="#4A0010" strokeWidth={6} />
          </g>
          <Glint x={1716} y={882} s={1.5 * eyeGlint} col="#FFD7DD" />
          <Txt x={1700} y={1000} size={56} font={F.pop} fill={C.pink} ls={8} opacity={expoOut(win(t, b(45.5), 0.2))}>
            噗噗噗
          </Txt>
        </g>
      ) : null}
      <Txt x={110} y={1010} size={24} font={F.latin} fill="#8B8794" anchor="start" ls={8} opacity={expoOut(win(t, b(44), 0.4))}>
        FAN-MADE TRIBUTE PV · UNOFFICIAL
      </Txt>
    </Svg>
  );
};

export {backOut, expoIn};
