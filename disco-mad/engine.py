"""Frame compositor for the Disco Elysium MAD.

Reads a timeline (see timeline.py), composites every output frame with OpenCV
and pipes raw frames into ffmpeg together with the song excerpt.

Coordinates:
  * all times in the timeline are *song* times (seconds into the full track);
  * camera = (cx, cy, z, rot): cx/cy are the normalised source point placed at
    the frame centre, z multiplies the base fit scale, rot is degrees.
"""
import json
import math
import os
import subprocess
import sys
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.environ.get("MAD_MEDIA", os.path.join(ROOT, "media"))
W, H, FPS = 1920, 1080, 30

FONT_SERIF = os.path.join(ROOT, "fonts", "NotoSerifSC-Regular.otf")
FONT_SERIF_B = os.path.join(ROOT, "fonts", "NotoSerifSC-Bold.otf")
FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"


def media(p):
    return p if os.path.isabs(p) else os.path.join(MEDIA, p)


def load_beats():
    with open(media("audio/beats.json")) as f:
        return np.array(json.load(f)["beats"])


# ---------------------------------------------------------------- easing ---
def ease(name, x):
    x = min(max(x, 0.0), 1.0)
    if name == "linear":
        return x
    if name == "in":
        return x * x * x
    if name == "out":
        return 1 - (1 - x) ** 3
    if name == "snap":  # fast start, long settle
        return 1 - (1 - x) ** 5
    return x * x * (3 - 2 * x)  # smooth


def lerp(a, b, x):
    return a + (b - a) * x


# ---------------------------------------------------------------- sources ---
@lru_cache(maxsize=64)
def load_image(path):
    img = cv2.imdecode(np.fromfile(media(path), np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(path)
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4:  # flatten alpha on black
        a = img[:, :, 3:4].astype(np.float32) / 255
        img = (img[:, :, :3].astype(np.float32) * a).astype(np.uint8)
    return img


class VideoReader:
    """Sequential reader of a source segment, resampled to the output fps."""

    def __init__(self, path, start, duration, speed=1.0, crop=None):
        self.path = media(path)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height", "-of", "csv=p=0", self.path],
            capture_output=True, text=True).stdout.strip().split(",")
        self.w, self.h = int(probe[0]), int(probe[1])
        vf = f"setpts=(PTS-STARTPTS)/{speed},fps={FPS}"
        self.n = int(math.ceil(duration * FPS)) + 2
        cmd = ["ffmpeg", "-loglevel", "quiet", "-ss", f"{start:.3f}", "-i", self.path,
               "-t", f"{duration * speed + 0.5:.3f}", "-vf", vf, "-f", "rawvideo",
               "-pix_fmt", "bgr24", "-"]
        raw = subprocess.run(cmd, capture_output=True).stdout
        fsz = self.w * self.h * 3
        cnt = len(raw) // fsz
        self.frames = np.frombuffer(raw[:cnt * fsz], np.uint8).reshape(cnt, self.h, self.w, 3)
        if cnt == 0:
            raise RuntimeError(f"no frames decoded from {path} @ {start}")

    def get(self, i):
        return self.frames[min(max(i, 0), len(self.frames) - 1)]


# ---------------------------------------------------------------- camera ---
def warp(src, cam, fit="cover", bg=None):
    h, w = src.shape[:2]
    cx, cy, z, rot = cam
    base = max(W / w, H / h) if fit == "cover" else min(W / w, H / h)
    s = base * z
    if fit == "cover":  # keep the frame covered: clamp the centre
        half_w, half_h = W / (2 * s), H / (2 * s)
        if rot == 0:
            cx = min(max(cx * w, half_w), w - half_w) / w if half_w * 2 < w else 0.5
            cy = min(max(cy * h, half_h), h - half_h) / h if half_h * 2 < h else 0.5
    a = math.radians(rot)
    ca, sa = math.cos(a) * s, math.sin(a) * s
    px, py = cx * w, cy * h
    M = np.array([[ca, -sa, W / 2 - (ca * px - sa * py)],
                  [sa, ca, H / 2 - (sa * px + ca * py)]], np.float32)
    border = cv2.BORDER_REFLECT101 if fit == "cover" else cv2.BORDER_CONSTANT
    out = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LINEAR if s < 1.6 else cv2.INTER_CUBIC,
                         borderMode=border, borderValue=(0, 0, 0))
    if fit == "contain" and bg is not None:
        mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (W, H))
        m = (mask.astype(np.float32) / 255)[..., None]
        out = (out * m + bg * (1 - m)).astype(np.uint8)
    return out


