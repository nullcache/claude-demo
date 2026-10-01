// 离线逐帧渲染：本地静态服务 → Chromium 逐帧调用 renderFrame(t) → PNG 序列 → ffmpeg 编码
//   node video/render.mjs stills 0.5,1.2,3.6 [outDir]   导出若干静帧
//   node video/render.mjs video [out.mp4]                导出完整 10s 1080p60 视频
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const FPS = 60, DURATION = 10, WORKERS = Math.max(1, Math.min(4, os.cpus().length));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(here, rel);
    if (!file.startsWith(here) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.evaluate(() => window.animReady);
  return page;
}

const grab = async (page, t) => Buffer.from(await page.evaluate(t => window.renderPNG(t), t), 'base64');

const [mode = 'video', arg, outArg] = process.argv.slice(2);
const server = await serve();
const port = server.address().port;
const browser = await chromium.launch();
try {
  if (mode === 'stills') {
    const outDir = outArg || path.join(here, 'out', 'stills');
    fs.mkdirSync(outDir, { recursive: true });
    const page = await openPage(browser, port);
    for (const t of arg.split(',').map(Number)) {
      const f = path.join(outDir, `t${t.toFixed(2)}.png`);
      fs.writeFileSync(f, await grab(page, t));
      console.log(f);
    }
  } else {
    const out = arg || path.join(here, 'out', 'zhumeng-lvfa.mp4');
    const framesDir = path.join(path.dirname(out), 'frames');
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
    const N = FPS * DURATION;
    const t0 = Date.now();
    let done = 0;
    await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
      const page = await openPage(browser, port);
      for (let i = w; i < N; i += WORKERS) {
        fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(4, '0')}.png`), await grab(page, i / FPS));
        if (++done % 60 === 0) console.log(`${done}/${N} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
    }));
    const r = spawnSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%04d.png'),
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', out,
    ], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg failed');
    console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
  server.close();
}
