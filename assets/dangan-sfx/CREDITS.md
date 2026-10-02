# DanganPV 声音素材来源

`scripts/dangan-audio.py` 用下列素材剪辑、混音，生成 `public/dangan/score.m4a`。

## 随仓库提供（CC0 公有领域）

| 文件 | 来源 | 作者 | 许可 |
|---|---|---|---|
| `revolver-sw642.flac` | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)：Smith & Wesson 642 .38 Special，近距离（V_27P），已裁切 | bart（OpenGameArt 发布者） | CC0 |
| `glass-break.flac` | [Glass Break](https://opengameart.org/content/glass-break) | Till Behrend | CC0 |
| `glass-falling.flac` / `glass-crack.flac` | [75 CC0 breaking / falling / hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx)：`bfh1_glass_falling_02` / `bfh1_glass_breaking_01` | rubberduck | CC0 |

## 运行时下载（不入库）

Mixkit 的许可允许在作品中免费使用，但不允许把原始文件单独再分发。所以这部分素材由脚本下载到 `.cache/`，也不提交生成的混音。

- **BGM**：[Games Music](https://mixkit.co/free-stock-music/) — Grigoriy Nuzhny，[Mixkit Stock Music Free License](https://mixkit.co/license/#musicFree)。原曲 140 BPM，用 rubberband 不变调伸缩到 144 BPM 后按小节重剪。
- **音效**：[Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree)，ID 见 `scripts/dangan-audio.py` 中的 `MIXKIT` 表。包括 Big cinematic impact、Epic movie trailer whoosh impact、Cinematic trailer riser、Glass break with hammer thud、Shatter shot explosion、Revolver chamber spin、Elevator announcement bells、Arcade slot machine wheel、Slot machine win、Arcade retro game over 等。
