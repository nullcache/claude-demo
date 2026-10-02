import {clamp, DEG, lerp, ss, TAU} from '../lib/math';
import {COL, CUE, rgba} from './config';
import {R, skyVis} from './scene';
import {blit, glow} from './sprites';
import {add, Cam, cross, mul, norm, project, projectDir, rng, rotAxis, sph, V3} from './v3';

type Ctx = CanvasRenderingContext2D;

// ───────────── 贴图 ─────────────
export const TEX: {sky?: CanvasImageSource & {width: number; height: number}; ground?: CanvasImageSource & {width: number; height: number}} = {};

export async function loadTextures(url: (p: string) => string) {
  const load = async (p: string) => {
    const img = new Image();
    img.src = url(p);
    await img.decode();
    return img;
  };
  const [sky, ground] = await Promise.all([load('mv/sky.jpg'), load('mv/ground.jpg')]);
  TEX.sky = sky;
  TEX.ground = ground;
}

/** 把一个纹理矩形贴到四个屏幕点上（取平行四边形近似的仿射，略微外扩避免接缝） */
function texQuad(ctx: Ctx, img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, p00: V3, p10: V3, p01: V3, p11: V3, pad = 1.2) {
  const exx = (p10[0] - p00[0] + p11[0] - p01[0]) / 2 / sw, exy = (p10[1] - p00[1] + p11[1] - p01[1]) / 2 / sw;
  const eyx = (p01[0] - p00[0] + p11[0] - p10[0]) / 2 / sh, eyy = (p01[1] - p00[1] + p11[1] - p10[1]) / 2 / sh;
  const cx = (p00[0] + p10[0] + p01[0] + p11[0]) / 4, cy = (p00[1] + p10[1] + p01[1] + p11[1]) / 4;
  const mx = sx + sw / 2, my = sy + sh / 2;
  ctx.setTransform(exx, exy, eyx, eyy, cx - exx * mx - eyx * my, cy - exy * mx - eyy * my);
  ctx.drawImage(img, sx - pad, sy - pad, sw + 2 * pad, sh + 2 * pad, sx - pad, sy - pad, sw + 2 * pad, sh + 2 * pad);
}

// ───────────── 真实的银河（ESO 全天全景，等距柱状投影）─────────────
// 银河中心放在纸鹤面朝方向的高空，银道面斜斜跨过穹顶
const GC = sph(18 * DEG, 46 * DEG);
const GX = rotAxis(norm(cross([0, 1, 0], GC)), GC, 28 * DEG);
const GN = norm(cross(GC, GX));
const galToWorld = (lon: number, lat: number): V3 => {
  const c = Math.cos(lat);
  return add(add(mul(GX, c * Math.sin(lon)), mul(GN, Math.sin(lat))), mul(GC, c * Math.cos(lon)));
};

export function drawSkyTexture(ctx: Ctx, cam: Cam, s: number) {
  const img = TEX.sky;
  if (!img) return;
  const W = cam.cx * 2, H = cam.cy * 2;
  // 城市光污染下几乎看不见，歌声之后天空“擦亮”
  const a = lerp(0.2, 1, skyVis(s));
  const NU = 36, NV = 18, iw = img.width, ih = img.height;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < NV; j++) {
    const v0 = j / NV, v1 = (j + 1) / NV;
    const la0 = (0.5 - v0) * Math.PI, la1 = (0.5 - v1) * Math.PI;
    for (let i = 0; i < NU; i++) {
      const u0 = i / NU, u1 = (i + 1) / NU;
      const lo0 = (0.5 - u0) * TAU, lo1 = (0.5 - u1) * TAU;
      const p00 = projectDir(cam, galToWorld(lo0, la0)), p10 = projectDir(cam, galToWorld(lo1, la0));
      const p01 = projectDir(cam, galToWorld(lo0, la1)), p11 = projectDir(cam, galToWorld(lo1, la1));
      if (p00[2] <= 0.05 || p10[2] <= 0.05 || p01[2] <= 0.05 || p11[2] <= 0.05) continue;
      const xs = [p00[0], p10[0], p01[0], p11[0]], ys = [p00[1], p10[1], p01[1], p11[1]];
      if (Math.max(...xs) < 0 || Math.min(...xs) > W || Math.max(...ys) < 0 || Math.min(...ys) > H) continue;
      texQuad(ctx, img, u0 * iw, v0 * ih, (u1 - u0) * iw, (v1 - v0) * ih, p00, p10, p01, p11);
    }
  }
  ctx.restore();
}

