"""一键生成站姿模型：SDF → 网格 → 材质/眼睛/嘴 → 灯光相机 → 保存 naiwa.blend。

    python blender/naiwa/make.py [--out blender/naiwa] [--voxel 0.003] [--faces 200000] [--rig]

--rig 使用独立手臂和局部嘴部拓扑，生成常态 / 捧腹大笑动画工程。
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
    ap.add_argument('--faces', type=int, default=200000, help='静态全身或动画躯干面数预算；动画每臂另加约四分之一')
    ap.add_argument('--rig', action='store_true', help='生成带 Idle / Laugh_Belly 的独立手臂动画版')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    if args.rig:
        from component_meshes import build_components
        from animation_safe import add_animation
        body, eyes, arms, mouth = build_components(args.voxel, args.faces)
        add_animation(body, eyes, arms, mouth)
    else:
        build.build(args.voxel, args.faces)
    # 灯光、背景、相机一起存进去，打开 .blend 直接 F12 就能渲染
    cam = build.studio()
    build.aim(cam, (-1.9, -2.8, 0.75), (0, 0, 0.5), 85)
    bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 1080
    for name in ('front.png', 'turn.png', 'laugh.jpg'):
        path = os.path.join(os.path.dirname(__file__), 'refs', name)
        if os.path.exists(path):
            image = bpy.data.images.load(path, check_existing=True)
            image.use_fake_user = True
            image.pack()
    os.makedirs(args.out, exist_ok=True)
    filename = 'naiwa_rigged.blend' if args.rig else 'naiwa.blend'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, filename)), compress=True)
    print('saved', flush=True)


if __name__ == '__main__':
    main()
