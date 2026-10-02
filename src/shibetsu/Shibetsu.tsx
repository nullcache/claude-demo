import '@fontsource/shippori-mincho-b1/700.css';
import '@fontsource-variable/noto-serif-sc';
import React from 'react';
import {AbsoluteFill, Audio, getStaticFiles, interpolate, staticFile, useVideoConfig} from 'remotion';
import {Canvas, FilmGrain, ss, useAsset, useT, Vignette, weave} from './fx';
import {JA_FONT, ZH_FONT} from './fonts';
import {drawLyrics} from './lyricfx';
import {Manifest, SHOT_COMPONENTS} from './shots';
import {AUDIO_END, CUES, DURATION, FPS, SHOTS} from './timeline';

interface Lyrics {
  ja: string[];
  zh: string[];
}

const TITLE = '死別';
const CREDIT = ['Music / Lyrics　シャノン', 'Vocal　GUMI'];

async function loadAll(): Promise<{m: Manifest; ly: Lyrics}> {
  const [m, ly] = await Promise.all([
    fetch(staticFile('shibetsu/img/manifest.json')).then(r => r.json()),
    fetch(staticFile('shibetsu/lyrics.json'))
      .then(r => (r.ok ? r.json() : {ja: [], zh: []}))
      .catch(() => ({ja: [], zh: []})),
  ]);
  const ja = CUES.map(c => ly.ja[c.i] ?? '').join('') + TITLE + CREDIT.join('') + 'ミーンジーシャワカナ';
  const zh = (ly.zh ?? []).join('') + '奶娃版';
  await Promise.all([document.fonts.load(`700 60px ${JA_FONT}`, ja), document.fonts.load(`600 40px ${ZH_FONT}`, zh)]);
  await document.fonts.ready;
  return {m, ly};
}

/** 右侧两列竖排歌词（日文 + 中文），逐字画在 canvas 上，每句一种特效，两列同步（见 lyricfx.ts） */
const LyricColumn: React.FC<{t: number; ly: Lyrics}> = ({t, ly}) => {
  const cue = CUES.find(c => t >= c.from && t < c.to);
  // 暗带：句子之间的空隙里也不急着消失，免得一闪一闪
  const near = CUES.some(c => t >= c.from - 0.05 && t < c.to + 0.6);
  const band = cue ? ss(cue.from, cue.from + 0.4, t) : near ? 1 : 0;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(270deg, rgba(0,0,0,0.42) 0px, rgba(0,0,0,0.26) 230px, rgba(0,0,0,0) 440px)', opacity: band}} />
      <Canvas deps={[t]} draw={ctx => drawLyrics(ctx, t, ly.ja, ly.zh ?? [])} />
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
        <span style={{fontFamily: JA_FONT, fontWeight: 700, fontSize: 150, letterSpacing: '0.35em', color: '#fff', textShadow: '0 0 30px rgba(0,0,0,0.6)'}}>{TITLE}</span>
      </div>
      <div style={{position: 'absolute', left: 300, top: 700, writingMode: 'vertical-rl', fontFamily: ZH_FONT, fontWeight: 600, fontSize: 32, letterSpacing: '0.5em', color: 'rgba(255,255,255,0.82)', textShadow: '0 0 10px rgba(0,0,0,0.7)', opacity: b}}>
        奶娃 ver.
      </div>
      <div style={{position: 'absolute', left: 92, bottom: 150, opacity: b * 0.8}}>
        {CREDIT.map(c => (
          <div key={c} style={{fontFamily: JA_FONT, fontWeight: 700, fontSize: 24, letterSpacing: '0.1em', color: '#fff', lineHeight: 1.9, textShadow: '0 0 8px rgba(0,0,0,0.7)'}}>
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
