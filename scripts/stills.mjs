// 批量导出静帧（只打包一次）：node scripts/stills.mjs 0.5,1.0,2.3 [outDir]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const browserExecutable = fs.existsSync(LOCAL_SHELL) ? LOCAL_SHELL : null;
const [times = '0', outDir = 'out/stills'] = process.argv.slice(2);
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const id = process.env.COMP || 'Promo';
const composition = await selectComposition({serveUrl, id, browserExecutable});
for (const t of times.split(',').map(Number)) {
  const output = path.join(outDir, `t${t.toFixed(2)}.png`);
  await renderStill({serveUrl, composition, frame: Math.round(t * composition.fps), output, browserExecutable, imageFormat: 'png'});
  console.log(output);
}
