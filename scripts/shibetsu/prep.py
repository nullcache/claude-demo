"""《死別》奶娃版 MV 素材生成。

输入：Nailong-Studio/wallpaper（MIT）里的奶蛙图，路径由 NAIWA_REPO 指定
     （git clone --depth 1 https://github.com/Nailong-Studio/wallpaper）
输出：public/shibetsu/img/*（背景净版、奶娃抠图层、闪切合成帧）+ manifest.json（各层摆放位置）

    NAIWA_REPO=/path/to/wallpaper python scripts/shibetsu/prep.py [镜头名 ...]

依赖：numpy pillow opencv-python-headless rembg onnxruntime；LaMa 与 Real-ESRGAN 的 ONNX 见 imgtools.py
"""
from __future__ import annotations

import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from imgtools import (bbox, comp, crop_rgba, fit, inpaint, load, matte, rgba, save, upscale4x)  # noqa: E402

REPO = os.environ.get('NAIWA_REPO', '/home/user/nailong-studio/wallpaper')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'shibetsu', 'img')
CACHE = os.environ.get('PREP_CACHE', '/tmp/shibetsu-cache')
W, H = 1080, 1920
os.makedirs(OUT, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

manifest_path = os.path.join(OUT, 'manifest.json')
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}


def art(n):
    for ext in ('.png', '.jpg'):
        p = os.path.join(REPO, 'art', f'奶蛙-艺术-{n}{ext}')
        if os.path.exists(p):
            return p
    raise FileNotFoundError(n)


def cached(name, fn):
    p = os.path.join(CACHE, name + '.npy')
    if os.path.exists(p):
        return np.load(p)
    v = fn()
    np.save(p, v)
    return v


def out(name):
    return os.path.join(OUT, name)


def layer(name, rgb, a, pos, quality=90):
    """存一张抠图层（webp 带透明），返回 manifest 条目。"""
    path = f'{name}.webp'
    save(rgba(rgb, a), out(path), quality=quality)
    h, w = a.shape
    return {'src': path, 'x': int(pos[0]), 'y': int(pos[1]), 'w': int(w), 'h': int(h)}


def scale_rgba(rgb, a, s):
    h, w = a.shape
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    return np.clip(cv2.resize(rgb, (nw, nh), interpolation=interp), 0, 1), np.clip(cv2.resize(a, (nw, nh), interpolation=interp), 0, 1)


def fade_bottom(a, frac=0.08, power=1.5):
    h = a.shape[0]
    n = max(1, int(h * frac))
    ramp = np.ones(h, np.float32)
    ramp[h - n:] = np.linspace(1, 0, n) ** power
    return a * ramp[:, None]


def plate(n, anchor=(0.5, 0.5), sr=False):
    def f():
        rgb = load(art(n))
        if sr:
            rgb = upscale4x(rgb)
        return fit(rgb, W, H, anchor)
    return cached(f'plate_{n}', f)


def clean_plate(n, rgb, a, **kw):
    return cached(f'clean_{n}', lambda: inpaint(rgb, a, **kw))


# ───────────────────────── 单只奶娃（经典站姿）─────────────────────────

def standing_naiwa():
    """laugh-gallery/奶蛙-静站绿眼.png：最经典的奶娃站姿。超分 4×后抠图。"""
    def f():
        src = load(os.path.join(REPO, 'laugh-gallery', '奶蛙-静站绿眼.png'))
        a0 = matte(src)
        big = upscale4x(src)
        a = cv2.resize(a0, (big.shape[1], big.shape[0]), interpolation=cv2.INTER_CUBIC)
        a = np.clip((a - 0.5) * 1.6 + 0.5, 0, 1)  # 收一下边，避免白底发虚
        rgb, a, _ = crop_rgba(big, a, pad=4)
        # 去白边：边缘半透明处往内部颜色收
        core = cv2.erode((a > 0.9).astype(np.uint8), np.ones((5, 5), np.uint8))
        blur = cv2.GaussianBlur(rgb * core[..., None], (0, 0), 6)
        wsum = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 6)[..., None] + 1e-4
        edge = (a < 0.95)[..., None]
        rgb = np.where(edge, blur / wsum, rgb)
        return np.dstack([rgb, a])
    v = cached('standing', f)
    return v[..., :3], v[..., 3]


