import '@fontsource/klee-one/600.css';
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css';
import React from 'react';
import {AbsoluteFill, Audio, getStaticFiles, interpolate, staticFile, useVideoConfig} from 'remotion';
import {FilmGrain, ss, useAsset, useT, Vignette, weave} from './fx';
import {Manifest, SHOT_COMPONENTS} from './shots';
import {AUDIO_END, CUES, DURATION, FPS, SHOTS} from './timeline';

interface Lyrics {
  ja: string[];
  zh: string[];
}

const JA_FONT = '"Klee One", serif';
const ZH_FONT = '"LXGW WenKai", serif';
const TITLE = '死別';
const CREDIT = ['Music / Lyrics　シャノン', 'Vocal　GUMI', '奶娃素材　Nailong-Studio/wallpaper（MIT）'];

async function loadAll(): Promise<{m: Manifest; ly: Lyrics}> {
  const [m, ly] = await Promise.all([
    fetch(staticFile('shibetsu/img/manifest.json')).then(r => r.json()),
    fetch(staticFile('shibetsu/lyrics.json'))
      .then(r => (r.ok ? r.json() : {ja: [], zh: []}))
      .catch(() => ({ja: [], zh: []})),
  ]);
  const ja = CUES.map(c => ly.ja[c.i] ?? '').join('') + TITLE + CREDIT.join('') + 'ミーンジーシャワカナ';
  const zh = (ly.zh ?? []).join('') + '奶娃素材';
  await Promise.all([document.fonts.load(`600 54px ${JA_FONT}`, ja), document.fonts.load(`400 30px ${ZH_FONT}`, zh), document.fonts.load(`600 22px ${JA_FONT}`, 'ミンジャワシカナー')]);
  await document.fonts.ready;
  return {m, ly};
}

/** 右侧竖排歌词：日文原词 + 中文翻译，一个字一个字浮现 */
const LyricColumn: React.FC<{t: number; ly: Lyrics}> = ({t, ly}) => {
  const cue = CUES.find(c => t >= c.from && t < c.to);
  if (!cue) return null;
  const ja = ly.ja[cue.i] ?? '';
  const zh = ly.zh?.[cue.i] ?? '';
  const out = 1 - ss(cue.to - 0.12, cue.to, t);
  const chars = [...ja];
  const shadow = '0 0 16px rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.65)';
  return (
    <AbsoluteFill style={{opacity: out}}>
      <AbsoluteFill style={{background: 'linear-gradient(270deg, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0.2) 170px, rgba(0,0,0,0) 330px)', opacity: ss(cue.from, cue.from + 0.4, t)}} />
      <div style={{position: 'absolute', right: 58, top: 230, writingMode: 'vertical-rl', fontFamily: JA_FONT, fontWeight: 600, fontSize: 56, letterSpacing: '0.14em', color: '#fff', textShadow: shadow, lineHeight: 1}}>
        {chars.map((ch, i) => {
          const a = ss(cue.from + i * 0.045, cue.from + i * 0.045 + 0.4, t);
          return (
            <span key={i} style={{opacity: a, filter: `blur(${((1 - a) * 6).toFixed(2)}px)`, display: 'inline-block', transform: `translateY(${(1 - a) * -10}px)`}}>
              {ch}
            </span>
          );
        })}
      </div>
      {zh ? (
        <div
          style={{
            position: 'absolute',
            right: 140,
            top: 262,
            writingMode: 'vertical-rl',
            fontFamily: ZH_FONT,
            fontSize: 31,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.86)',
            textShadow: shadow,
            opacity: ss(cue.from + 0.35, cue.from + 1.0, t),
          }}
        >
          {zh}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** 片尾：片名和署名（竖排放在左侧草丛的暗处，避开白色的幽灵） */
const Title: React.FC<{t: number}> = ({t}) => {
  const a = ss(60.0, 61.2, t);
  const b = ss(60.8, 61.8, t);
  if (a <= 0) return null;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0) 60%)', opacity: a}} />
      <div style={{position: 'absolute', left: 120, top: 640, writingMode: 'vertical-rl', opacity: a, filter: `blur(${((1 - a) * 8).toFixed(1)}px)`}}>
        <span style={{fontFamily: JA_FONT, fontWeight: 600, fontSize: 150, letterSpacing: '0.35em', color: '#fff', textShadow: '0 0 30px rgba(0,0,0,0.6)'}}>{TITLE}</span>
      </div>
      <div style={{position: 'absolute', left: 300, top: 700, writingMode: 'vertical-rl', fontFamily: ZH_FONT, fontSize: 30, letterSpacing: '0.5em', color: 'rgba(255,255,255,0.82)', textShadow: '0 0 10px rgba(0,0,0,0.7)', opacity: b}}>
        奶娃 ver.
      </div>
      <div style={{position: 'absolute', left: 92, bottom: 150, opacity: b * 0.8}}>
        {CREDIT.map(c => (
          <div key={c} style={{fontFamily: JA_FONT, fontWeight: 600, fontSize: 21, letterSpacing: '0.08em', color: '#fff', lineHeight: 1.9, textShadow: '0 0 8px rgba(0,0,0,0.7)'}}>
            {c}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const findSong = () => getStaticFiles().find(f => /^shibetsu\/audio\/song\.(m4a|mp3|aac|wav|flac|ogg)$/i.test(f.name));

export const Shibetsu: React.FC = () => {
  const t = useT();
  const {fps} = useVideoConfig();
  const data = useAsset('shibetsu-data', loadAll);
  const song = findSong();
  const shot = SHOTS.find(s => t >= s.from && t < s.to) ?? SHOTS[SHOTS.length - 1];
  const Comp = SHOT_COMPONENTS[shot.id];
  const wv = weave(t);
  const endFade = ss(62.5, DURATION - 0.05, t);
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {data && Comp ? (
        <AbsoluteFill style={{transform: `translate(${wv.x}px, ${wv.y}px) scale(1.01)`}}>
          <Comp t={t} shot={shot} m={data.m} />
        </AbsoluteFill>
      ) : null}
      <Vignette amount={0.5} />
      <FilmGrain t={t} amount={0.045} />
      {data ? <LyricColumn t={t} ly={data.ly} /> : null}
      <Title t={t} />
      <AbsoluteFill style={{backgroundColor: '#000', opacity: endFade}} />
      {song ? (
        <Audio
          src={song.src}
          trimAfter={Math.round(AUDIO_END * fps)}
          volume={f =>
            interpolate(f, [0, 2, Math.round((AUDIO_END - 0.9) * fps), Math.round(AUDIO_END * fps) - 1], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const SHIBETSU_FRAMES = Math.round(DURATION * FPS);
