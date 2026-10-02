import React from 'react';
import {P} from '../lib/math';
import {circleD} from '../lib/shapes';
import {Cast, CastId} from './chars';
import {MonoDefs, Monokuma, MonoSilhouette, RED_EYE_CENTER} from './monokuma';
import {b, backOut, C, clamp, E, expoIn, expoIO, expoOut, F, H, lerp, noise1, prog, rng, W, win} from './core';
import {DialogueBox, Glint, Halftone, line, poly, Rays, SpeedLines, Splat, splatGeom, Txt, zigzag} from './ui';

export const Svg: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0, overflow: 'visible', ...style}}>
    {children}
  </svg>
);
const BG: React.FC<{fill: string}> = ({fill}) => <rect x={-200} y={-200} width={W + 400} height={H + 400} fill={fill} />;

/** 横向切片故障：把内容切成若干水平条并随机错位 */
export const SliceGlitch: React.FC<{id: string; amt: number; seed: number; n?: number; y0?: number; y1?: number; children: React.ReactNode}> = ({
  id,
  amt,
  seed,
  n = 7,
  y0 = 0,
  y1 = H,
  children,
}) => {
  if (amt < 0.5) return <>{children}</>;
  const r = rng(seed);
  const cuts = [y0, ...Array.from({length: n - 1}, () => lerp(y0, y1, r())).sort((a, c) => a - c), y1];
  return (
    <g>
      <defs>
        {cuts.slice(0, -1).map((y, i) => (
          <clipPath id={`${id}-${i}`} key={i}>
            <rect x={-200} y={y} width={W + 400} height={cuts[i + 1] - y} />
          </clipPath>
        ))}
      </defs>
      {cuts.slice(0, -1).map((_, i) => (
        <g key={i} clipPath={`url(#${id}-${i})`} transform={`translate(${((r() - 0.5) * 2 * amt).toFixed(1)} 0)`}>
          {children}
        </g>
      ))}
    </g>
  );
};

// ═════════════ S1  希望 | 绝望 → 黑白熊（b0–b4） ═════════════
const SEAM = zigzag(960, -60, 1140, 20, 60, 7);
const seamLen = SEAM.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - SEAM[i - 1][0], p[1] - SEAM[i - 1][1]) : 0), 0);
const MONO_Y = 452;
const MONO_S = 0.84;
const BIG = 5.2; // 拉远前：头部轮廓放大到覆盖整个画面

