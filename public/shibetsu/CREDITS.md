# 素材来源 / Credits —《死別》奶娃 ver.

| 内容 | 来源 | 授权 |
| --- | --- | --- |
| 全部奶娃（奶蛙）画面 `img/*` | [Nailong-Studio/wallpaper](https://github.com/Nailong-Studio/wallpaper)（奶蛙艺术圣殿素材库）的 `art/`、`frames/`、`laugh-gallery/` | 仓库标注 MIT；图多为 AI 生成，部分为该仓库"全网搜集"，投稿时请在简介注明出处 |
| 歌曲《死別》 | シャノン feat. GUMI，官方投稿 BV1oC411572T | 原曲版权归作者；`scripts/fetch-shibetsu.mjs` 仅供本地对轨，音频不进仓库 |
| 日文歌词 | VocaDB song 606220 | 不进仓库（`public/shibetsu/lyrics.json`） |

`img/` 里的图由 `scripts/shibetsu/prep.py` 处理生成：抠图（rembg isnet-general-use）、
去除物体补背景（LaMa，[Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX)，Apache-2.0）、
超分（Real-ESRGAN realesr-general-x4v3，BSD-3-Clause）、复制/镜像合成成两只。

字体：Shippori Mincho B1（日文）、Noto Serif SC（中文），均为 SIL Open Font License。
片尾画面里只署音乐信息；奶娃素材的出处请写在投稿简介里。