// ───────────── 楼群（程序生成：一栋栋一样的高层，一格一格的窗）─────────────
interface Tower {
  az: number;
  r: number;
  w: number;
  h: number;
  face: number;
  cap: number; // 顶部收分（0 = 平顶）
  beacon: number; // 楼顶红色航空灯的相位（<0 无）
}
const FACES: HTMLCanvasElement[] = [];
const TOWERS: Tower[] = [];
{
  const r = rng(2025);
  const rings: Array<[number, number, number, number]> = [
    // 半径、数量、最低、最高
    [72, 56, 7, 22],
    [98, 74, 10, 32],
    [135, 96, 14, 44],
  ];
  for (const [rad, n, h0, h1] of rings) {
    for (let k = 0; k < n; k++) {
      const az = ((k + r() * 0.8) / n) * TAU;
      const h = h0 + Math.pow(r(), 1.4) * (h1 - h0);
      TOWERS.push({az, r: rad + (r() - 0.5) * 10, w: 3.5 + r() * 4.5, h, face: Math.floor(r() * 24), cap: r() < 0.4 ? 0.45 + r() * 0.3 : 0, beacon: h > h1 * 0.7 && r() < 0.6 ? r() * TAU : -1});
    }
  }
  TOWERS.sort((a, b) => b.r - a.r);
}
function face(i: number) {
  if (FACES[i]) return FACES[i];
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d')!;
  const r = rng(500 + i);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0b0d1f');
  g.addColorStop(1, '#05060f');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 256);
  const cols = 7 + Math.floor(r() * 4), rows = 46 + Math.floor(r() * 18);
  const cw = 64 / cols, rh = 252 / rows;
  const lit = 0.14 + r() * 0.24;
  for (let yy = 0; yy < rows; yy++)
    for (let xx = 0; xx < cols; xx++) {
      const q = r();
      if (q > lit) continue;
      const warm = r() < 0.7;
      const b = 0.3 + r() * 0.6;
      x.fillStyle = warm ? `rgba(255,${190 + Math.floor(r() * 40)},${120 + Math.floor(r() * 40)},${b})` : `rgba(${200 + Math.floor(r() * 30)},222,255,${b * 0.9})`;
      x.fillRect(xx * cw + cw * 0.25, 4 + yy * rh + rh * 0.22, cw * 0.5, rh * 0.5);
    }
  // 楼顶一圈灯
  x.fillStyle = 'rgba(255,240,220,0.5)';
  x.fillRect(0, 0, 64, 2);
  FACES[i] = c;
  return c;
}

/** 雾：越远越淡 */
const FOG: readonly number[] = [26, 28, 56];
export function drawTowers(ctx: Ctx, cam: Cam, s: number) {
  const W = cam.cx * 2, H = cam.cy * 2;
  const lightsUp = 0.65 + 0.35 * ss(CUE.c7, CUE.post, s);
  ctx.save();
  for (const t of TOWERS) {
    const c = sph(t.az, 0);
    const tan: V3 = [Math.cos(t.az), 0, -Math.sin(t.az)];
    const base = mul(c, t.r);
    const P = (x: number, y: number): V3 => add(add(base, mul(tan, x)), [0, y, 0]);
    const hw = t.w / 2;
    const p00 = project(cam, P(-hw, t.h)), p10 = project(cam, P(hw, t.h)), p01 = project(cam, P(-hw, -1)), p11 = project(cam, P(hw, -1));
    if (p00[2] <= 0.5 || p10[2] <= 0.5 || p01[2] <= 0.5 || p11[2] <= 0.5) continue;
    const xs = [p00[0], p10[0], p01[0], p11[0]], ys = [p00[1], p10[1], p01[1], p11[1]];
    if (Math.max(...xs) < -20 || Math.min(...xs) > W + 20 || Math.max(...ys) < -20 || Math.min(...ys) > H + 20) continue;
    const fog = clamp((t.r - 60) / 90);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    texQuad(ctx, face(t.face), 0, 0, 64, 256, p00, p10, p01, p11, 0);
    let top = t.h;
    if (t.cap > 0) {
      const cw = (t.w * t.cap) / 2, ch = t.h * 0.12;
      const q00 = project(cam, P(-cw, t.h + ch)), q10 = project(cam, P(cw, t.h + ch)), q01 = project(cam, P(-cw, t.h)), q11 = project(cam, P(cw, t.h));
      texQuad(ctx, face((t.face + 7) % 24), 0, 0, 64, 40, q00, q10, q01, q11, 0);
      top += ch;
    }
    // 雾气覆盖（保留一点窗光）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.12 + 0.55 * fog * (1.15 - lightsUp * 0.3);
    ctx.fillStyle = rgba(FOG, 1);
    ctx.beginPath();
    ctx.moveTo(p00[0], p00[1]);
    ctx.lineTo(p10[0], p10[1]);
    ctx.lineTo(p11[0], p11[1]);
    ctx.lineTo(p01[0], p01[1]);
    ctx.closePath();
    ctx.fill();
    if (t.beacon >= 0 && Math.sin(s * 2.4 + t.beacon) > 0.35) {
      const b = project(cam, P(0, top + 0.4));
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, glow([255, 70, 60], 0.5), b[0], b[1], Math.max(3, (cam.focal / b[2]) * 2.2), 0.8 * (1 - fog * 0.5));
    }
  }
  ctx.restore();
}