export const S1Split: React.FC<{t: number}> = ({t}) => {
  // 拉镜：b3 → b4
  const zp = expoIO(win(t, b(3), b(1) * 0.92));
  const z = lerp(1, MONO_S / BIG, zp);
  const draw = expoOut(win(t, 0, 0.36));
  const fillL = expoOut(win(t, b(1), 0.22));
  const fillR = t >= b(2) ? 1 : 0;
  const hopeIn = win(t, b(1), 0.3);
  const despIn = win(t, b(2), 0.3);
  const wordsOut = 1 - prog(t, b(3.15), b(3.6));
  const faceIn = prog(t, b(3.55), b(3.95));
  const glitch = t >= b(2) && t < b(2) + 0.22 ? 40 * (1 - (t - b(2)) / 0.22) : 0;
  const xL = fillL >= 1 ? -4000 : lerp(960, -40, fillL);
  // 世界坐标 → 屏幕：以 (960, MONO_Y) 为锚点缩放
  const world = `translate(960 ${MONO_Y}) scale(${z}) translate(-960 ${-MONO_Y})`;
  const headT = `translate(960 ${MONO_Y}) scale(${BIG})`;
  const seamHead = SEAM[0];
  const seamDrawLen = seamLen * draw;
  // 画线笔头位置
  let acc = 0, tip: P = SEAM[0];
  for (let i = 1; i < SEAM.length; i++) {
    const l = Math.hypot(SEAM[i][0] - SEAM[i - 1][0], SEAM[i][1] - SEAM[i - 1][1]);
    if (acc + l >= seamDrawLen) {
      const u = (seamDrawLen - acc) / l;
      tip = [lerp(SEAM[i - 1][0], SEAM[i][0], u), lerp(SEAM[i - 1][1], SEAM[i][1], u)];
      break;
    }
    acc += l;
    tip = SEAM[i];
  }
  void seamHead;
  const reveal = zp > 0.001;
  return (
    <Svg>
      <MonoDefs />
      <defs>
        <clipPath id="s1head">
          <MonoSilhouette transform={headT} />
        </clipPath>
        <filter id="s1glow" x="-50%" y="-10%" width="200%" height="120%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      {reveal ? <S2Backdrop t={t} k={zp} /> : <BG fill={C.ink} />}
      <g transform={world}>
        {reveal ? (
          <g fill={C.ink} transform={`translate(960 ${MONO_Y}) scale(${BIG})`}>
            <MonoSilhouette grow={18} />
          </g>
        ) : null}
        <g clipPath={reveal ? 'url(#s1head)' : undefined}>
          <rect x={-3000} y={-3000} width={9000} height={9000} fill={fillR ? '#111014' : C.ink} />
          {fillL > 0 ? <path d={poly([[xL, -4000], [960, -4000], ...SEAM, [960, 5000], [xL, 5000]])} fill="#F8F7F5" /> : null}
          {fillL > 0 && fillL < 1 ? <path d={poly([[xL - 30, -200], [xL, -200], [xL, H + 200], [xL - 30, H + 200]])} fill={C.pink} /> : null}
          {/* 希望 */}
          {hopeIn > 0 ? (
            <g opacity={wordsOut}>
              <Txt x={480} y={300} size={58} font={F.latin} fill={C.ink} ls={lerp(60, 34, expoOut(hopeIn))}>
                HOPE
              </Txt>
              <Txt x={480} y={530} size={300} fill={C.ink} ls={lerp(90, 14, expoOut(hopeIn))} sx={lerp(1.25, 1, expoOut(hopeIn))} sy={lerp(1.25, 1, expoOut(hopeIn))}>
                希望
              </Txt>
              <Txt x={480} y={760} size={46} fill={C.ink} ls={12} opacity={prog(t, b(1.4), b(1.8))}>
                超高校级的希望
              </Txt>
            </g>
          ) : null}
          {/* 绝望 */}
          {despIn > 0 ? (
            <SliceGlitch id="s1g" amt={glitch} seed={Math.floor(t * 60)} y0={180} y1={860}>
              <g opacity={wordsOut}>
                <Txt x={1440} y={300} size={58} font={F.latin} fill={C.pink} ls={lerp(60, 34, expoOut(despIn))}>
                  DESPAIR
                </Txt>
                <Txt x={1440} y={530} size={300} fill={C.pink} ls={lerp(90, 14, expoOut(despIn))} rgb={glitch > 0 ? 14 : 0} sx={lerp(1.25, 1, expoOut(despIn))} sy={lerp(1.25, 1, expoOut(despIn))}>
                  绝望
                </Txt>
                <Txt x={1440} y={760} size={46} fill={C.pink} ls={12} opacity={prog(t, b(2.4), b(2.8))}>
                  超高校级的绝望
                </Txt>
              </g>
            </SliceGlitch>
          ) : null}
        </g>
        {/* 裂缝线 */}
        <g opacity={1 - zp}>
          <path d={line(SEAM)} fill="none" stroke={C.pink} strokeWidth={16} strokeDasharray={`${seamDrawLen} 99999`} filter="url(#s1glow)" opacity={0.9} />
          <path d={line(SEAM)} fill="none" stroke={C.white} strokeWidth={5} strokeDasharray={`${seamDrawLen} 99999`} strokeLinejoin="miter" />
        </g>
      </g>
      {draw < 1 ? <Glint x={tip[0]} y={tip[1]} s={0.9} col={C.white} /> : null}
      {faceIn > 0 ? (
        <g opacity={faceIn}>
          <Monokuma x={960} y={MONO_Y} s={MONO_S} face={1} grin={0.2} glow={0} body />
        </g>
      ) : null}
    </Svg>
  );
};

