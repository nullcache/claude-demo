# 奶娃 Blender 模型（站姿）

`naiwa.blend` 是网络 meme「奶龙 / 奶娃（奶蛙）」的站姿 3D 模型，由脚本程序化生成，不依赖手工雕刻文件。
灯光（白色无缝背景、柔光）和相机都已放好，用 Blender 4.2+ 打开后按 F12 即可出图。

> 当前阶段：**静态站姿**。外形确认后，再按新模型重做骨骼和动作（`rig.py`、`actions.py` 还是上一版外形用的，暂时不接入 `make.py`）。

## 还原依据

参考图在 `refs/`：

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `front.png` | 正面站姿 | 宽度、手、脚趾、眼睛、嘴 |
| `turn.png` | 正 / 侧 / 背三视图 | 前后厚度、头往前探、尾巴 |
| `laugh.jpg` | 大笑 | 留给之后做表情用 |

`*_mask.png` 是用 rembg 抠出来的剪影。

做法分三步：

1. **量尺寸**：参考图按「头顶到脚底 = 1、两脚中点为中心」归一化，逐行量出每个高度的左右、前后边界。
2. **放样建模**：身体和头是一整块，每个高度的横截面是椭圆，头前半边稍方，所以脸比较平。截面尺寸直接取自上一步的测量。手臂、腿、手指、脚趾、尾巴另外建，再融合进来。
3. **剪影比对**：`silhouette.py` 把模型剪影和参考剪影叠在一起比较。

当前与参考剪影的重合度（IoU）：

| 角度 | IoU |
| --- | --- |
| 正面 | 97% |
| 侧面 | 95% |
| 背面 | 95% |

正面的眼睛、瞳孔、嘴，也逐项量过参考图的位置和大小：
- 眼睛：中心在身高约 93% 处，左右各偏 0.071，圆盘半径 0.033。
- 瞳孔：约为圆盘的 55%，略偏下。
- 嘴：中心约在身高 0.87 处，半宽 0.042。

尺寸按身高 1 m 计（1 Blender 单位 = 1 m，脚底在 z=0），可以整体缩放。

造型要点：
- 身体：梨形，头顶是从身体顺下来的圆顶，没有脖子；奶油色椭圆肚皮，边缘柔和。
- 头部：两只灰绿色圆盘眼，黑色大瞳孔；短短一道嘴线，中间有个小尖。
- 手：深橄榄棕色，三根短手指加一根拇指，手腕处颜色渐变。
- 脚和尾巴：粗短的腿，每只脚前沿三颗深棕色圆脚趾；后腰有一条粗短的尾巴，尖端微微上翘。

## 文件

| 文件 | 作用 |
| --- | --- |
| `naiwa.blend` | 生成好的模型（约 20 万面）+ 灯光相机 |
| `shape.py` | 形体定义（有向距离场）：所有尺寸和量出来的轮廓表都在这里 |
| `build.py` | 网格生成（marching cubes）、颜色遮罩、材质、眼睛、嘴线、棚拍布光 |
| `make.py` | 一键生成 `naiwa.blend` |
| `silhouette.py` | 模型 vs 参考图的剪影叠图和 IoU |
| `compare.py` | 按三视图机位渲染，和参考图拼成对比图 |
| `previews.py` | 360° 转台（有动作时也渲动作） |

## 重新生成

```bash
python -m venv venv && venv/bin/pip install -r blender/naiwa/requirements.txt
venv/bin/python blender/naiwa/make.py                                  # → blender/naiwa/naiwa.blend（约 2 分钟）
venv/bin/python blender/naiwa/silhouette.py out/naiwa-sil               # 剪影比对
venv/bin/python blender/naiwa/compare.py blender/naiwa/naiwa.blend out/naiwa-cmp
venv/bin/python blender/naiwa/previews.py blender/naiwa/naiwa.blend out/naiwa-turn --only Turntable
```

可选参数：
- `--voxel`：网格精度，默认 0.003，越小越细。
- `--faces`：减面后的面数，默认 200000。
