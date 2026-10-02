// 《死別》奶娃版 MV 的音频与歌词，仅供本地制作二创时对轨使用：
//   node scripts/fetch-shibetsu.mjs
// 音频：原曲官方投稿 BV1oC411572T（シャノン）最高码率音轨 → public/shibetsu/audio/song.m4a
// 歌词：VocaDB（song 606220）日文原词 → public/shibetsu/lyrics.json
// 两者都在 .gitignore 里，不进仓库。中文翻译若已写在 lyrics.json 的 zh 字段里会保留。
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const BVID = 'BV1oC411572T';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const page = `https://www.bilibili.com/video/${BVID}/`;
const headers = {'User-Agent': UA, Referer: page};

// ── 歌词 ──
const LYRICS = 'public/shibetsu/lyrics.json';
const voca = await (await fetch('https://vocadb.net/api/songs/606220?fields=Lyrics', {headers: {'User-Agent': UA}})).json();
const ja = voca.lyrics.find(l => l.translationType === 'Original').value.split('\n').map(s => s.trim()).filter(Boolean);
const old = fs.existsSync(LYRICS) ? JSON.parse(fs.readFileSync(LYRICS, 'utf8')) : {};
fs.mkdirSync('public/shibetsu', {recursive: true});
fs.writeFileSync(LYRICS, JSON.stringify({ja, zh: old.zh ?? []}, null, 1));
console.log(`歌词 ${ja.length} 行 → ${LYRICS}`);

// ── 音频 ──
const html = await (await fetch(page, {headers})).text();
const m = html.match(/window\.__INITIAL_STATE__=(\{.*?\});\(function/s);
if (!m) throw new Error('页面结构变了：找不到 __INITIAL_STATE__');
const {cid} = JSON.parse(m[1]).videoData;
const play = await (await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${cid}&fnval=16&fnver=0&fourk=0`, {headers})).json();
const audio = play.data.dash.audio.sort((a, b) => b.bandwidth - a.bandwidth)[0];
const buf = Buffer.from(await (await fetch(audio.baseUrl, {headers})).arrayBuffer());
fs.mkdirSync('public/shibetsu/audio', {recursive: true});
fs.writeFileSync('public/shibetsu/audio/song.m4s', buf);
execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-loglevel', 'error', '-i', 'public/shibetsu/audio/song.m4s', '-c', 'copy', '-f', 'mp4', 'public/shibetsu/audio/song.m4a'], {stdio: 'inherit'});
fs.rmSync('public/shibetsu/audio/song.m4s');
console.log(`音频 ${(buf.length / 1e6).toFixed(1)} MB → public/shibetsu/audio/song.m4a`);
