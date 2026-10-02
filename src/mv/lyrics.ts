import TIMING from './timing.json';

/**
 * 歌词：每一句都有自己的特效（look），时间来自逐字对轨（scripts/align.py → timing.json）。
 * 歌词文本运行时从 public/lyrics.json 读取（node scripts/fetch-source.mjs 从原曲简介取得，不进仓库）；
 * 读不到时用这里的 fallback（只有几句）。
 *
 * look：
 *  whisper 气声小字          column  竖排星尘凝结（心脏两字随心跳）
 *  net     一字困一格网       flicker 像楼里的灯一盏盏闪亮
 *  burn    过曝 → 灼烧的边    drift   雾里四散漂浮、慢慢聚拢
 *  glint   一道冷光扫过 → 变暖 wave    光环扫过逐字点亮（emph 更大更暖）
 *  thread  珠子一样沿光线滑下  break   困在方框里，框碎了字飞出来
 *  stamp   盖章一样被压下去    flap    车站翻牌
 *  sink    出现后慢慢沉进黑暗  rise    从下面弹起来
 *  echo    一个字带出层层回声  reach   向右拉长、追着列车
 *  farewell 化成星尘飞向那颗星
 */
export type Look =
  | 'whisper' | 'column' | 'net' | 'flicker' | 'burn' | 'drift' | 'glint' | 'wave' | 'thread'
  | 'break' | 'stamp' | 'flap' | 'sink' | 'rise' | 'echo' | 'reach' | 'farewell';

interface Slot {
  key: string; // 该句开头两个字（用来在歌词里定位）
  look: Look;
  fallback?: string;
  emph?: string;
  /** 本句结束（原曲时间）；缺省 = 下一句开始 */
  end?: number;
}

const SLOTS: Slot[] = [
  {key: '只因', look: 'whisper', fallback: '只因为'},
  {key: '你那', look: 'column', fallback: '你那渴望自由的心脏'},
  {key: '困在', look: 'net', fallback: '困在一张没空隙的网'},
  {key: '我们', look: 'flicker'},
  {key: '只是', look: 'burn'},
  {key: '在这', look: 'drift'},
  {key: '但别', look: 'glint'},
  {key: '至少', look: 'wave', fallback: '至少我还在为你而歌唱'},
  {key: '在黑', look: 'wave', fallback: '在黑暗漫长的反乌托邦', emph: '反乌托邦', end: 56.6},
  {key: '即便', look: 'thread', end: 67.2},
  {key: '忍着', look: 'break'},
  {key: '做出', look: 'stamp'},
  {key: '列车', look: 'flap'},
  {key: '困惑', look: 'sink'},
  {key: '但我', look: 'rise'},
  {key: '其实', look: 'echo'},
  {key: '请你', look: 'reach', fallback: '请你等等我'},
  {key: '请你', look: 'farewell', fallback: '请你等等我', end: 88.2},
];

export interface Line {
  text: string;
  chars: string[];
  times: number[]; // 每个字唱出的时刻
  t: number;
  end: number;
  look: Look;
  emph?: string;
  idx: number;
}

const strip = (s: string) => [...s].filter(c => /[一-鿿]/.test(c));

export function buildLines(src: string[] | null): Line[] {
  let cur = 0;
  const lines: Line[] = [];
  SLOTS.forEach((sl, i) => {
    let text = sl.fallback ?? '';
    if (src) {
      while (cur < src.length && !src[cur].startsWith(sl.key)) cur++;
      if (cur < src.length) text = src[cur++].trim();
    }
    const tm = TIMING[i];
    const chars = strip(text);
    const next = TIMING[i + 1]?.start ?? 88.2;
    const end = sl.end ?? next - 0.02;
    let times = tm.chars;
    if (times.length !== chars.length) {
      const t0 = tm.start, t1 = Math.min(end, t0 + 1.8);
      times = chars.map((_, k) => t0 + ((t1 - t0) * k) / Math.max(1, chars.length));
    }
    lines.push({text, chars, times, t: tm.start, end, look: sl.look, emph: sl.emph, idx: i});
  });
  return lines.filter(l => l.chars.length > 0);
}

export let LINES: Line[] = buildLines(null);

export async function loadLyrics(url: string) {
  try {
    const r = await fetch(url);
    if (r.ok) LINES = buildLines((await r.json()) as string[]);
  } catch {
    // 没有 lyrics.json 就只显示 fallback
  }
}

export const TITLE = {zh: '反乌托邦', en: 'DYSTOPIA', credit: '乌托邦P　／　星尘 Infinity · 诗岸'};

/** 需要预加载字形的全部文字 */
export const allText = () => LINES.map(l => l.text).join('') + TITLE.zh + TITLE.credit + '？';