// ═════════════ S2  黑白熊登场 + 校规（b4–b8） ═════════════
const S2Backdrop: React.FC<{t: number; k?: number}> = ({t, k = 1}) => (
  <g opacity={k}>
    <BG fill={C.pink} />
    <Rays cx={960} cy={MONO_Y} n={22} rot={t * 0.35} col="#F01C70" />
    <Halftone step={30} col={C.pinkDeep} fn={(x, y) => clamp(Math.hypot(x - 960, y - 560) / 1100 - 0.18) * 0.95} />
    <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="url(#s2vig)" />
    <defs>
      <radialGradient id="s2vig" cx="50%" cy="54%" r="70%">
        <stop offset="55%" stopColor={C.pinkDark} stopOpacity={0} />
        <stop offset="100%" stopColor={C.pinkDark} stopOpacity={0.75} />
      </radialGradient>
    </defs>
  </g>
);

const PUFFS: Array<[number, number, number, number]> = [
  [470, 250, -14, 0],
  [1470, 290, 12, 1],
  [380, 800, 9, 2],
  [1560, 820, -11, 3],
];
export const S2Mono: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(4);
  const eighth = b(0.5);
  const ph = (lt / eighth) % 1;
  const bounce = Math.pow(Math.sin(Math.PI * ph), 2);
  const eye = Math.exp(-Math.max(0, lt) / 0.18);
  const ex = 960 + RED_EYE_CENTER[0] * MONO_S, ey = MONO_Y - 18 * bounce + RED_EYE_CENTER[1] * MONO_S;
  const push = 1 + 0.06 * expoOut(prog(t, b(4), b(6)));
  return (
    <Svg>
      <MonoDefs />
      <S2Backdrop t={t} />
      <SpeedLines cx={960} cy={MONO_Y} t={t} n={60} inner={520} col={C.white} opacity={0.22} seed={4} width={10} />
      <g transform={`translate(960 ${MONO_Y}) scale(${push}) translate(-960 ${-MONO_Y})`}>
        <Monokuma x={960} y={MONO_Y - 18 * bounce} s={MONO_S} sq={0.035 * bounce} rot={3 * Math.sin(lt * 15)} face={1} glow={0.6 + eye} grin={0.25 + 0.75 * bounce} body />
        <Glint x={ex} y={ey} s={1.6 * eye + 0.25 * bounce} col="#FFE3E8" rot={lt * 40} />
      </g>
      {PUFFS.map(([x, y, rot, i]) => {
        const t0 = b(4.25) + i * eighth;
        const p = win(t, t0, 0.14);
        if (p <= 0) return null;
        const j = noise1(t * 30, i) * 6;
        return (
          <Txt key={i} x={x + j} y={y} size={170} font={F.pop} fill={C.white} stroke={C.ink} sw={16} rot={rot + j * 0.3} sx={backOut(p, 3)} sy={backOut(p, 3)} depth={[5, 3, 4, C.pinkDeep]}>
            噗
          </Txt>
        );
      })}
      <Txt x={960} y={1010} size={36} font={F.latin} fill={C.white} ls={26} opacity={0.85 * prog(t, b(4.6), b(5.2))}>
        UPUPUPU...
      </Txt>
    </Svg>
  );
};

