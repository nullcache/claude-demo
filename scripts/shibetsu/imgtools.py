"""素材处理小工具：抠图（rembg isnet）、去除物体（LaMa ONNX）、合成。

模型：
  rembg isnet-general-use（首次运行自动下载到 ~/.rembg）
  LaMa ONNX：https://huggingface.co/Carve/LaMa-ONNX  lama_fp32.onnx（Apache-2.0），路径由 LAMA_ONNX 指定
"""
from __future__ import annotations

import os
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageFilter


def load(path, size=None) -> np.ndarray:
    im = Image.open(path).convert('RGB')
    if size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def save(arr: np.ndarray, path, quality=92):
    a = np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)
    mode = 'RGBA' if a.shape[2] == 4 else 'RGB'
    im = Image.fromarray(a, mode)
    if path.endswith('.jpg'):
        im.convert('RGB').save(path, quality=quality, subsampling=0)
    elif path.endswith('.webp'):
        im.save(path, quality=quality, method=6)
    else:
        im.save(path, optimize=True)


@lru_cache(maxsize=1)
def _rembg():
    from rembg import new_session
    return new_session('isnet-general-use')


def matte(rgb: np.ndarray) -> np.ndarray:
    """返回 [0,1] alpha。"""
    from rembg import remove
    im = Image.fromarray((rgb * 255).astype(np.uint8))
    out = remove(im, session=_rembg(), only_mask=True, post_process_mask=False)
    return np.asarray(out).astype(np.float32) / 255


@lru_cache(maxsize=1)
def _lama():
    import onnxruntime as ort
    path = os.environ.get('LAMA_ONNX', os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    return ort.InferenceSession(path, providers=['CPUExecutionProvider'])


def inpaint(rgb: np.ndarray, mask: np.ndarray, dilate=12, margin=0.6, feather=6) -> np.ndarray:
    """用 LaMa 补掉 mask（>0.5）区域。只在 mask 外接框（加边距）里做，缩到 512 推理再贴回。"""
    H, W = mask.shape
    m = (mask > 0.5).astype(np.uint8)
    if dilate:
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1)))
    ys, xs = np.nonzero(m)
    if len(xs) == 0:
        return rgb
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0) * (1 + margin)
    side = int(min(max(side, 256), max(W, H)))
    bx0 = int(np.clip(cx - side / 2, 0, max(0, W - side)))
    by0 = int(np.clip(cy - side / 2, 0, max(0, H - side)))
    bw, bh = min(side, W), min(side, H)
    crop = rgb[by0:by0 + bh, bx0:bx0 + bw]
    cm = m[by0:by0 + bh, bx0:bx0 + bw].astype(np.float32)
    img = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA)
    msk = (cv2.resize(cm, (512, 512), interpolation=cv2.INTER_NEAREST) > 0.5).astype(np.float32)
    out = _lama().run(None, {'image': img.transpose(2, 0, 1)[None].astype(np.float32), 'mask': msk[None, None]})[0][0]
    out = out.transpose(1, 2, 0)
    if out.max() > 2:
        out = out / 255
    out = cv2.resize(out, (bw, bh), interpolation=cv2.INTER_CUBIC)
    soft = cv2.GaussianBlur(cm, (0, 0), feather) if feather else cm
    soft = np.clip(soft * 1.6, 0, 1)[..., None]
    res = rgb.copy()
    res[by0:by0 + bh, bx0:bx0 + bw] = crop * (1 - soft) + out * soft
    return res


def remove_object(rgb, alpha, **kw):
    return inpaint(rgb, alpha, **kw)


