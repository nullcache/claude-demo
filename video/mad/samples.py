"""人声采样辅助工具

  python3 samples.py find <asr关键词...>          在 cache/asr/*.json 里搜台词，打印词级时间
  python3 samples.py refine <src> <start> <end>    按音量包络修正边界，打印修正后时间与中位基频

修正后的时间直接抄进 timeline.yaml 的 samples。
"""
import json
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from build import CACHE, SR, decode, src_path  # noqa: E402

ASR_MAP = {"electrochemistry": "p16", "volition": "p7", "inland_empire": "p8", "shivers": "p17"}


def refine(src, s, e, pad=0.35, gap=0.07):
    y = decode(src_path(src), max(0, s - pad), e + pad)
    base = max(0, s - pad)
    hop = int(0.01 * SR)
    rms = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)])
    thr = max(rms.max() * 0.06, np.percentile(rms, 10) * 3)
    on = rms > thr
    i0 = int((s - base) / 0.01)
    i1 = min(len(on) - 1, int((e - base) / 0.01))
    g = int(gap / 0.01)
    # 往前找起音：直到连续 gap 静音
    a = i0
    while a > 0 and on[max(0, a - g):a].any():
        a -= 1
    # 往后找收尾
    b = i1
    while b < len(on) - 1 and on[b:b + g].any():
        b += 1
    a_t, b_t = base + a * 0.01, base + b * 0.01 + 0.03
    # 基频
    import parselmouth

    seg = decode(src_path(src), a_t, b_t)
    p = parselmouth.Sound(seg.astype(np.float64), SR).to_pitch(0.01, 60, 400).selected_array["frequency"]
    f0 = float(np.median(p[p > 0])) if (p > 0).any() else 0
    return round(a_t, 3), round(b_t, 3), f0


def hz_note(f):
    if f <= 0:
        return "-"
    m = 69 + 12 * np.log2(f / 440)
    names = "C C# D D# E F F# G G# A A# B".split()
    r = int(round(m))
    return f"{names[r % 12]}{r // 12 - 1}{'+' if m - r > 0 else '-'}{abs(m - r) * 100:.0f}c"


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "find":
        q = " ".join(sys.argv[2:]).lower()
        for key, stem in ASR_MAP.items():
            f = CACHE / "asr" / f"{stem}.json"
            if not f.exists():
                continue
            for seg in json.loads(f.read_text()):
                if q in seg["text"].lower():
                    print(f"[{key}] " + " ".join(f"{w['w'].strip()}[{w['s']:.2f}-{w['e']:.2f}]" for w in seg["words"]))
    elif cmd == "refine":
        src, s, e = sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
        a, b, f0 = refine(src, s, e)
        print(f"{src} {a} {b}  dur={b - a:.2f}s  f0={f0:.0f}Hz ({hz_note(f0)})")