/** 校规卡：“想要毕业的话——” / “就去杀掉某个人吧。” */
export const S2Rules: React.FC<{t: number}> = ({t}) => {
  if (t < b(7)) {
    const p = t - b(6);
    const chars = '想要毕业的话'.split('');
    return (
      <Svg>
        <BG fill={C.paper} />
        <Halftone step={22} col="#E4DED6" fn={(x, y) => clamp((x + y) / 3000)} />
        <rect x={0} y={0} width={36} height={H} fill={C.pink} />
        <path d="M150 210L560 210L548 262L138 262Z" fill={C.ink} />
        <Txt x={168} y={236} size={30} font={F.sans} fill={C.white} anchor="start" ls={8}>
          校规 · 第一条
        </Txt>
        <Txt x={600} y={236} size={30} font={F.latin} fill={C.ink} anchor="start" ls={10}>
          SCHOOL REGULATION No.01
        </Txt>
        {chars.map((ch, i) => {
          const q = win(p, i * 0.022, 0.12);
          if (q <= 0) return null;
          const e = expoOut(q);
          return (
            <Txt key={i} x={210 + i * 218} y={520} size={210} fill={C.ink} sx={lerp(1.9, 1, e)} sy={lerp(1.9, 1, e)} opacity={Math.min(1, q * 3)}>
              {ch}
            </Txt>
          );
        })}
        <rect x={150} y={680} width={lerp(0, 1360, expoOut(win(p, 0.12, 0.3)))} height={22} fill={C.pink} />
        <Txt x={150} y={790} size={44} fill={C.ink} anchor="start" ls={6} opacity={prog(p, 0.18, 0.3)}>
          —— 唯一的离开方法
        </Txt>
      </Svg>
    );
  }
  const p = t - b(7);
  const e = expoOut(win(p, 0, 0.16));
  const splat = splatGeom(91, 190);
  return (
    <Svg>
      <BG fill={C.ink} />
      <Splat g={splat} x={760} y={480} p={win(p, 0.02, 0.3)} drip={win(p, 0.2, 1.2)} col={C.pinkDeep} rot={20} />
      <Txt x={300} y={500} size={190} fill={C.white} anchor="middle" opacity={e} sx={lerp(1.4, 1, e)} sy={lerp(1.4, 1, e)}>
        就去
      </Txt>
      <Txt x={760} y={480} size={420} fill={C.pink} stroke={C.ink} sw={10} rot={-4} rgb={p < 0.12 ? 18 : 0} sx={lerp(2.4, 1, expoOut(win(p, 0.04, 0.16)))} sy={lerp(2.4, 1, expoOut(win(p, 0.04, 0.16)))}>
        杀
      </Txt>
      <Txt x={1350} y={500} size={190} fill={C.white} opacity={expoOut(win(p, 0.09, 0.14))}>
        掉某人
      </Txt>
      <Txt x={960} y={800} size={50} fill={C.white} ls={10} opacity={expoOut(win(p, b(0.5), 0.2))}>
        ※ 并且，不能被任何人发现。
      </Txt>
      <Txt x={960} y={890} size={30} font={F.latin} fill={C.pink} ls={18} opacity={expoOut(win(p, b(0.5), 0.2))}>
        KILL SOMEONE  ·  DON'T GET CAUGHT
      </Txt>
    </Svg>
  );
};

// ═════════════ S3  希望之峰学园 + 超高校级（b8–b12） ═════════════
/** 仰视透视：越高越窄 */
const persp = (x: number, y: number, k = 0.34, gy = 1120): P => {
  const h = clamp((gy - y) / 1400, 0, 1.2);
  return [960 + (x - 960) * (1 - k * h), y];
};
const pq = (x0: number, y0: number, x1: number, y1: number) => poly([persp(x0, y0), persp(x1, y0), persp(x1, y1), persp(x0, y1)]);

