"""把 naiwa.blend 里的每个动作渲成预览视频，外加 360° 转台，最后拼成一条带标题的 naiwa_showcase.mp4。

    python blender/naiwa/previews.py blender/naiwa/naiwa_rigged.blend OUTDIR [--res 540] [--samples 12] [--only Laugh_Belly]
"""
from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import build  # noqa: E402

LABELS = {
    'Turntable': '转台 360°',
    'Idle': '待机 Idle',
    'Wave': '挥手 Wave',
    'Laugh': '捧腹大笑 Laugh',
    'Laugh_Belly': '捧腹大笑 Laugh_Belly',
    'Walk': '摇摆走 Walk',
    'Jump': '开心跳 Jump',
    'Think': '托腮 Think',
}


def rig():
    return next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)


def render_frames(outdir, frames, res, samples, per_frame=None):
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.cycles.samples = samples
    for i, f in enumerate(frames):
        if per_frame:
            per_frame(i, len(frames))
        sc.frame_set(f)
        sc.render.filepath = os.path.join(outdir, f'{i:04d}.png')
        bpy.ops.render.render(write_still=True)
    print('done', outdir, flush=True)


def encode(frames_dir, mp4, fps=24):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(fps), '-i',
                    os.path.join(frames_dir, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                    '-crf', '20', mp4], check=True)


FONT = os.environ.get('NAIWA_FONT', next((p for p in (
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') if os.path.exists(p)), ''))
ORDER = ['Turntable', 'Idle', 'Wave', 'Laugh', 'Laugh_Belly', 'Walk', 'Jump', 'Think']


def showcase(out):
    """给每段加上中文标题，按顺序拼成一条 naiwa_showcase.mp4。"""
    parts = []
    for name in ORDER:
        src = os.path.join(out, f'{name}.mp4')
        if not os.path.exists(src):
            continue
        txt = os.path.join(out, 'frames', f'{name}.txt')
        with open(txt, 'w', encoding='utf-8') as f:
            f.write(LABELS[name])
        dst = os.path.join(out, 'frames', f'{name}_cap.mp4')
        vf = (f"drawtext=fontfile={FONT}:textfile={txt}:fontsize=h*0.056:fontcolor=white:"
              "box=1:boxcolor=black@0.38:boxborderw=14:x=(w-tw)/2:y=h-th-30")
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vf', vf, '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p', '-crf', '20', dst], check=True)
        parts.append(dst)
    lst = os.path.join(out, 'frames', 'concat.txt')
    with open(lst, 'w') as f:
        f.writelines(f"file '{os.path.abspath(p)}'\n" for p in parts)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                    '-c', 'copy', os.path.join(out, 'naiwa_showcase.mp4')], check=True)
    print('showcase', os.path.join(out, 'naiwa_showcase.mp4'), flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('blend')
    ap.add_argument('out')
    ap.add_argument('--res', type=int, default=540)
    ap.add_argument('--samples', type=int, default=12)
    ap.add_argument('--only', default='')
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    sc = bpy.context.scene
    cam = sc.camera
    r = rig()
    only = set(a.only.split(',')) if a.only else None
    os.makedirs(a.out, exist_ok=True)

    # 每个动作：3/4 侧前方机位
    for act in bpy.data.actions if r is not None else []:
        if only and act.name not in only:
            continue
        r.animation_data.action = act
        f0, f1 = (int(round(v)) for v in act.frame_range)
        build.aim(cam, (0.7, -2.2, 0.7), (0, 0, 0.58), 50)
        frames = list(range(f0, f1 + 1))
        if act.name in ('Walk', 'Idle'):  # 循环动作放两遍
            frames = frames[:-1] * 2 if act.name == 'Walk' else frames[:-1]
        d = os.path.join(a.out, 'frames', act.name)
        render_frames(d, frames, a.res, a.samples)
        encode(d, os.path.join(a.out, f'{act.name}.mp4'))

    # 转台：相机绕一圈（有骨骼时同时播待机）
    if not only or 'Turntable' in only:
        if r is not None and 'Idle' in bpy.data.actions:
            r.animation_data.action = bpy.data.actions['Idle']
        n = 96

        bpy.context.view_layer.update()
        lights = [o for o in bpy.data.objects if o.type == 'LIGHT']
        base = {o.name: o.matrix_world.copy() for o in lights}

        def orbit(i, n):
            # 相机绕一圈，灯组跟着相机转（每个角度都是正前上方打光）
            t = 2 * math.pi * i / n
            dist = 3.4
            build.aim(cam, (dist * math.sin(t), -dist * math.cos(t), 0.62), (0, 0, 0.5), 85)
            for o in lights:
                o.matrix_world = Matrix.Rotation(t, 4, 'Z') @ base[o.name]

        d = os.path.join(a.out, 'frames', 'Turntable')
        render_frames(d, [1 + i for i in range(n)], a.res, a.samples, orbit)
        encode(d, os.path.join(a.out, 'Turntable.mp4'))

    showcase(a.out)


if __name__ == '__main__':
    main()
