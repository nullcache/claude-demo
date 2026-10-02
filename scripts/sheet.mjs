// 按原曲时间批量导出静帧并拼成联系表：node scripts/sheet.mjs 39.5,41,43 [outDir]
// 环境变量 COMP（默认 Dystopia）、SCALE（默认 0.5）
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const browserExecutable = fs.existsSync(LOCAL_SHELL) ? LOCAL_SHELL : null;
const [times = '40', outDir = 'out/sheet'] = process.argv.slice(2);
const SONG_IN = 39.15;
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const id = process.env.COMP || 'Dystopia';
const composition = await selectComposition({serveUrl, id, browserExecutable});
const scale = Number(process.env.SCALE || 0.5);
const files = [];
for (const s of times.split(',').map(Number)) {
  const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round((s - SONG_IN) * composition.fps)));
  const output = path.join(outDir, `s${s.toFixed(2)}.png`);
  const t0 = Date.now();
  await renderStill({serveUrl, composition, frame, output, browserExecutable, imageFormat: 'png', scale, timeoutInMilliseconds: Number(process.env.TIMEOUT || 120000), onBrowserLog: l => process.env.LOG && console.log('[browser]', l.type, l.text)});
  console.log(output, `${Date.now() - t0}ms`);
  files.push(output);
}
if (files.length > 1) {
  const cols = Math.min(3, files.length);
  const rows = Math.ceil(files.length / cols);
  const args = [];
  files.forEach(f => args.push('-i', f));
  const lab = files.map((f, i) => `[${i}:v]drawtext=text='${path.basename(f, '.png').slice(1)}':x=12:y=12:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.5[v${i}]`).join(';');
  const pads = files.length < cols * rows ? `;color=black:s=${Math.round(1920 * scale)}x${Math.round(1080 * scale)}:d=1[pad]` : '';
  const ins = files.map((_, i) => `[v${i}]`).join('') + (pads ? '[pad]'.repeat(cols * rows - files.length) : '');
  const layout = Array.from({length: cols * rows}, (_, i) => `${(i % cols) === 0 ? '0' : Array.from({length: i % cols}, () => 'w0').join('+')}_${Math.floor(i / cols) === 0 ? '0' : Array.from({length: Math.floor(i / cols)}, () => 'h0').join('+')}`).join('|');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', `${lab}${pads};${ins}xstack=inputs=${cols * rows}:layout=${layout}`, '-frames:v', '1', path.join(outDir, 'sheet.png')]);
  console.log(path.join(outDir, 'sheet.png'));
}
