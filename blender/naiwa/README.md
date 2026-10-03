# 奶娃 Blender 模型（站立 · 带骨骼和动作）

`naiwa.blend` 是网络 meme「奶龙 / 奶娃（奶蛙）」的站姿 3D 模型。脚本全程程序化生成，不依赖任何手工雕刻文件。
模型带骨骼、表情控制和 6 个做好的动作，灯光和相机也都已经放好，用 Blender 4.2+ 打开后按 F12 就能直接出图。

## 还原依据

- 参考图来自 [Nailong-Studio/wallpaper](https://github.com/Nailong-Studio/wallpaper)（MIT）：
  - 正面：`laugh-gallery/奶蛙-静站绿眼.png`
  - 侧面：`emotes/奶蛙-侧立.png`
  - 姿态和表情参考 `奶蛙-托腮`、`奶蛙-雀跃`、`奶蛙-弯腰大笑` 等
- 身高按 1 m 归一化（1 Blender 单位 = 1 m，脚底在 z=0）。缩放 `NaiwaRig` 就能改成任意尺寸。
- 正面和侧面剪影都和参考图逐层比对过，用的是 `silhouette.py`。躯干和腿在各高度的宽度，与参考图相差不超过身高的 2%（参考图里头是转过去的，头部不比）；裆下拱形的宽度和高度也一致。
  - 侧面参考图里的奶娃比正面那张胖，所以前后厚度只取到肚子处约为身宽的 1.1 倍，这个比例和 3/4 角度的参考图一致。
- 造型特征：
  - 黄色梨形身体，奶油色椭圆肚皮
  - 头顶微尖、往前探
  - 头两侧鼓出的绿色大眼，黑色瞳孔
  - 一道细细的嘴线
  - 灰褐色的四指小手和带四个脚趾的脚

## 文件

| 文件 | 作用 |
| --- | --- |
| `naiwa.blend` | 生成好的模型（约 12 万面），含骨骼、表情、动作、灯光、相机 |
| `shape.py` | 形体定义：有向距离场（SDF），所有比例都在这里 |
| `build.py` | 用 SDF 生成网格（marching cubes），再做材质、眼睛、嘴线 |
| `rig.py` | 骨骼、蒙皮权重、表情（大笑 / 张嘴 / 眨眼）、关键帧工具 |
| `actions.py` | 动作库 |
| `make.py` | 一键生成 `naiwa.blend` |
| `previews.py` | 把每个动作和转台渲染成 mp4 |
| `silhouette.py` | 模型和参考图的剪影比对 |

## 能做的动作

打开后在 Dope Sheet → Action Editor 里切换 `NaiwaRig` 当前的 Action。也可以把多个动作拉进 NLA 编辑器拼接。

| Action | 帧数（24fps） | 内容 |
| --- | --- | --- |
| `Idle` | 96，循环 | 待机：呼吸起伏、身体轻晃、眨一次眼 |
| `Wave` | 74 | 举起右手左右挥，嘴一张一合像在打招呼 |
| `Laugh` | 120 | 捧腹大笑（meme 名场面）：双手捂肚子，仰头张大嘴、眼睛笑成 ^ ^，再笑弯了腰，全身发抖 |
| `Walk` | 32，循环 | 摇摆走路（原地），身体左右晃，手臂前后摆 |
| `Jump` | 50 | 开心跳：下蹲蓄力，起跳举起双手，落地缓冲 |
| `Think` | 72 | 托腮思考：歪头、一只手托着脸颊、眨眼 |

### 自己摆姿势

- **骨骼**（Pose Mode）：`root`、`hips`、`spine`、`chest`、`head`，左右各有 `upperarm`、`forearm`、`hand`、`thigh`、`shin`、`foot`（`.L` / `.R`），全部使用四元数旋转，`root` 还可以平移。
- **表情滑杆**：选中 `NaiwaRig`，在 Object Properties → Custom Properties 里调，三个值都在 0–1：
  - `laugh`：大笑。嘴张成 D 形，露出牙齿和舌头，眼睛变成 ^ ^。
  - `mouth`：说话张嘴。
  - `blink`：眨眼（闭眼）。

  这些滑杆都可以打关键帧。驱动器只用了 Blender 的简单表达式，不需要开启「自动运行 Python 脚本」。

## 重新生成

```bash
python -m venv venv && venv/bin/pip install -r blender/naiwa/requirements.txt
venv/bin/python blender/naiwa/make.py                     # → blender/naiwa/naiwa.blend（约 2 分钟）
venv/bin/python blender/naiwa/previews.py blender/naiwa/naiwa.blend out/naiwa-previews
```

可选参数：
- `--voxel`：网格精度（默认 0.0035，越小越细）
- `--faces`：减面后的面数（默认 120000）
- `--test-poses DIR`：只把测试姿势各渲一张图

动作在 `actions.py` 里用关键姿势描述，例如：

```python
Pose(head=[(Y, 8)], upperarm_R=[(X, -60), (Z, 20)], laugh=1.0)
```

旋转轴都在骨架空间里：X 指向角色的左边，Y 指向身后，Z 向上。
