"""模型剪影 vs 参考图剪影（正面 refs/front.png，侧面/背面 refs/turn.png 的左/右三分之一）。

    python blender/naiwa/silhouette.py OUTDIR [voxel]

参考图和模型都按「头顶到脚底 = 1、两脚中点为中心」归一化后叠在一起：红 = 参考，青 = 模型，白 = 重合。
同时打印正面、侧面逐高度的左右边界，和三个角度的 IoU。参考图的剪影（*_mask.png）用 rembg 抠出。
"""
import os
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import shape  # noqa: E402

REFS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'refs')
N = 640


def norm_mask(m, foot_frac=0.0073):
    rows = np.nonzero(m.any(1))[0]
    top, bot = rows.min(), rows.max()
    h = bot - top
    f = np.nonzero(m[int(round(bot - foot_frac * h))])[0]
    return top, bot, h, (f.min() + f.max()) / 2


def to_canvas(m, flip=False):
    top, bot, h, cx = norm_mask(m)
    js, is_ = np.meshgrid(np.arange(N), np.arange(N))
    z = (N * 0.95 - is_) / (N * 0.9)
    u = (js - N / 2) / (N * 0.9)
    if flip:
        u = -u
    col = np.round(cx + u * h).astype(int)
    row = np.round(bot - z * h).astype(int)
    ok = (col >= 0) & (col < m.shape[1]) & (row >= 0) & (row < m.shape[0])
    out = np.zeros((N, N), bool)
    out[ok] = m[row[ok], col[ok]]
    return out


def overlay(ref, mod):
    img = np.zeros(ref.shape + (3,), np.uint8)
    img[ref & ~mod] = (230, 60, 60)
    img[mod & ~ref] = (60, 210, 230)
    img[ref & mod] = (235, 235, 235)
    for k in range(11):
        img[int(N * 0.95 - k * 0.1 * N * 0.9), ::4] = (120, 120, 120)
    return img


def table(ref, mod, label):
    print('==', label)
    for z in np.arange(0.02, 1.0, 0.04):
        r = int(round(N * 0.95 - z * N * 0.9))

        def f(row):
            c = np.nonzero(row)[0]
            return f'{(c.min() - N / 2) / (N * 0.9):+.3f}..{(c.max() - N / 2) / (N * 0.9):+.3f}' if len(c) else '      -      '
        print(f'z={z:.2f}  ref {f(ref[r])}  model {f(mod[r])}')


def main(out, voxel=0.005):
    os.makedirs(out, exist_ok=True)
    t = time.time()
    xs, ys, zs, vol = shape.volume(voxel)
    inside = vol < 0
    front = inside.any(axis=1).T[::-1]   # 行 = z（高→低），列 = x
    side = inside.any(axis=0).T[::-1]    # 列 = y
    print(f'SDF {vol.shape} {time.time() - t:.1f}s')
    fm = np.asarray(Image.open(os.path.join(REFS, 'front_mask.png'))) > 127
    tm = np.asarray(Image.open(os.path.join(REFS, 'turn_mask.png'))) > 127
    pairs = [
        ('front', to_canvas(fm), to_canvas(front)),
        ('side', to_canvas(tm[:, :420]), to_canvas(side, flip=True)),   # 侧面图里脸（-Y）朝右
        ('back', to_canvas(tm[:, 860:]), to_canvas(front, flip=True)),
    ]
    pad = np.zeros((N, 6, 3), np.uint8)
    img = np.concatenate(sum([[overlay(r, m), pad] for _, r, m in pairs], [])[:-1], axis=1)
    Image.fromarray(img).save(os.path.join(out, 'overlay.png'))
    table(pairs[0][1], pairs[0][2], 'front')
    table(pairs[1][1], pairs[1][2], 'side（前 = +）')
    for name, r, m in pairs:
        print(f'IoU {name}: {(r & m).sum() / (r | m).sum():.4f}')


if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.005)
