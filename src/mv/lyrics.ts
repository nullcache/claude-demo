import {CUE} from './config';

/**
 * 歌词排版。时间为原曲时间（LRC），text 留空的行不显示。
 * 这里只排了几句关键句；其余行按注释里的开头两个字，从原视频简介（BV1CVPoeNEq4）里把整句贴进 text 即可，
 * 字体是完整的思源宋体（可变字重），任何汉字都能渲染。
 *
 * look：
 *  whisper — 屏幕下方的小字气声
 *  column  — 竖排一列，从星尘里凝结出来，唱完散成尘
 *  net     — 一个字困在一个网格里（写在世界空间的网上）
 *  wave    — 横排，随光环扫过一个个点亮；emph 里的字会更大更暖
 *  side    — 普通竖排小字（给自己补的歌词用）
 */
export type Look = 'whisper' | 'column' | 'net' | 'wave' | 'side';
export interface Lyric {
  t: number;
  end: number;
  text: string;
  look: Look;
  emph?: string;
  /** side 行放在左边还是右边 */
  at?: 'left' | 'right';
}

export const LYRICS: Lyric[] = [
  {t: CUE.zhiyin, end: CUE.c1, text: '只因为', look: 'whisper'},
  {t: CUE.c1, end: CUE.c2, text: '你那渴望自由的心脏', look: 'column'},
  {t: CUE.c2, end: CUE.c3, text: '困在一张没空隙的网', look: 'net'},
  {t: CUE.c3, end: CUE.c4, text: '', look: 'side', at: 'right'}, // 我们…
  {t: CUE.c4, end: CUE.c5, text: '', look: 'side', at: 'left'}, // 只是…
  {t: CUE.c5, end: CUE.c6, text: '', look: 'side', at: 'right'}, // 在这…
  {t: CUE.c6, end: CUE.c7, text: '', look: 'side', at: 'left'}, // 但别…
  {t: CUE.c7, end: CUE.c8, text: '至少我还在为你而歌唱', look: 'wave'},
  {t: CUE.c8, end: CUE.post + 0.6, text: '在黑暗漫长的反乌托邦', look: 'wave', emph: '反乌托邦'},
  {t: CUE.bridge, end: CUE.bridge + 5.2, text: '', look: 'side', at: 'right'}, // 即便…
  {t: CUE.v1, end: CUE.v2, text: '', look: 'side', at: 'left'}, // 忍着…
  {t: CUE.v2, end: CUE.train, text: '', look: 'side', at: 'left'}, // 做出…
  {t: CUE.train, end: CUE.v4, text: '', look: 'side', at: 'right'}, // 列车…
  {t: CUE.v4, end: CUE.v5, text: '', look: 'side', at: 'right'}, // 困惑…
  {t: CUE.v5, end: CUE.v6, text: '', look: 'side', at: 'left'}, // 但我…
  {t: CUE.v6, end: CUE.please1, text: '', look: 'side', at: 'left'}, // 其实…
  {t: CUE.please1, end: CUE.please2, text: '请你等等我', look: 'side', at: 'right'},
  {t: CUE.please2, end: CUE.please2 + 1.9, text: '请你等等我', look: 'side', at: 'left'},
];

export const TITLE = {zh: '反乌托邦', en: 'DYSTOPIA', credit: '乌托邦P　／　星尘 Infinity · 诗岸'};

/** 所有需要预加载字形的文字 */
export const ALL_TEXT = LYRICS.map(l => l.text).join('') + TITLE.zh + TITLE.credit;
