import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Figure, figureRig, gait, legLength, StyleId} from './characters/Figure';
import {blobD} from './lib/shapes';

const COL = {bg: '#D4F3EC', bgBlob: '#C5EEE3'};
const BLOBS: Array<[number, number, number, number]> = [
  [200, 1080, 480, 280], [1300, 0, 440, 230], [2300, 1090, 520, 300], [3300, 10, 470, 250],
];

/** 风格样张：两人慢速轻盈奔跑（镜头跟随） */
export const StyleTest: React.FC<{style: StyleId}> = ({style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const period = 1.1;
  const s = style === 'A' ? 1 : 1.16;
  const ground = 905;
  const runner = (kind: 'girl' | 'boy', x: number, ph: number) => {
    const pose = gait(t / period + ph);
    const rig = figureRig(style, kind, pose);
    const y = ground - (legLength(style, kind) * 0.975 + 11) * s;
    return <Figure rig={rig} x={x + 26 * t} y={y} s={s} />;
  };
  const cam = 420 * t;
  return (
    <AbsoluteFill style={{backgroundColor: COL.bg}}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <rect width={1920} height={1080} fill={COL.bg} />
        {BLOBS.map((b, i) => (
          <path key={i} d={blobD(b[0] - cam, b[1], b[2], b[3], t, i * 2.1, 0.05)} fill={COL.bgBlob} />
        ))}
        {runner('girl', 760, 0.1)}
        {runner('boy', 1150, 0)}
      </svg>
    </AbsoluteFill>
  );
};
