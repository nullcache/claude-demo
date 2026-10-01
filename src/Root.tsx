import React from 'react';
import {Composition} from 'remotion';
import {Promo, FPS, DURATION_S} from './Promo';

export const Root: React.FC = () => (
  <Composition id="Promo" component={Promo} durationInFrames={FPS * DURATION_S} fps={FPS} width={1920} height={1080} />
);