export const S3Academy: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(8);
  const push = 1 + 0.08 * E.o2(clamp(lt / b(1)));
  const rise = 40 * E.o2(clamp(lt / b(1)));
  const wins: React.ReactNode[] = [];
  const r = rng(5);
  const block = (x0: number, x1: number, y0: number, y1: number, cols: number, rows: number, key: string) => {
    const cw = (x1 - x0) / cols, rh = (y1 - y0) / rows;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const wx = x0 + i * cw + cw * 0.22, wy = y0 + j * rh + rh * 0.22;
        const ww = cw * 0.56, wh = rh * 0.56;
        const lit = r() < 0.18;
        wins.push(<path key={`${key}${i}-${j}`} d={pq(wx, wy, wx + ww, wy + wh)} fill={lit ? '#FF7FB2' : '#3A3446'} opacity={lit ? 0.9 : 1} />);
        // 铁板 + 铆钉
        if (!lit) {
          const pts = [persp(wx + 4, wy + 4), persp(wx + ww - 4, wy + 4), persp(wx + ww - 4, wy + wh - 4), persp(wx + 4, wy + wh - 4)];
          wins.push(
            <g key={`${key}r${i}-${j}`} fill="#8E8B9A">
              {pts.map((p, k) => (
                <circle key={k} cx={p[0]} cy={p[1]} r={2.4} />
              ))}
            </g>,
          );
        }
      }
  };
  block(240, 760, 650, 1080, 6, 5, 'L');
  block(1160, 1680, 650, 1080, 6, 5, 'R');
  block(810, 1110, 440, 1080, 3, 9, 'C');
  return (
    <Svg>
      <defs>
        <linearGradient id="s3sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.violetDeep} />
          <stop offset="0.55" stopColor="#5A0F45" />
          <stop offset="1" stopColor={C.pink} />
        </linearGradient>
      </defs>
      <BG fill="url(#s3sky)" />
      <Halftone step={24} col="#FF6FA8" fn={(x, y) => clamp((y - 380) / 900) * 0.55} />
      <circle cx={960} cy={330 - 30 * E.o2(clamp(lt / b(1)))} r={250} fill="#FFC2DA" opacity={0.92} />
      <circle cx={960} cy={330 - 30 * E.o2(clamp(lt / b(1)))} r={290} fill="none" stroke="#FFC2DA" strokeWidth={3} opacity={0.35} />
      <g transform={`translate(960 1080) scale(${push}) translate(-960 ${-1080 + rise})`}>
        {/* 探照灯 */}
        {[0, 1].map(i => {
          const a = -Math.PI / 2 + (i ? 1 : -1) * (0.35 + 0.18 * Math.sin(t * 2.2 + i * 2));
          const x0 = i ? 1500 : 420, y0 = 1080;
          const L = 1600, w = 0.07;
          return (
            <path
              key={i}
              d={poly([[x0, y0], [x0 + Math.cos(a - w) * L, y0 + Math.sin(a - w) * L], [x0 + Math.cos(a + w) * L, y0 + Math.sin(a + w) * L]])}
              fill="#FFD0E4"
              opacity={0.13}
            />
          );
        })}
        {/* 主体 */}
        <path d={pq(200, 620, 1720, 1100)} fill="#1A1222" />
        <path d={pq(780, 300, 1140, 1100)} fill="#140D1B" />
        <path d={poly([persp(750, 310), persp(1170, 310), persp(960, 150)])} fill="#140D1B" />
        <path d={pq(960 - 6, 60, 960 + 6, 160)} fill="#140D1B" />
        <path d={pq(200, 604, 1720, 628)} fill="#2C2236" />
        <path d={pq(770, 296, 1150, 318)} fill="#2C2236" />
        {wins}
        {/* 校徽 */}
        <g transform={`translate(${persp(960, 370)[0]} 370)`}>
          <circle r={58} fill="#2C2236" stroke={C.pink} strokeWidth={5} />
          <path d="M0 -40L30 22L0 8L-30 22Z" fill={C.pink} />
          <circle r={70} fill="none" stroke={C.pink} strokeWidth={2} opacity={0.6} />
        </g>
      </g>
      {/* 竖排标题 */}
      <g opacity={expoOut(win(lt, 0.05, 0.25))}>
        {'希望之峰学园'.split('').map((ch, i) => (
          <Txt key={i} x={1770} y={190 + i * 128} size={116} font={F.serif} fill={C.white} opacity={expoOut(win(lt, 0.05 + i * 0.03, 0.18))}>
            {ch}
          </Txt>
        ))}
        <Txt x={1660} y={540} size={30} font={F.latin} fill={C.pink} ls={14} rot={90}>
          HOPE&apos;S PEAK ACADEMY
        </Txt>
      </g>
      <g opacity={expoOut(win(lt, 0.1, 0.25))}>
        <rect x={130} y={140} width={8} height={150} fill={C.pink} />
        <Txt x={160} y={180} size={44} fill={C.white} anchor="start" ls={8}>
          只招收“超高校级”的天才
        </Txt>
        <Txt x={160} y={250} size={28} font={F.latin} fill={C.white} anchor="start" ls={10} opacity={0.75}>
          THE ACADEMY OF THE ULTIMATES
        </Txt>
      </g>
    </Svg>
  );
};

