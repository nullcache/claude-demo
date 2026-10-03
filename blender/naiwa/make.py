"""一键生成：模型 → 骨骼/蒙皮 → 表情 → 动作 → 灯光相机 → 保存 naiwa.blend。

    python blender/naiwa/make.py [--out blender/naiwa] [--voxel 0.0035] [--test-poses DIR]
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build  # noqa: E402
import rig as R  # noqa: E402
import actions  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def assemble(voxel, faces):
    body, eyes = build.build(voxel, faces)
    arm = R.make_armature()
    R.skin_weights(body, arm)
    R.bake_arms_down(body, arm)
    lin, lin_t = R.face_rig(body, eyes, arm)
    return body, eyes, arm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='blender/naiwa')
    ap.add_argument('--voxel', type=float, default=0.0035)
    ap.add_argument('--faces', type=int, default=120000)
    ap.add_argument('--test-poses', default='')
    ap.add_argument('--no-actions', action='store_true')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    body, eyes, arm = assemble(args.voxel, args.faces)
    if args.test_poses:
        os.makedirs(args.test_poses, exist_ok=True)
        cam = build.studio()
        build.aim(cam, (0.9, -2.0, 0.65), (0, 0, 0.52), 50)
        for name, pose in actions.TEST_POSES.items():
            R.key_pose(arm, 1, pose)
            bpy.context.scene.frame_set(1)
            build.render(os.path.join(args.test_poses, f'{name}.png'), (520, 520), 16)
        return
    if not args.no_actions:
        actions.make_all(arm)
    # 灯光、地面、相机一起存进去，打开 .blend 直接 F12 就能渲染
    cam = build.studio()
    build.aim(cam, (0.7, -2.2, 0.7), (0, 0, 0.56), 50)
    bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 1080
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, 'naiwa.blend')), compress=True)
    print('saved', flush=True)


if __name__ == '__main__':
    main()
