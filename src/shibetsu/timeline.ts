/**
 * 《死別》（シャノン feat. GUMI）奶娃版：只做前一分钟（主歌一 + 副歌一 + 间奏）。
 * 时间都是原曲时间（秒）。歌词出现/切换的时间点逐帧对过原 PV 右侧竖排字幕的变化。
 */
export const FPS = 24;
export const W = 1080;
export const H = 1920;
/** 第二段主歌之前的换气空档：原曲在这里截断 */
export const AUDIO_END = 61.97;
export const DURATION = 63.5;

export type ShotId =
  | 'black' | 's01' | 's02' | 's03' | 's04' | 's06' | 's07' | 's08' | 's09' | 's11a' | 's11b' | 's12' | 's13' | 's14';

export interface Shot {
  id: ShotId;
  from: number;
  to: number;
}

export const SHOTS: Shot[] = [
  {id: 'black', from: 0, to: 0.906},
  {id: 's01', from: 0.906, to: 5.875},   // 僕らの最後は死別にしよう      海边，两只并肩
  {id: 's02', from: 5.875, to: 11.25},   // 嫌いになりそうな日差しの中    霍普《晨光》
  {id: 's03', from: 11.25, to: 16.375},  // どれほど固く耳を塞ごう        楼梯间捂着耳朵
  {id: 's04', from: 16.375, to: 22.0},   // 他人事みたいね蝉は時雨        阳台、积雨云、蝉声如雨
  {id: 'black', from: 22.0, to: 23.375},
  {id: 's06', from: 23.375, to: 28.6},   // 君が早く死んでよかったな      霍普《夏夜》，两只
  {id: 's07', from: 28.6, to: 34.0},     // 君が早く死んでよかったな      右边那只化成光点散去
  {id: 's08', from: 34.0, to: 38.5},     // 君と見た蝉たちや              草地上并排躺着
  {id: 's09', from: 38.5, to: 43.0},     // 君と過ごした夏が              一个个夏天闪过，两只站在同一个位置
  {id: 'black', from: 43.0, to: 45.25},
  {id: 's11a', from: 45.25, to: 47.7},   // 腐り落ちてしまう前にさ        被藤蔓覆盖
  {id: 's11b', from: 47.7, to: 50.125},  //                               融化滴落
  {id: 's12', from: 50.125, to: 55.75},  // さよなら夏、君との思い出      夕阳小路，影子散去，只剩一只走远
  {id: 's13', from: 55.75, to: 58.85},   // （间奏）                       镜面湖上的空椅子
  {id: 's14', from: 58.85, to: DURATION}, //                              草丛里白色的幽灵 + 片名
];

/** i = 日文原词（public/shibetsu/lyrics.json 的 ja）中的行号 */
export const CUES = [
  {i: 0, from: 0.25, to: 5.875},
  {i: 1, from: 5.875, to: 11.25},
  {i: 2, from: 11.25, to: 16.375},
  {i: 3, from: 16.375, to: 22.0},
  {i: 4, from: 23.375, to: 28.6},
  {i: 5, from: 28.6, to: 34.0},
  {i: 6, from: 34.0, to: 38.5},
  {i: 7, from: 38.5, to: 44.1},
  {i: 8, from: 45.25, to: 50.125},
  {i: 9, from: 50.125, to: 55.75},
];

/** 拍点（librosa beat_track，92 BPM），闪切按拍子加速 */
export const BEAT = 0.6502;
export const beatAt = (k: number) => 0.255 + BEAT * k;