/** 插入镜头：被铁板封死的窗户（伏笔） */
export const S3Window: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(9);
  const z = lerp(1.22, 1, expoOut(clamp(lt / 0.3)));
  const rivets: P[] = [];
  for (let i = 0; i < 6; i++) {
    rivets.push([330 + i * 252, 190], [330 + i * 252, 890]);
  }
  for (let j = 1; j < 4; j++) rivets.push([330, 190 + j * 175], [1590, 190 + j * 175]);
  return (
    <Svg>
      <defs>
        <linearGradient id="s3m" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6B6878" />
          <stop offset="0.5" stopColor="#3F3C49" />
          <stop offset="1" stopColor="#2A2832" />
        </linearGradient>
        <radialGradient id="s3rv" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#E9E6F0" />
          <stop offset="0.5" stopColor="#7C7889" />
          <stop offset="1" stopColor="#25232C" />
        </radialGradient>
      </defs>
      <BG fill="#120C18" />
      <g transform={`translate(960 540) scale(${z}) translate(-960 -540)`}>
        {/* 窗框 */}
        <rect x={180} y={60} width={1560} height={960} fill="#2A2236" />
        <rect x={240} y={110} width={1440} height={860} fill="url(#s3m)" />
        {/* 划痕 */}
        {Array.from({length: 18}, (_, i) => {
          const rr = rng(i + 40);
          const x = 260 + rr() * 1400, y = 140 + rr() * 800, l = 60 + rr() * 220, a = -0.4 + rr() * 0.3;
          return <path key={i} d={`M${x} ${y}l${l * Math.cos(a)} ${l * Math.sin(a)}`} stroke="#A9A5B8" strokeWidth={1.6} opacity={0.35} />;
        })}
        <path d="M240 540L1680 540" stroke="#25232C" strokeWidth={8} />
        <path d="M960 110L960 970" stroke="#25232C" strokeWidth={8} />
        {rivets.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x + 3} cy={y + 5} r={30} fill="#16141B" opacity={0.6} />
            <circle cx={x} cy={y} r={28} fill="url(#s3rv)" />
          </g>
        ))}
        {/* 粉色反光扫过 */}
        <path d={poly([[lerp(-400, 2200, prog(lt, 0, 0.45)), 110], [lerp(-250, 2350, prog(lt, 0, 0.45)), 110], [lerp(-650, 1950, prog(lt, 0, 0.45)), 970], [lerp(-800, 1800, prog(lt, 0, 0.45)), 970]])} fill={C.pink} opacity={0.25} />
      </g>
      <g opacity={expoOut(win(lt, 0.06, 0.2))}>
        <path d="M120 820L900 820L880 960L100 960Z" fill={C.ink} opacity={0.9} />
        <path d="M120 790L330 790L322 828L112 828Z" fill={C.yellow} />
        <Txt x={128} y={810} size={26} font={F.latin} fill={C.ink} anchor="start" ls={8}>
          EVIDENCE
        </Txt>
        <Txt x={150} y={892} size={56} fill={C.white} anchor="start" ls={4}>
          所有窗户 · 被铁板封死
        </Txt>
      </g>
    </Svg>
  );
};