# ---------------------------------------------------------------- text ---
@lru_cache(maxsize=32)
def font(path, size):
    return ImageFont.truetype(path, size)


def text_layer(lines, max_chars=None, align="center", width=1500, xoff=0):
    """lines: list of (text, font_path, size, rgba, spacing_after).
    Returns RGBA numpy image (premultiplied later) of the whole block."""
    rendered = []
    total = 0
    shown_budget = max_chars
    for txt, fp, size, color, gap in lines:
        if shown_budget is not None:
            vis = txt[:max(0, shown_budget)]
            shown_budget -= len(txt)
        else:
            vis = txt
        f = font(fp, size)
        # wrap by pixel width
        wrapped, cur = [], ""
        for ch in txt:
            test = cur + ch
            if f.getlength(test) > width and cur:
                wrapped.append(cur)
                cur = ch
            else:
                cur = test
        wrapped.append(cur)
        # apply visible budget across wrapped rows
        rows, left = [], len(vis)
        for r in wrapped:
            rows.append((r[:max(0, left)], r))
            left -= len(r)
        rendered.append((rows, f, size, color, gap))
        total += sum(int(size * 1.45) for _ in rows) + gap
    img = Image.new("RGBA", (W, max(1, total + 20)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = 10
    for rows, f, size, color, gap in rendered:
        for vis, full in rows:
            fw = f.getlength(full)
            x = ((W - fw) / 2 if align == "center" else (W - width) / 2) + xoff
            if vis:
                # soft shadow
                for dx, dy, a in ((0, 3, 160), (2, 2, 110), (-2, 2, 110)):
                    d.text((x + dx, y + dy), vis, font=f, fill=(0, 0, 0, a))
                d.text((x, y), vis, font=f, fill=color)
            y += int(size * 1.45)
        y += gap
    return np.array(img)


def blend_rgba(frame, layer, y0, alpha=1.0):
    h = layer.shape[0]
    y0 = int(y0)
    y1 = min(H, y0 + h)
    if y1 <= y0 or alpha <= 0:
        return frame
    ly0 = 0 if y0 >= 0 else -y0
    y0 = max(0, y0)
    lay = layer[ly0:ly0 + (y1 - y0)]
    a = lay[:, :, 3:4].astype(np.float32) / 255 * alpha
    rgb = lay[:, :, 2::-1].astype(np.float32)  # RGBA -> BGR
    reg = frame[y0:y1].astype(np.float32)
    frame[y0:y1] = (reg * (1 - a) + rgb * a).astype(np.uint8)
    return frame


# ---------------------------------------------------------------- fx ---
def vignette_mask():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return np.clip(1.0 - 0.35 * np.clip(d - 0.55, 0, None) ** 1.5, 0, 1)[..., None]


VIG = None


def apply_fx(frame, shot, lt, dur, st, beats):
    global VIG
    fx = shot.get("fx", {})
    out = frame
    if "darken" in fx:
        out = (out.astype(np.float32) * (1 - fx["darken"])).astype(np.uint8)
    if fx.get("vignette"):
        if VIG is None:
            VIG = vignette_mask()
        out = (out.astype(np.float32) * VIG).astype(np.uint8)
    if "rgbsplit" in fx:  # chromatic split pulsing on beats
        amt = fx["rgbsplit"] * beat_pulse(st, beats, 6.0)
        k = int(round(amt))
        if k:
            b, g, r = cv2.split(out)
            r = np.roll(r, k, axis=1)
            b = np.roll(b, -k, axis=1)
            out = cv2.merge([b, g, r])
    if "flash" in fx and lt < 0.25:  # white flash at shot start
        a = fx["flash"] * (1 - lt / 0.25) ** 2
        out = cv2.addWeighted(out, 1 - a, np.full_like(out, 255), a, 0)
    if "fadein" in fx and lt < fx["fadein"]:
        out = (out * (lt / fx["fadein"])).astype(np.uint8)
    if "fadeout" in fx and dur - lt < fx["fadeout"]:
        out = (out * max(0.0, (dur - lt) / fx["fadeout"])).astype(np.uint8)
    return out


def beat_pulse(st, beats, decay=8.0, every=1):
    i = np.searchsorted(beats, st, side="right") - 1
    if i < 0:
        return 0.0
    if every > 1:
        while i >= 0 and i % every:
            i -= 1
    return math.exp(-decay * (st - beats[i]))


def grain(frame, rng, amount):
    if amount <= 0:
        return frame
    n = rng.normal(0, amount, (H // 2, W // 2, 1)).astype(np.float32)
    n = cv2.resize(n, (W, H))[..., None]
    return np.clip(frame.astype(np.float32) + n, 0, 255).astype(np.uint8)
