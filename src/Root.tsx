import React from 'react';
import {Composition} from 'remotion';
import {Promo, FPS, DURATION_S} from './Promo';
import {StyleTest} from './StyleTest';
import {DanganPV} from './dangan/DanganPV';
import {DURATION_FRAMES, FPS as DR_FPS, H as DR_H, W as DR_W} from './dangan/core';

export const Root: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={FPS * DURATION_S} fps={FPS} width={1920} height={1080} />
    <Composition id="StyleA" component={StyleTest} defaultProps={{style: 'A' as const}} durationInFrames={132} fps={60} width={1920} height={1080} />
    <Composition id="StyleB" component={StyleTest} defaultProps={{style: 'B' as const}} durationInFrames={132} fps={60} width={1920} height={1080} />
    <Composition id="DanganPV" component={DanganPV} durationInFrames={DURATION_FRAMES} fps={DR_FPS} width={DR_W} height={DR_H} />
  </>
);
