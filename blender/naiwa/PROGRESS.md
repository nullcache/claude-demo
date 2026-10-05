# 奶娃精修进度 · 2026-10-05

基于用户指定的 `claude/nailong-meme-video-yut5t3` 分支，底稿提交 `c5058ef43b7a72b9c69596552aa9cf0d9a5643aa`。

常态站姿已完成两轮精修。对照同一张 `refs/turn.png` 的正、侧、背三视图，调整了眼睛厚度、黑瞳比例与间距、嘴的位置与宽度、肘部曲线和手臂贴身折缝、腹斑过渡、尾巴下缘及灯光。身体厚度、头部前探和尾长继续沿用原仓库较准确的轮廓。

- [常态 Blender 工程](naiwa.blend)，主体约 20 万面，参考图已打包。
- [参考／原模型／精修模型三视图对照](preview/threeviews_reference_original_refined.jpg)。
- [常态预览](preview/standing.png)。
- `validation/static_validation.json`：主体开口边、非流形边、孤立点均为 0。

动画版已完成独立双臂与 19 骨骨架，包含待机 `Idle` 和 120 帧、24fps 的 `Laugh_Belly`。抬手时腹部不会被手臂权重牵拉，真实嘴孔、牙齿、舌头及眯眼表情已接入。口周重合顶点已焊接清理，五档中间嘴型均无零面积面与反向皮肤面；新脚本在保存组件上的复建检查也已通过。

- [动画 Blender 工程](naiwa_rigged.blend)，躯干与双臂约 30 万面，默认待机第 1 帧。
- [捧腹大笑预览](preview/laugh.png)。
- [5 秒动作预览](preview/Laugh_Belly.mp4)。常态转大笑时闭眼线提前接入，四档过渡近景检查已通过。
- `validation/` 包含动画拓扑、权重、打包参考图及口周清理／源代码复建检查报告。

参考三视图标注 AI 生成，不同视角的受光与细节并不完全一致。剩余差异主要是腹斑色温、下腹阴影，以及参考侧视的少量偏转；本轮不宣称逐点一比一。

## 接手说明

1. 使用 Blender 4.5 LTS 打开 `naiwa.blend` 查看常态，打开 `naiwa_rigged.blend` 播放动作。工程已内嵌参考图，不依赖本机路径。
2. 在动画工程中选择 `Naiwa_SafeRig`，Action Editor 切换 `Idle` / `Laugh_Belly`。手动表情先解除动作关联，再调骨架自定义属性 `laugh`。手指没有独立控制器。
3. 脚本入口与 Python 3.11 安装、重新生成命令见 [README.md](README.md)。静态入口 `make.py`，动画入口 `make.py --rig`；原 `rig.py` / `actions.py` 保留，但未接入新流程。
4. 后续精修继续对照 `refs/turn.png`。优先处理手指内勾、腹斑色温与受光；动画双臂独立于躯干，常态肩部接合与静态工程有少量差异。不要混用单独正面帧的尺度去修改三视图轮廓。
