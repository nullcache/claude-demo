import {clamp, ss} from '../lib/math';
import {CUE, H, SONG_IN, SONG_OUT, W} from './config';
import {drawCityGlow, drawFarGround, drawGround, drawSkyTexture, drawTowers} from './backdrop';
import {camera} from './camera';
import {prepareCrane} from './crane';
import {bulge, holeOpen} from './scene';
import {grain, offscreen} from './sprites';
import {Cam} from './v3';
import {drawScreenText, drawWorldText} from './text';
import {buildNet, drawCity, drawDust, drawKnots, drawNetSegs, drawRings, drawSky, drawStar, drawThread, prepareTrain} from './world';

/** 画一帧（s = 原曲时间） */
export function drawFrame(ctx: CanvasRenderingContext2D, s: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  const cam = camera(s);

  drawBackground(ctx, cam, s);
  drawCity(ctx, cam, s);
  const segs = buildNet(cam, s);
  const crane = prepareCrane(cam, s);
  const cz = crane.depth;
  const train = prepareTrain(cam, s);

  drawNetSegs(ctx, segs, cz, 1e9);
  drawKnots(ctx, cam, s);
  drawRings(ctx, cam, s);
  drawStar(ctx, cam, s);
  drawWorldText(ctx, cam, s, bulge(s), holeOpen(s));
  drawThread(ctx, cam, s, crane.beakWorld);
  train.filter(it => it.z >= cz).sort((a, b) => b.z - a.z).forEach(it => it.draw(ctx));
  crane.draw(ctx);
  train.filter(it => it.z < cz).sort((a, b) => b.z - a.z).forEach(it => it.draw(ctx));
  drawNetSegs(ctx, segs, 0, cz);
  drawDust(ctx, cam, s, 0.55 + 0.45 * ss(CUE.c7, CUE.post, s));

  post(ctx, s);
  drawScreenText(ctx, s);
  fades(ctx, s);
}

/**
 * 远景层（天空、银河、楼群、笼底的城）：半分辨率绘制，再按镜头对焦距离做景深虚化——
 * 特写纸鹤时，远处的城化成一片柔和的光斑
 */
function drawBackground(ctx: CanvasRenderingContext2D, cam: Cam, s: number) {
  const hw = W / 2, hh = H / 2;
  const half: Cam = {...cam, focal: cam.focal / 2, cx: cam.cx / 2, cy: cam.cy / 2};
  const a = offscreen('bg', hw, hh), b = offscreen('bgBlur', hw, hh);
  const ac = a.getContext('2d')!, bc = b.getContext('2d')!;
  ac.setTransform(1, 0, 0, 1, 0, 0);
  ac.globalAlpha = 1;
  ac.globalCompositeOperation = 'source-over';
  drawSky(ac, half, s);
  drawSkyTexture(ac, half, s);
  drawFarGround(ac, half);
  drawCityGlow(ac, half, s);
  drawTowers(ac, half, s);
  drawGround(ac, half, s, ss(CUE.c1, CUE.c3, s));
  const blur = clamp((cam.aperture * cam.focal) / cam.focus, 0.25, 9) * 0.5; // 半分辨率下的像素
  bc.setTransform(1, 0, 0, 1, 0, 0);
  bc.globalCompositeOperation = 'copy';
  bc.filter = `blur(${blur.toFixed(2)}px)`;
  bc.drawImage(a, 0, 0);
  bc.filter = 'none';
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(b, 0, 0, W, H);
  ctx.restore();
}

/** 柔光（高光泛出来的雾） + 暗角 + 胶片颗粒 */
function post(ctx: CanvasRenderingContext2D, s: number) {
  const a = offscreen('bloomA', 480, 270), b = offscreen('bloomB', 240, 135);
  const ac = a.getContext('2d')!, bc = b.getContext('2d')!;
  ac.globalCompositeOperation = 'copy';
  ac.filter = 'brightness(1.05) contrast(1.6) blur(3px)';
  ac.drawImage(ctx.canvas, 0, 0, 480, 270);
  ac.filter = 'none';
  bc.globalCompositeOperation = 'copy';
  bc.filter = 'blur(6px)';
  bc.drawImage(a, 0, 0, 240, 135);
  bc.filter = 'none';
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.42;
  ctx.drawImage(a, 0, 0, W, H);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(b, 0, 0, W, H);
  // 暗角
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.68);
  v.addColorStop(0, 'rgba(2,3,10,0)');
  v.addColorStop(1, 'rgba(2,3,10,0.62)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // 颗粒
  const fi = Math.floor((s - SONG_IN) * 30);
  const pat = ctx.createPattern(grain(fi % 6), 'repeat')!;
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.07;
  ctx.translate((fi * 73) % 256, (fi * 151) % 256);
  ctx.fillStyle = pat;
  ctx.fillRect(-256, -256, W + 512, H + 512);
  ctx.restore();
}

function fades(ctx: CanvasRenderingContext2D, s: number) {
  const k = Math.max(1 - ss(SONG_IN, SONG_IN + 0.25, s), ss(SONG_OUT - 0.9, SONG_OUT - 0.05, s));
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(k);
  ctx.fillStyle = '#020309';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