def relight(rgb, a, tint=(1, 1, 1), gain=1.0, gamma=1.0, rim=(0, 0, 0), rim_dir=(1, 0), rim_w=10, desat=0.0):
    """粗略地让棚拍的奶娃融进场景：整体着色、明暗、轮廓光。"""
    x = np.clip(rgb, 0, 1) ** gamma * gain * np.array(tint, np.float32)
    if desat:
        g = x.mean(axis=2, keepdims=True)
        x = x * (1 - desat) + g * desat
    if any(rim):
        dx, dy = rim_dir
        M = np.float32([[1, 0, -dx * rim_w], [0, 1, -dy * rim_w]])
        shifted = cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), borderValue=0)
        edge = np.clip(a - shifted, 0, 1)
        edge = cv2.GaussianBlur(edge, (0, 0), rim_w * 0.5)
        x = x + edge[..., None] * np.array(rim, np.float32)
    return np.clip(x, 0, 1)


def shadow_ellipse(shape, cx, cy, rx, ry, strength=0.5, blur=14):
    m = np.zeros(shape[:2], np.float32)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), blur)
    return m / max(m.max(), 1e-5) * strength


def put_pair(bg, height, feet_y, cx, gap, look, shadow=0.45, reflect=0.0, fade=0.0, bottom_fade=0.0):
    """两只奶娃并肩站：左边原图（看向右），右边镜像（看向左），彼此相望。"""
    rgb, a = standing_naiwa()
    s = height / a.shape[0]
    r, al = scale_rgba(rgb, a, s)
    if bottom_fade:
        al = fade_bottom(al, bottom_fade)
    r = relight(r, al, **look)
    img = bg.copy()
    h, w = al.shape
    xs = [cx - gap / 2 - w / 2, cx + gap / 2 - w / 2]
    flips = [False, True]
    for x, fl in zip(xs, flips):
        rr, aa = (r[:, ::-1], al[:, ::-1]) if fl else (r, al)
        if shadow:
            sh = shadow_ellipse(img.shape, x + w / 2, feet_y - 4, w * 0.42, h * 0.035, shadow, blur=h * 0.02)
            img = img * (1 - sh[..., None])
        if reflect:
            rf, af = rr[::-1], aa[::-1] * reflect
            af = af * np.linspace(1, 0, h)[:, None] ** 1.5
            rf = cv2.GaussianBlur(rf, (0, 0), 2)
            img = comp(img, rf, af, int(x), int(feet_y))
        img = comp(img, rr, aa, int(x), int(feet_y - h))
    return img


# ───────────────────────── 各镜头 ─────────────────────────

def s01_shore():
    """海边：原图那只留在原位，只把它抠成一层用来呼吸（底下垫补好的背景）。"""
    rgb = plate('04')
    a = cached('matte_04', lambda: matte(rgb))
    bg = clean_plate('04', rgb, a, dilate=14, margin=0.5)
    fr, fa, (x0, y0) = crop_rgba(rgb, a, pad=6)
    save(bg, out('s01_bg.jpg'))
    manifest['s01'] = {'bg': 's01_bg.jpg', 'layers': [layer('s01_a', fr, fa, (x0, y0))]}


def s02_morning():
    rgb = cached('plate_morning', lambda: fit(load(os.path.join(REPO, 'frames', '最伟大的奶蛙_0.5s.png'))))
    save(rgb, out('s02.jpg'))
    manifest['s02'] = {'bg': 's02.jpg'}


def simple(name, n, anchor=(0.5, 0.5), sr=False):
    rgb = plate(n, anchor, sr)
    save(rgb, out(f'{name}.jpg'))
    manifest[name] = {'bg': f'{name}.jpg'}


