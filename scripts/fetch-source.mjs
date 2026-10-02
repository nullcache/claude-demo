// 从原曲官方投稿（BV1CVPoeNEq4，乌托邦P）取音频和歌词，仅供本地制作二创时对轨使用：
//   node scripts/fetch-source.mjs
// 输出 public/audio/song.m4a 和 public/lyrics.json（两者都在 .gitignore 里，不进仓库）
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const BVID = 'BV1CVPoeNEq4';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const page = `https://www.bilibili.com/video/${BVID}/`;
const headers = {'User-Agent': UA, Referer: page};

const html = await (await fetch(page, {headers})).text();
const m = html.match(/window\.__INITIAL_STATE__=(\{.*?\});\(function/s);
if (!m) throw new Error('页面结构变了：找不到 __INITIAL_STATE__');
const state = JSON.parse(m[1]);
const {cid, desc} = state.videoData;

// 歌词：简介里两条分隔线之间、「词：」之后的部分
const lines = desc
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean);
const start = lines.indexOf('词：');
const end = lines.findIndex((s, i) => i > start && /^=+$/.test(s));
const lyrics = lines.slice(start + 1, end);
fs.writeFileSync('public/lyrics.json', JSON.stringify(lyrics, null, 1));
console.log(`歌词 ${lyrics.length} 行 → public/lyrics.json`);

// 音频：最高码率的 DASH 音轨，再用 Remotion 自带的 ffmpeg 封装成 m4a
const play = await (await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${cid}&fnval=16&fnver=0&fourk=0`, {headers})).json();
const audio = play.data.dash.audio.sort((a, b) => b.bandwidth - a.bandwidth)[0];
const buf = Buffer.from(await (await fetch(audio.baseUrl, {headers})).arrayBuffer());
fs.mkdirSync('public/audio', {recursive: true});
fs.writeFileSync('public/audio/song.m4s', buf);
execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-loglevel', 'error', '-i', 'public/audio/song.m4s', '-c', 'copy', '-f', 'mp4', 'public/audio/song.m4a'], {stdio: 'inherit'});
fs.rmSync('public/audio/song.m4s');
console.log(`音频 ${(buf.length / 1e6).toFixed(1)} MB → public/audio/song.m4a`);
