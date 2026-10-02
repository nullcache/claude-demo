import '@fontsource-variable/noto-serif-sc';
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, cancelRender, continueRender, delayRender, getStaticFiles, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadTextures} from './backdrop';
import {DURATION, H, SONG_IN, W} from './config';
import {drawFrame} from './draw';
import {loadLyrics} from './lyrics';
import {loadFonts} from './text';

/** 原曲在 public/audio/song.*（node scripts/fetch-source.mjs 取得）时自动按入点混进去 */
const findSong = () => getStaticFiles().find(f => /^audio\/song\.(mp3|m4a|aac|flac|wav|ogg)$/i.test(f.name));

export const MV: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const s = SONG_IN + frame / fps;
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('加载字体与贴图'));
  const pending = useRef(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadLyrics(staticFile('lyrics.json')).then(loadFonts), loadTextures(staticFile)])
      .then(() => setReady(true))
      .catch(e => cancelRender(e));
  }, []);

  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    drawFrame(ref.current.getContext('2d')!, s);
    if (pending.current) {
      pending.current = false;
      continueRender(handle);
    }
  }, [ready, s, handle]);

  const song = findSong();
  return (
    <AbsoluteFill style={{backgroundColor: '#04050d'}}>
      <canvas ref={ref} width={W} height={H} style={{width: '100%', height: '100%'}} />
      {song ? (
        <Audio
          src={song.src}
          trimBefore={Math.round(SONG_IN * fps)}
          volume={f => interpolate(f, [0, 6, durationInFrames - Math.round(0.4 * fps), durationInFrames - 1], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const MV_FRAMES = (fps: number) => Math.round(DURATION * fps);
