# 极乐迪斯科 音MAD —《Welcome Back, Detective》

30 秒，忧郁 + 荒诞。BGM 是原作的 *Whirling-In-Rags, 8 AM*，旁白 Lenval Brown 的技能台词被切片、用 Praat 拉平音高后"唱"在 B 小调的和弦上。

## 结构（1 拍 ≈ 0.531s，112.99 BPM）

| 拍 | 段落 | 声音 | 画面 |
|---|---|---|---|
| 0–16 | A 宿醉 | ELECTROCHEMISTRY 念白："By the time you arrived in this world, it was already late." | 黑场渐入，旅馆地板 |
| 16–32 | B 内心的声音 | 低音吟唱 "Wine. Alcohol. Beer. Alcohol. Love. Alcohol." + "Hey" 三连上行 | 每词一刀，stutter/闪白 |
| 32–46 | C 欢迎回来 | 半唱半说 "You've been here before / Welcome back, detective / You're home now"（叠高八度）+ "Hi ho" | 冰海、帆船、城市慢推 |
| 46–58 | D 坠落 | SHIVERS："Whatever you thought would happen — did not."（音乐在此抽空）"And now you're just standing there…" | 黑场 → 雨夜路灯下站着的人 |

## 使用

```bash
pip install -r requirements.txt     # 另需 ffmpeg（带 libass、rubberband）
python3 fetch.py                    # 按 sources.yaml 下载素材到 cache/
python3 asr.py 20                   # （可选）转写技能语音前 20 分钟，用于找台词
python3 build.py                    # timeline.yaml -> out/<meta.name>.mp4
```

## 迭代方式

**只改 `timeline.yaml`**，再跑 `build.py`。单个镜头和人声按参数哈希缓存，改哪段就只重渲染哪段。

- 换台词：`python3 samples.py find "welcome back"` 找词级时间 → `python3 samples.py refine skills/xxx.m4a 起 止` 吸附边界、看基频 → 写进 `samples`
- 改旋律：`voice[].note`（B 小调，旁白基频 ≈ D2，低音区 B1–B2 最自然）、`len`（拍）、`flat`（1=完全拉平，0.6=半唱半说）
- 改音乐结构：`music.bars` 是原曲小节号；mod 4 对应和弦 Bm | Bsus | D | Em，换小节时保持 mod 4 对齐
- 改剪辑：`shots[].at/in/speed/fx`
- 快速预览：`python3 build.py --from 32 --to 48`、`--audio-only`、`--stills 8,24,40`
- 出新版本：改 `meta.name`（v2、v3…），每版的 timeline 都进 git，可以回滚对比

素材版权归 ZA/UM 与 British Sea Power，仅作个人二创；媒体文件不入库。