HOPPER_CROP = (722, 0, 1127, 720)   # 原图 1280×720 里竖屏要用的区域
HOPPER_SPLIT = np.array([(912, 230), (1110, 230), (1110, 720), (812, 720), (834, 650), (852, 595), (853, 530), (872, 505), (908, 486), (909, 400)], np.int32)


SILL_TOP, WALL_TOP = 497, 531      # 门廊边沿顶面 / 白墙正面开始的行
TEX_X0, TEX_X1 = 1040, 1120        # 右侧没被挡住、也没有影子的干净纹理


def rebuild_porch(src, alone, right, left):
    """LaMa 把右边那只腿后面补成了一大块发糊的暗色。台阶边沿和白墙按行用右侧干净纹理平铺回来，
    再给左边那只画上它自己的投影，最后把左边那只原样贴回去（它的手臂边缘也被 LaMa 碰过）。"""
    Hh, Ww = right.shape
    fix = alone.copy()
    yy, xx = np.mgrid[0:Hh, 0:Ww]
    n = TEX_X1 - TEX_X0
    # 墙面：镜像平铺（油画笔触，看不出对称）
    k = np.maximum(TEX_X0 - xx, 0) % (2 * n)
    sx = np.where(k < n, TEX_X0 + k, TEX_X0 + 2 * n - 1 - k)
    tiled = src[yy, sx]
    # 台阶边沿是几条横向的色带：用每行的均色 + 一半的细节（循环平铺），避免镜像接缝的凸起
    wrap = src[yy, TEX_X0 + (np.maximum(TEX_X0 - xx, 0) % n)]
    rowmean = src[:, TEX_X0:TEX_X1].mean(axis=1, keepdims=True)
    rowmean = np.repeat(rowmean, Ww, axis=1)
    sill = rowmean + 0.5 * (wrap - cv2.blur(wrap, (9, 1)))
    is_sill = ((yy >= SILL_TOP) & (yy < WALL_TOP))[..., None]
    tex = np.where(is_sill, sill, tiled)
    # 要重建的范围：右边那只（含它的投影）+ 墙面上所有偏暗的地方，但只在左边那只右侧
    lmask = left > 0.5
    lmax = np.where(lmask.any(axis=1), Ww - 1 - np.argmax(lmask[:, ::-1], axis=1), -1)
    right_of_left = xx > (lmax[:, None] + 2)
    dark = (src.mean(axis=2) < 0.42) & (yy >= WALL_TOP)
    reg = cv2.dilate((right > 0.15).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
    reg = (reg | dark) & (yy >= SILL_TOP) & (xx < TEX_X0) & right_of_left
    soft = cv2.GaussianBlur(reg.astype(np.float32), (0, 0), 2)[..., None]
    fix = fix * (1 - soft) + tex * soft
    # 左边那只的投影：光从左上来，影子落在它右侧的墙面和台阶上
    lm = lmask.astype(np.float32)
    M = np.float32([[1, 0, 26], [0, 1, 7]])
    sh = cv2.warpAffine(lm, M, (Ww, Hh))
    sh = cv2.GaussianBlur(sh, (0, 0), 5) * (yy >= SILL_TOP)
    sh = sh * (soft[..., 0] > 0.01)
    fix = fix * (1 - 0.6 * sh[..., None])
    # 左边那只原样贴回
    lf = cv2.GaussianBlur(lm, (0, 0), 0.8)[..., None]
    lf = np.clip(np.maximum(lf, left[..., None]), 0, 1)
    return fix * (1 - lf) + src * lf


def s06_summer_evening():
    """霍普《夏夜》：两只坐在门廊上 → 右边那只化成光点散去。
    输出两张竖屏底图（两只 / 一只）+ 一张遮罩：R = 右边那只（扩一圈，随噪声扫掠消散），
    G = 两张图其余的差别（主要是它投在墙上的影子，跟着一起淡掉）。"""
    src = load(os.path.join(REPO, 'frames', '孤独奶蛙主义_20s.png'))
    a = cached('matte_hopper', lambda: matte(src))
    pm = np.zeros(a.shape, np.uint8)
    cv2.fillPoly(pm, [HOPPER_SPLIT], 1)
    right = a * pm
    left = a * (1 - pm)
    alone = cached('clean_hopper', lambda: inpaint(src, right, dilate=10, margin=0.5))
    alone = rebuild_porch(src, alone, right, left)
    x0, y0, x1, y1 = HOPPER_CROP
    pad = 16

    def vert(img):
        c = img[y0:y1, max(0, x0 - pad):x1 + pad]
        big = upscale4x(c)
        big = big[:, pad * 4:pad * 4 + (x1 - x0) * 4]
        return cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)

    both_v = cached('hopper_both_v', lambda: vert(src))
    alone_v = vert(alone)
    save(both_v, out('s06_both.jpg'), quality=93)
    save(alone_v, out('s06_alone.jpg'), quality=93)
    # R：右边那只外扩一圈（把发虚的边、AI 碰过的地方都包进来），但不碰左边那只
    lhard = cv2.dilate((left > 0.5).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    ext = cv2.dilate((right > 0.05).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))).astype(np.float32)
    ext = np.clip(cv2.GaussianBlur(ext, (0, 0), 1.5) * (1 - lhard), 0, 1)
    # G：其余两张图不一样的地方（影子）
    diff = np.abs(src - alone).max(axis=2)
    diff = cv2.GaussianBlur((diff > 0.04).astype(np.float32), (0, 0), 3)
    g = np.clip(diff * 1.5, 0, 1) * (1 - ext) * (1 - lhard)

    def crop_m(mk):
        c = mk[y0:y1, x0:x1]
        return np.clip(cv2.resize(c, (W, H), interpolation=cv2.INTER_CUBIC), 0, 1)

    rgb = np.dstack([crop_m(ext), crop_m(g), np.zeros((H, W), np.float32)])
    cv2.imwrite(out('s06_rmask.png'), cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
    manifest['s06'] = {'both': 's06_both.jpg', 'alone': 's06_alone.jpg', 'rmask': 's06_rmask.png'}


def s08_grass():
    """草地：仰面躺着的那只缩小挪到右边，左边再躺一只（镜像、微微转向它）。"""
    rgb = plate('29')
    a = cached('matte_29', lambda: matte(rgb))
    # 抠图漏掉了腿和投在右下的影子：低阈值 + 朝右下多扩一圈
    m = (a > 0.03).astype(np.uint8)
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    sh = np.zeros_like(m)
    sh[14:, 18:] = m[:-14, :-18]
    bg = clean_plate('29b', rgb, np.maximum(m, sh).astype(np.float32), dilate=10, margin=0.4)
    save(bg, out('s08_bg.jpg'))
    soft = np.clip((a - 0.02) / 0.25, 0, 1)  # 腿的 matte 值很低，放宽阈值把腿抠全
    soft = cv2.GaussianBlur(soft, (0, 0), 1.2)
    fr, fa, (x0, y0) = crop_rgba(rgb, soft, pad=6)
    s = 0.66
    ar, aa = scale_rgba(fr, fa, s)
    h, w = aa.shape
    # 右边：原图那只，稍微逆时针转
    def rot(r, al, deg):
        M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
        return (np.clip(cv2.warpAffine(r, M, (w, h), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0)), 0, 1),
                np.clip(cv2.warpAffine(al, M, (w, h), flags=cv2.INTER_CUBIC, borderValue=0), 0, 1))
    r1, a1 = rot(ar, aa, 8)
    r2, a2 = rot(ar[:, ::-1].copy(), aa[:, ::-1].copy(), -10)
    cy = y0 + fa.shape[0] / 2
    L = [layer('s08_l', r2, a2, (W / 2 - w + 120, cy - h / 2 + 30)), layer('s08_r', r1, a1, (W / 2 - 110, cy - h / 2 - 20))]
    manifest['s08'] = {'bg': 's08_bg.jpg', 'layers': L}


