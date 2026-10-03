"""一键生成站姿模型：SDF → 网格 → 材质/眼睛/嘴 → 灯光相机 → 保存 naiwa.blend。

    python blender/naiwa/make.py [--out blender/naiwa] [--voxel 0.003] [--faces 200000]

（骨骼和动作在 rig.py / actions.py，是上一版外形的，等新外形确认后再按新模型重做。）
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build  # noqa: E402

import bpy  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='blender/naiwa')
    ap.add_argument('--voxel', type=float, default=0.003)
    ap.add_argument('--faces', type=int, default=200000)
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    build.build(args.voxel, args.faces)
    # 灯光、背景、相机一起存进去，打开 .blend 直接 F12 就能渲染
    cam = build.studio()
    build.aim(cam, (-1.9, -2.8, 0.75), (0, 0, 0.5), 85)
    bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 1080
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, 'naiwa.blend')), compress=True)
    print('saved', flush=True)


if __name__ == '__main__':
    main()