/** 城外的地面：地平线以下压成深色，楼群立在上面 */
export function drawFarGround(ctx: Ctx, cam: Cam) {
  const W = cam.cx * 2, H = cam.cy * 2;
  const pts: V3[] = [];
  for (let a = 0; a <= 360; a += 3) {
    const p = projectDir(cam, sph(a * DEG, -0.004));
    if (p[2] > 0.02) pts.push(p);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (pts.length < 2) {
    if (cam.f[1] < 0) {
      ctx.fillStyle = '#05060d';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    return;
  }
  pts.sort((a, b) => a[0] - b[0]);
  // 地面在地平线的哪一侧：看正下方方向投影到哪
  const down = projectDir(cam, [0, -1, 0]);
  const below = down[2] > 0 ? down[1] > pts[0][1] : cam.u[1] > 0;
  const edgeY = below ? H * 4 : -H * 3;
  ctx.beginPath();
  ctx.moveTo(-W, edgeY);
  ctx.lineTo(-W, pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.lineTo(W * 2, pts[pts.length - 1][1]);
  ctx.lineTo(W * 2, edgeY);
  ctx.closePath();
  ctx.fillStyle = '#05060e';
  ctx.fill();
  ctx.restore();
}

/** 城市光污染：地平线附近一圈暖灰的光，越往上越暗；天空擦亮后变淡 */
export function drawCityGlow(ctx: Ctx, cam: Cam, s: number) {
  const sv = skyVis(s);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g1 = glow([96, 70, 110], 0), g2 = glow([60, 64, 120], 0);
  for (let a = 0; a < 360; a += 10) {
    const p = projectDir(cam, sph(a * DEG, 0.03));
    if (p[2] <= 0) continue;
    blit(ctx, g1, p[0], p[1], cam.focal * 0.9, 0.2 * (1 - 0.5 * sv));
    const q = projectDir(cam, sph(a * DEG, 0.16));
    if (q[2] > 0) blit(ctx, g2, q[0], q[1], cam.focal * 1.6, 0.12 * (1 - 0.6 * sv));
  }
  ctx.restore();
}

// ───────────── 笼底的城（俯拍夜景贴在地面上，裁成圆）─────────────
export function drawGround(ctx: Ctx, cam: Cam, s: number, vis: number) {
  const img = TEX.ground;
  if (!img || vis <= 0) return;
  const N = 18, iw = img.width, ih = img.height;
  ctx.save();
  // 圆形裁剪
  ctx.beginPath();
  let pen = false;
  for (let a = 0; a <= 360; a += 4) {
    const p = project(cam, [Math.sin(a * DEG) * R, 0, Math.cos(a * DEG) * R]);
    if (p[2] <= 0.3) continue;
    if (pen) ctx.lineTo(p[0], p[1]);
    else ctx.moveTo(p[0], p[1]);
    pen = true;
  }
  ctx.closePath();
  if (!pen) {
    ctx.restore();
    return;
  }
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = vis * (0.55 + 0.3 * ss(CUE.c7, CUE.post, s));
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x0 = -R + (2 * R * i) / N, x1 = -R + (2 * R * (i + 1)) / N;
      const z0 = R - (2 * R * j) / N, z1 = R - (2 * R * (j + 1)) / N;
      if (Math.min(Math.hypot(x0, z0), Math.hypot(x1, z0), Math.hypot(x0, z1), Math.hypot(x1, z1)) > R) continue;
      const p00 = project(cam, [x0, 0, z0]), p10 = project(cam, [x1, 0, z0]);
      const p01 = project(cam, [x0, 0, z1]), p11 = project(cam, [x1, 0, z1]);
      if (p00[2] <= 0.3 || p10[2] <= 0.3 || p01[2] <= 0.3 || p11[2] <= 0.3) continue;
      texQuad(ctx, img, (i / N) * iw, (j / N) * ih, iw / N, ih / N, p00, p10, p01, p11, 0.6);
    }
  ctx.restore();
}

export {COL, TAU};