# 闪切：每一格都是不同的夏天，两只奶娃永远站在画面同一个位置（致敬原 PV 季节轮转的定点构图）
FLICKER = [
    # (art 编号, 站位参数, 打光参数)
    ('04', dict(height=570, feet_y=1560, bottom_fade=0.10, shadow=0.0), dict(tint=(0.92, 0.95, 1.0), gain=0.95, rim=(0.25, 0.25, 0.28), rim_dir=(-1, -0.3))),
    ('05', dict(height=570, feet_y=1560, shadow=0.55), dict(tint=(1.0, 0.72, 0.45), gain=0.62, gamma=1.1, rim=(1.0, 0.62, 0.25), rim_dir=(0, -1), rim_w=8)),
    ('08', dict(height=570, feet_y=1560, bottom_fade=0.12, shadow=0.0), dict(tint=(1.0, 0.82, 0.70), gain=0.80, rim=(0.9, 0.55, 0.35), rim_dir=(1, -0.5))),
    ('20', dict(height=570, feet_y=1560, reflect=0.45, shadow=0.15), dict(tint=(0.95, 0.98, 1.0), gain=0.97, rim=(0.3, 0.32, 0.36), rim_dir=(1, -0.6))),
    ('21', dict(height=570, feet_y=1560, shadow=0.5), dict(tint=(0.85, 0.92, 0.80), gain=0.80, rim=(0.15, 0.18, 0.12), rim_dir=(1, -1))),
    ('25', dict(height=570, feet_y=1560, shadow=0.45), dict(tint=(1.0, 0.97, 0.88), gain=0.95, rim=(0.3, 0.28, 0.2), rim_dir=(-1, -0.5))),
    ('14', dict(height=570, feet_y=1560, reflect=0.4, shadow=0.15), dict(tint=(0.92, 0.95, 1.0), gain=0.93, rim=(0.25, 0.27, 0.3), rim_dir=(1, -0.4))),
]