const ROSTER: Array<[CastId, string, string]> = [
  ['lucky', '幸运', 'LUCKY STUDENT'],
  ['idol', '偶像', 'POP SENSATION'],
  ['detective', '侦探', 'DETECTIVE'],
  ['gambler', '赌徒', 'GAMBLER'],
  ['biker', '暴走族', 'BIKER GANG LEADER'],
  ['heir', '大少爷', 'AFFLUENT PRODIGY'],
];
export const S3Roster: React.FC<{t: number}> = ({t}) => {
  const step = b(0.25);
  const idx = Math.floor((t - b(10)) / step);
  if (idx < ROSTER.length) {
    const [id, title, en] = ROSTER[Math.max(0, idx)];
    const lt = t - b(10) - idx * step;
    const e = expoOut(clamp(lt / step));
    const dark = idx % 2 === 0;
    const bgA = dark ? C.ink : C.pink, bgB = dark ? C.pink : C.ink;
    return (
      <Svg>
        <BG fill={bgA} />
        <path d={poly([[1060 + 40 * (1 - e), -100], [2100, -100], [2100, 1200], [760 + 40 * (1 - e), 1200]])} fill={bgB} />
        <Halftone step={20} col={dark ? '#2A2030' : C.pinkDeep} fn={(x, y) => clamp(1 - x / 1300) * 0.7 * clamp(y / 1080 + 0.2)} />
        <Cast id={id} x={1470 - 60 * (1 - e)} y={540} s={1.3} fill={C.ink} rim={dark ? C.white : C.pink} rimDx={-12} />
        <Txt x={160} y={300} size={44} font={F.latin} fill={dark ? C.pink : C.ink} anchor="start" ls={10}>
          {`No.0${idx + 1}`}
        </Txt>
        <Txt x={160} y={410} size={74} fill={C.white} anchor="start" ls={10}>
          超高校级的
        </Txt>
        <Txt x={150 - 80 * (1 - e)} y={600} size={title.length > 2 ? 190 : 230} fill={dark ? C.pink : C.white} stroke={C.ink} sw={dark ? 0 : 8} anchor="start" ls={10}>
          {title}
        </Txt>
        <Txt x={160} y={780} size={42} font={F.latin} fill={C.white} anchor="start" ls={14} opacity={0.85}>
          {`ULTIMATE ${en}`}
        </Txt>
      </Svg>
    );
  }
  // 超高校级的「绝望」
  const lt = t - b(11.5);
  const g = 30 * Math.abs(noise1(t * 40, 3));
  return (
    <Svg>
      <BG fill="#0B0003" />
      <SliceGlitch id="s3d" amt={g} seed={Math.floor(t * 60) + 9}>
        <Cast id="despair" x={1470} y={540} s={1.3} fill="#000" rim={C.red} rimDx={-14} />
        <Txt x={160} y={410} size={74} fill={C.white} anchor="start" ls={10}>
          超高校级的
        </Txt>
        <Txt x={150} y={600} size={230} fill={C.red} anchor="start" ls={10} rgb={10 + g * 0.4}>
          绝望
        </Txt>
        <Txt x={160} y={780} size={42} font={F.latin} fill={C.red} anchor="start" ls={14}>
          ULTIMATE DESPAIR
        </Txt>
      </SliceGlitch>
      <rect x={0} y={0} width={W} height={H} fill={C.red} opacity={0.12 * (1 - clamp(lt / 0.1))} />
    </Svg>
  );
};

