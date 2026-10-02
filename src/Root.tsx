import React from 'react';
import {Composition} from 'remotion';
import {Promo, FPS, DURATION_S} from './Promo';
import {StyleTest} from './StyleTest';
import {MV, MV_FRAMES} from './mv/MV';
import {FPS as MV_FPS} from './mv/config';

export const Root: React.FC = () => (
  <>
    <Composition id="Dystopia" component={MV} durationInFrames={MV_FRAMES(MV_FPS)} fps={MV_FPS} width={1920} height={1080} />
    <Composition id="Promo" component={Promo} durationInFrames={FPS * DURATION_S} fps={FPS} width={1920} height={1080} />
    <Composition id="StyleA" component={StyleTest} defaultProps={{style: 'A' as const}} durationInFrames={132} fps={60} width={1920} height={1080} />
    <Composition id="StyleB" component={StyleTest} defaultProps={{style: 'B' as const}} durationInFrames={132} fps={60} width={1920} height={1080} />
  </>
);