def s09_flicker():
    names = []
    for n, place, look in FLICKER:
        rgb = plate(n)
        a = cached(f'matte_{n}', lambda: matte(rgb))
        if n == '21':  # 跳起来那只脚下还有一块影子
            x0, y0, x1, y1 = bbox(a)
            a = a.copy()
            cv2.ellipse(a, (int((x0 + x1) / 2), int(y1 + 40)), (int((x1 - x0) * 0.6), 40), 0, 0, 360, 1.0, -1)
        bg = clean_plate(n, rgb, a, dilate=16, margin=0.5)
        img = put_pair(bg, cx=500, gap=350, look=look, **place)
        name = f's09_{n}.jpg'
        save(img, out(name), quality=90)
        names.append(name)
    manifest['s09'] = {'frames': names}


def s12_road():
    """夕阳电线杆小路：背影走远；身边一只半透明的影子渐渐散去。"""
    rgb = plate('05')
    a = cached('matte_05', lambda: matte(rgb))
    bg = clean_plate('05', rgb, a, dilate=14, margin=0.5)
    save(bg, out('s12_bg.jpg'))
    fr, fa, (x0, y0) = crop_rgba(rgb, a, pad=6)
    gr, ga = scale_rgba(fr, fa, 0.97)
    manifest['s12'] = {'bg': 's12_bg.jpg', 'layers': [layer('s12_ghost', gr, ga, (x0 - int(fa.shape[1] * 0.78), y0 + 8)), layer('s12_a', fr, fa, (x0, y0))]}


SHOTS = {
    's01': s01_shore,
    's01b': lambda: simple('s01b', '19'),
    's02': s02_morning,
    's03': lambda: simple('s03', '26'),
    's04': lambda: simple('s04', '15'),
    's06': s06_summer_evening,
    's08': s08_grass,
    's09': s09_flicker,
    's11a': lambda: simple('s11a', '13', sr=True),
    's11b': lambda: simple('s11b', '28'),
    's12': s12_road,
    's13': lambda: simple('s13', '20'),
    's14': lambda: simple('s14', '27'),
}

if __name__ == '__main__':
    todo = sys.argv[1:] or list(SHOTS)
    for k in todo:
        print('…', k, flush=True)
        SHOTS[k]()
        json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, indent=1)
    print('done')
