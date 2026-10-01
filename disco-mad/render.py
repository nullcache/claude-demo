#!/usr/bin/env python3
"""Render the MAD.

  python3 render.py                      # full render -> out/disco_mad.mp4
  python3 render.py --still 64.5 70.2    # PNG stills at song times -> out/stills/
  python3 render.py --range 60 75        # partial render (song times)
  python3 render.py --sheet              # contact sheet of every shot midpoint
"""
import argparse
import os
import subprocess
import sys
import time

import cv2
import numpy as np

import engine as E
import timeline as T

OUT = os.path.join(E.ROOT, "out")


class ShotState:
    def __init__(self, shot):
        self.shot = shot
        self.reader = None
        self.img = None
        self.bg = None
        kind = shot["kind"]
        dur = shot["t1"] - shot["t0"]
        if kind == "video":
            self.reader = E.VideoReader(shot["src"], shot.get("src_in", 0.0), dur,
                                        shot.get("speed", 1.0))
        elif kind == "image":
            self.img = E.load_image(shot["src"])
        if shot.get("fit") == "contain":
            self.bg = np.zeros((E.H, E.W, 3), np.uint8)
            if shot.get("bg") == "blur" and self.img is not None:
                b = E.warp(self.img, (0.5, 0.5, 1.15, 0), "cover")
                b = cv2.GaussianBlur(b, (0, 0), 40)
                self.bg = (b * 0.35).astype(np.uint8)

    def frame(self, st, beats):
        s = self.shot
        dur = s["t1"] - s["t0"]
        lt = st - s["t0"]
        x = E.ease(s.get("ease", "smooth"), lt / dur)
        c0 = s.get("cam0", (0.5, 0.5, 1.0, 0))
        c1 = s.get("cam1", c0)
        cam = [E.lerp(a, b, x) for a, b in zip(c0, c1)]
        if s.get("punch"):
            cam[2] *= 1 + s["punch"] * E.beat_pulse(st, beats, 7.0, s.get("punch_every", 1))
        if s.get("shake"):
            p = E.beat_pulse(st, beats, 9.0)
            k = s["shake"] * p
            cam[0] += k * np.sin(st * 91.0)
            cam[1] += k * np.cos(st * 77.0)
        if s["kind"] == "black":
            src = np.zeros((E.H, E.W, 3), np.uint8)
            return E.apply_fx(src, s, lt, dur, st, beats)
        if self.reader is not None:
            fi = int(round(lt * E.FPS))
            if s.get("freeze") is not None and lt >= s["freeze"]:
                fi = int(round(s["freeze"] * E.FPS))
            src = self.reader.get(fi)
        else:
            src = self.img
        if s.get("crop"):  # normalised pre-crop of the source (x0,y0,x1,y1)
            x0, y0, x1, y1 = s["crop"]
            h, w = src.shape[:2]
            src = src[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
        out = E.warp(src, tuple(cam), s.get("fit", "cover"), self.bg)
        return E.apply_fx(out, s, lt, dur, st, beats)


class TextState:
    cache = {}

    @classmethod
    def layer(cls, item, nchars):
        key = (id(item), nchars)
        if key not in cls.cache:
            cls.cache[key] = E.text_layer(item["lines"], nchars, item.get("align", "center"),
                                          item.get("width", 1500), item.get("xoff", 0))
        return cls.cache[key]


def draw_texts(frame, st):
    for it in T.TEXTS:
        if not (it["t0"] <= st < it["t1"]):
            continue
        lt = st - it["t0"]
        dur = it["t1"] - it["t0"]
        fi, fo = it.get("fadein", 0.15), it.get("fadeout", 0.25)
        a = min(1.0, lt / fi if fi else 1.0, (dur - lt) / fo if fo else 1.0)
        n = None
        if it.get("cps"):  # typewriter
            total = sum(len(l[0]) for l in it["lines"])
            n = min(total, int(lt * it["cps"]))
            if n >= total:
                n = None
        lay = TextState.layer(it, n)
        y = it.get("y", 0.5)
        y0 = y * E.H - (lay.shape[0] / 2 if it.get("anchor", "center") == "center" else 0)
        if it.get("box"):  # dark band behind the text for legibility
            h = lay.shape[0]
            yy0, yy1 = int(max(0, y0 - 18)), int(min(E.H, y0 + h + 18))
            frame[yy0:yy1] = (frame[yy0:yy1].astype(np.float32) * (1 - it["box"] * a)).astype(np.uint8)
        E.blend_rgba(frame, lay, y0, a)
    return frame


def shot_at(st):
    for i, s in enumerate(T.SHOTS):
        if s["t0"] <= st < s["t1"]:
            return i
    return None


def render(t_from, t_to, path, stills=None):
    beats = E.load_beats()
    rng = np.random.default_rng(7)
    cur_i, cur = None, None
    times = stills if stills else [t_from + f / E.FPS for f in range(int(round((t_to - t_from) * E.FPS)))]
    proc = None
    if not stills:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        dur = t_to - t_from
        afade = f"afade=t=in:d=0.06,afade=t=out:st={max(0, dur - T.AUDIO_FADE_OUT):.3f}:d={T.AUDIO_FADE_OUT}"
        proc = subprocess.Popen(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
             "-s", f"{E.W}x{E.H}", "-r", str(E.FPS), "-i", "-",
             "-ss", f"{t_from:.4f}", "-t", f"{dur:.4f}", "-i", E.media(T.SONG),
             "-af", afade, "-map", "0:v", "-map", "1:a",
             "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", path],
            stdin=subprocess.PIPE)
    t_start = time.time()
    for k, st in enumerate(times):
        i = shot_at(st)
        if i is None:
            frame = np.zeros((E.H, E.W, 3), np.uint8)
        else:
            if i != cur_i:
                cur_i, cur = i, ShotState(T.SHOTS[i])
            frame = cur.frame(st, beats)
        frame = draw_texts(frame, st)
        frame = E.grain(frame, rng, T.GRAIN)
        if stills:
            os.makedirs(os.path.join(OUT, "stills"), exist_ok=True)
            p = os.path.join(OUT, "stills", f"{st:07.2f}.png")
            cv2.imwrite(p, frame)
            print(p)
        else:
            proc.stdin.write(frame.tobytes())
            if k % 150 == 0:
                print(f"  {st:6.2f}s  frame {k}/{len(times)}  {time.time() - t_start:5.1f}s", flush=True)
    if proc:
        proc.stdin.close()
        proc.wait()
        print("wrote", path)


def sheet():
    mids = [(s["t0"] + s["t1"]) / 2 for s in T.SHOTS]
    render(0, 0, None, stills=mids)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", nargs="*", type=float)
    ap.add_argument("--range", nargs=2, type=float)
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("-o", default=os.path.join(OUT, "disco_mad.mp4"))
    a = ap.parse_args()
    if a.still:
        render(0, 0, None, stills=a.still)
    elif a.sheet:
        sheet()
    elif a.range:
        render(a.range[0], a.range[1], a.o.replace(".mp4", f"_{a.range[0]:g}-{a.range[1]:g}.mp4"))
    else:
        render(T.SONG_IN, T.SONG_OUT, a.o)