def comp(bg: np.ndarray, fg: np.ndarray, alpha: np.ndarray, x: int, y: int) -> np.ndarray:
    """把 fg（带 alpha）贴到 bg 的 (x, y) 左上角，越界部分裁掉。"""
    out = bg.copy()
    H, W = bg.shape[:2]
    h, w = fg.shape[:2]
    sx0, sy0 = max(0, -x), max(0, -y)
    dx0, dy0 = max(0, x), max(0, y)
    dx1, dy1 = min(W, x + w), min(H, y + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return out
    a = alpha[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0, None]
    out[dy0:dy1, dx0:dx1] = out[dy0:dy1, dx0:dx1] * (1 - a) + fg[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0] * a
    return out


def bbox(alpha, thr=0.5):
    ys, xs = np.nonzero(alpha > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def rgba(rgb, alpha):
    return np.concatenate([rgb, alpha[..., None]], axis=2)


def crop_rgba(rgb, alpha, pad=8):
    x0, y0, x1, y1 = bbox(alpha, 0.02)
    H, W = alpha.shape
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    return rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1], (x0, y0)


def match_color(fg, alpha, ref, amount=0.5):
    """把前景的均值/方差往参考区域靠一点（逐通道，在 Lab 里做）。"""
    fl = cv2.cvtColor(fg.astype(np.float32), cv2.COLOR_RGB2LAB)
    rl = cv2.cvtColor(ref.astype(np.float32), cv2.COLOR_RGB2LAB)
    m = alpha > 0.5
    out = fl.copy()
    for c in range(3):
        fm, fs = fl[..., c][m].mean(), fl[..., c][m].std() + 1e-5
        rm, rs = rl[..., c].mean(), rl[..., c].std() + 1e-5
        tgt = (fl[..., c] - fm) / fs * (fs * (1 - amount) + rs * amount * (0.6 if c == 0 else 1)) + fm * (1 - amount) + rm * amount * (0.35 if c == 0 else 1) + fm * amount * (0.65 if c == 0 else 0)
        out[..., c] = tgt
    return np.clip(cv2.cvtColor(out, cv2.COLOR_LAB2RGB), 0, 1)


def contact_shadow(shape, alpha, x, y, strength=0.45, blur=18, squash=0.18, offset=(0, 0)):
    """根据前景 alpha 底部生成一块压扁的接触阴影（返回与 bg 同尺寸的阴影遮罩）。"""
    H, W = shape[:2]
    h, w = alpha.shape
    ys, xs = np.nonzero(alpha > 0.5)
    foot_y = ys.max()
    xl, xr = xs[ys > foot_y - h * 0.08].min(), xs[ys > foot_y - h * 0.08].max()
    sh = np.zeros((H, W), np.float32)
    cx = x + (xl + xr) / 2 + offset[0]
    cy = y + foot_y + offset[1]
    cv2.ellipse(sh, (int(cx), int(cy)), (int((xr - xl) * 0.62), max(2, int(h * squash * 0.18))), 0, 0, 360, 1.0, -1)
    sh = cv2.GaussianBlur(sh, (0, 0), blur)
    return sh / max(sh.max(), 1e-5) * strength


@lru_cache(maxsize=1)
def _sr():
    import onnxruntime as ort
    path = os.environ.get('SR_ONNX', os.path.expanduser('~/.cache/lama/realesr-general-x4v3.onnx'))
    return ort.InferenceSession(path, providers=['CPUExecutionProvider'])


def upscale4x(rgb: np.ndarray, tile=384, pad=16) -> np.ndarray:
    """Real-ESRGAN realesr-general-x4v3，分块推理避免爆内存。"""
    H, W = rgb.shape[:2]
    out = np.zeros((H * 4, W * 4, 3), np.float32)
    s = _sr()
    name = s.get_inputs()[0].name
    for y0 in range(0, H, tile):
        for x0 in range(0, W, tile):
            y1, x1 = min(H, y0 + tile), min(W, x0 + tile)
            py0, px0, py1, px1 = max(0, y0 - pad), max(0, x0 - pad), min(H, y1 + pad), min(W, x1 + pad)
            t = rgb[py0:py1, px0:px1].transpose(2, 0, 1)[None].astype(np.float32)
            o = s.run(None, {name: t})[0][0].transpose(1, 2, 0)
            oy, ox = (y0 - py0) * 4, (x0 - px0) * 4
            out[y0 * 4:y1 * 4, x0 * 4:x1 * 4] = o[oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
    return np.clip(out, 0, 1)


def fit(rgb: np.ndarray, W=1080, H=1920, anchor=(0.5, 0.5)) -> np.ndarray:
    """等比缩放铺满 W×H，多出来的按 anchor 裁掉。"""
    h, w = rgb.shape[:2]
    s = max(W / w, H / h)
    nw, nh = int(round(w * s)), int(round(h * s))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    r = cv2.resize(rgb, (nw, nh), interpolation=interp)
    x0 = int((nw - W) * anchor[0])
    y0 = int((nh - H) * anchor[1])
    return r[y0:y0 + H, x0:x0 + W]
