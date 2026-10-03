"""把模型的正/侧面剪影和参考图的剪影按身高对齐叠在一起（红 = 参考，青 = 模型，白 = 重合）。

    python blender/naiwa/silhouette.py OUTDIR [voxel]
参考图的剪影用 rembg 抠出来，缓存在 OUTDIR。
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import shape  # noqa: E402

shape.ARM_ABDUCT = 0.0  # 比对剪影时手臂放下（和参考图一致）

REPO = os.environ.get('NAIWA_REPO', '/home/user/nailong-studio/wallpaper')
FRONT = os.path.join(REPO, 'laugh-gallery', '奶蛙-静站绿眼.png')
SIDE = os.path.join(REPO, 'emotes', '奶蛙-侧立.png')
N = 600  # 输出画布：身高占 N*0.9 像素


def ref_mask(path, cache):
    if os.path.exists(cache):
        return np.asarray(Image.open(cache)) > 127
    from rembg import new_session, remove
    im = Image.open(path).convert('RGB')
    m = remove(im, session=new_session('isnet-general-use'), only_mask=True)
    Image.fromarray(np.asarray(m)).save(cache)
    return np.asarray(m) > 127


def model_masks(voxel):
    b = shape.BOUNDS
    xs = np.arange(b[0, 0], b[0, 1] + voxel, voxel)
    ys = np.arange(b[1, 0], b[1, 1] + voxel, voxel)
    zs = np.arange(b[2, 0], b[2, 1] + voxel, voxel)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    front = np.zeros((len(zs), len(xs)), bool)
    side = np.zeros((len(zs), len(ys)), bool)
    for k, z in enumerate(zs):
        P = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z)], axis=1)
        d, _ = shape.sdf(P)
        inside = d.reshape(X.shape) < 0
        front[k] = inside.any(axis=1)
        side[k] = inside.any(axis=0)
    return xs, ys, zs, front, side


def to_canvas(mask_fn):
    """mask_fn(u, z) → bool，u 为横向归一化坐标（身高=1），返回 N×N 画布。"""
    js, is_ = np.meshgrid(np.arange(N), np.arange(N))
    z = (N * 0.95 - is_) / (N * 0.9)
    u = (js - N / 2) / (N * 0.9)
    return mask_fn(u, z)


def sample(mask, u0, u1, z0, z1):
    H, W = mask.shape

    def f(u, z):
        col = ((u - u0) / (u1 - u0) * (W - 1)).round().astype(int)
        row = ((z1 - z) / (z1 - z0) * (H - 1)).round().astype(int)
        ok = (col >= 0) & (col < W) & (row >= 0) & (row < H)
        out = np.zeros(u.shape, bool)
        out[ok] = mask[row[ok], col[ok]]
        return out
    return f


def overlay(ref, mod):
    img = np.zeros(ref.shape + (3,), np.uint8)
    img[ref & ~mod] = (230, 60, 60)
    img[mod & ~ref] = (60, 210, 230)
    img[ref & mod] = (235, 235, 235)
    # 每 0.1 身高一条横线
    for k in range(11):
        r = int(N * 0.95 - k * 0.1 * N * 0.9)
        if 0 <= r < N:
            img[r, ::4] = (120, 120, 120)
    return img


def main(out, voxel=0.005):
    os.makedirs(out, exist_ok=True)
    fr = ref_mask(FRONT, os.path.join(out, 'ref_front.png'))
    sr = ref_mask(SIDE, os.path.join(out, 'ref_side.png'))
    # 正面参考：头顶到脚底归一化为 0..1，横向以两脚中点为中心
    rows = np.nonzero(fr.any(axis=1))[0]
    top, bot = rows.min(), rows.max()
    h = bot - top
    feet = np.nonzero(fr[bot - 3])[0]
    cx = (feet.min() + feet.max()) / 2
    W = fr.shape[1]
    fref = to_canvas(sample(fr, (0 - cx) / h, (W - 1 - cx) / h, (bot - (fr.shape[0] - 1)) / h, (bot - 0) / h))
    # 侧面参考：用头顶（z=1）和嘴（z=0.842）对齐高度；横向以身体最宽处的中点为 0，厚度 ×0.8
    srows = np.nonzero(sr.any(axis=1))[0]
    stop = srows.min()
    mouth_row = 58  # 量出来的嘴的位置（原图像素）
    sc = (1 - shape.MOUTH_Z) / (mouth_row - stop)
    row_belly = int(stop + (1 - 0.29) / sc)
    cols = np.nonzero(sr[min(row_belly, sr.shape[0] - 1)])[0]
    scx = (cols.min() + cols.max()) / 2
    SW = sr.shape[1]
    sref = to_canvas(lambda u, z: sample(sr, (0 - scx) * sc * 0.8, (SW - 1 - scx) * sc * 0.8, 1 - (sr.shape[0] - 1 - stop) * sc, 1 + stop * sc)(u, z))
    xs, ys, zs, front, side = model_masks(voxel)
    fmod = to_canvas(sample(front[::-1], xs[0], xs[-1], zs[0], zs[-1]))
    # 侧面：脸朝左（-Y 在左）
    smod = to_canvas(sample(side[::-1], ys[0], ys[-1], zs[0], zs[-1]))
    a = overlay(fref, fmod)
    b = overlay(sref, smod)
    Image.fromarray(np.concatenate([a, np.zeros((N, 8, 3), np.uint8), b], axis=1)).save(os.path.join(out, 'overlay.png'))
    # 两腿之间的空隙（中线附近第一段空白）
    def gap(mask, r):
        row = mask[r]
        c = N // 2
        if row[c]:
            return '  (实心)  '
        l = c
        while l > 0 and not row[l]:
            l -= 1
        rr = c
        while rr < N - 1 and not row[rr]:
            rr += 1
        return f'{(l - N / 2) / (N * 0.9):+.3f}..{(rr - N / 2) / (N * 0.9):+.3f}'
    for z in np.arange(0.02, 0.26, 0.02):
        r = int(N * 0.95 - z * N * 0.9)
        print(f'gap z={z:.2f}  ref {gap(fref, r)}  model {gap(fmod, r)}')
    # 正面逐高度的宽度误差
    for z in np.arange(0.05, 1.0, 0.05):
        r = int(N * 0.95 - z * N * 0.9)
        rr = np.nonzero(fref[r])[0]
        mm = np.nonzero(fmod[r])[0]
        f = lambda v: f'{(v.min() - N / 2) / (N * 0.9):+.3f}..{(v.max() - N / 2) / (N * 0.9):+.3f}' if len(v) else '   -   '
        print(f'z={z:.2f}  ref {f(rr)}  model {f(mm)}')


if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.005)