// ═════════════ S4  尸体发现 → 学级裁判电梯（b12–b16） ═════════════
const SPLAT4 = splatGeom(33, 250);
export const S4Body: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(12);
  const sp = win(lt, 0, 0.28);
  const st = expoOut(win(lt, b(0.25), 0.14));
  const rot = 2 * Math.sin(lt * 1.2);
  return (
    <Svg>
      <BG fill={C.paper} />
      <Halftone step={18} col="#E7E1DA" fn={(x, y) => clamp(Math.hypot(x - 960, y - 520) / 1200)} />
      <g transform={`translate(960 520) rotate(${rot}) scale(${1 + lt * 0.05}) translate(-960 -520)`}>
        <Splat g={SPLAT4} x={960} y={500} p={sp} drip={win(lt, 0.25, 1.3)} rot={-8} />
        {/* 粉笔人形轮廓 */}
        <path
          d="M900 440q-60 -10 -40 -80q30 -60 90 -20q30 40 -10 90l60 30l90 -60l20 30l-80 70l10 110l90 70l-30 30l-90 -60l-40 120l-40 -10l20 -140l-60 -60l-80 40l-20 -30z"
          fill="none"
          stroke={C.white}
          strokeWidth={8}
          strokeLinejoin="round"
          strokeDasharray="1600"
          strokeDashoffset={1600 * (1 - expoOut(win(lt, 0.12, 0.5)))}
          opacity={0.9}
        />
      </g>
      {st > 0 ? (
        <g>
          <Txt x={960} y={190} size={36} font={F.latin} fill={C.ink} ls={22} opacity={st}>
            A BODY HAS BEEN DISCOVERED
          </Txt>
          <Txt x={960} y={520} size={210} fill={C.ink} stroke={C.white} sw={18} rot={-5} sx={lerp(2.2, 1, st)} sy={lerp(2.2, 1, st)} ls={8}>
            尸体发现！
          </Txt>
        </g>
      ) : null}
      <DialogueBox name="黑白熊" text="一段时间后，将召开学级裁判！" p={win(lt, b(0.75), 0.16)} chars={(lt - b(0.75)) * 44} />
    </Svg>
  );
};

export const S4Descent: React.FC<{t: number}> = ({t}) => {
  const lt = t - b(14);
  const rush = expoIn(win(lt, b(1.6), b(0.4)));
  const r = rng(77);
  const bars = Array.from({length: 26}, () => ({y: r() * 1400, w: 200 + r() * 1400, x: r() * 1920, h: 3 + r() * 14, sp: 1800 + r() * 2600, c: r()}));
  return (
    <Svg>
      <defs>
        <linearGradient id="s4g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3B0019" />
          <stop offset="0.5" stopColor="#12020C" />
          <stop offset="1" stopColor="#3B0019" />
        </linearGradient>
      </defs>
      <BG fill="url(#s4g)" />
      {bars.map((bb, i) => {
        const y = ((((bb.y - lt * bb.sp * (1 + rush * 3)) % 1400) + 1400) % 1400) - 160;
        return <rect key={i} x={bb.x - bb.w / 2} y={y} width={bb.w} height={bb.h * (1 + rush * 4)} fill={bb.c < 0.3 ? C.white : C.pink} opacity={0.18 + bb.c * 0.4} />;
      })}
      {/* 电梯铁栅门 */}
      <g stroke="#1C0A12" strokeWidth={14} opacity={0.85}>
        {Array.from({length: 14}, (_, i) => (
          <path key={i} d={`M${i * 160 - 400} 0L${i * 160 + 400} 1080M${i * 160 + 400} 0L${i * 160 - 400} 1080`} />
        ))}
      </g>
      <g transform={`translate(960 540) scale(${1 + rush * 2.5}) translate(-960 -540)`} opacity={1 - rush * 0.6}>
        {'学级裁判'.split('').map((ch, i) => {
          const q = expoOut(win(lt, b(i * 0.5), 0.14));
          if (q <= 0) return null;
          return (
            <Txt key={i} x={480 + i * 320} y={540} size={290} fill={C.white} depth={[10, 3, 4, C.pinkDeep]} sx={lerp(1.8, 1, q)} sy={lerp(1.8, 1, q)} opacity={q}>
              {ch}
            </Txt>
          );
        })}
        <Txt x={960} y={790} size={44} font={F.latin} fill={C.pink} ls={30} opacity={expoOut(win(lt, b(1.5), 0.15))}>
          CLASS TRIAL
        </Txt>
      </g>
    </Svg>
  );
};

export {BG, MONO_S, MONO_Y};
