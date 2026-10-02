"""逐字对轨：用人声频段的起音检测，把每句歌词的每个字对到实际唱出的时间点。

  python3 scripts/align.py      # 需要 numpy；先跑 node scripts/fetch-source.mjs

输入 public/audio/song.m4a、public/lyrics.json，以及下面 LINES 里每句的大致起点（LRC）。
输出 src/mv/timing.json：每句的起点和逐字时间（只有时间，不含歌词文本）。
"""
import json, re, subprocess, sys
import numpy as np

SR, N, HOP = 22050, 2048, 256
BEAT = 60 / 120.02
GRID0 = 39.0  # 节拍网格相位（实测：拍点落在整秒/半秒上）

# (歌词开头两个字, LRC 起点)：片段内按顺序
LINES = [
    ('只因', 39.36), ('你那', 39.99), ('困在', 41.94), ('我们', 43.92), ('只是', 45.93), ('在这', 47.94),
    ('但别', 49.95), ('至少', 51.93), ('在黑', 53.94), ('即便', 61.65),
    ('忍着', 71.97), ('做出', 73.83), ('列车', 75.87), ('困惑', 77.85), ('但我', 79.98), ('其实', 81.78),
    ('请你', 83.79), ('请你', 85.74),
]
END = 88.0
MAXDUR = {'即便': 4.3, '请你': 1.9, '困惑': 1.5}  # 默认一句 ≈ 一小节


def load():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'public/audio/song.m4a', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def onset_curve(x):
    win = np.hanning(N)
    fr = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * win
    S = np.abs(np.fft.rfft(fr, axis=1)).T  # freq × time
    # HPSS：时间方向中值 = 谐波（人声/和声），频率方向中值 = 打击
    from numpy.lib.stride_tricks import sliding_window_view as swv
    k = 17
    pad_t = np.pad(S, ((0, 0), (k // 2, k // 2)), mode='edge')
    H = np.median(swv(pad_t, k, axis=1), axis=-1)
    pad_f = np.pad(S, ((k // 2, k // 2), (0, 0)), mode='edge')
    P = np.median(swv(pad_f, k, axis=0), axis=-1)
    Hm = S * (H ** 2 / (H ** 2 + P ** 2 + 1e-9))
    f = np.fft.rfftfreq(N, 1 / SR)
    band = (f > 250) & (f < 3500)
    L = np.log1p(50 * Hm[band])
    flux = np.maximum(0, np.diff(L, axis=1)).sum(0)
    flux = np.concatenate([[0], flux])
    flux = np.convolve(flux, np.hanning(5) / np.hanning(5).sum(), mode='same')
    t = (np.arange(len(flux)) * HOP + N / 2) / SR
    return t, flux


def snap(t):
    g = GRID0 + np.round((t - GRID0) / (BEAT / 4)) * (BEAT / 4)
    return g if abs(g - t) < 0.05 else t


def main():
    lyrics = json.load(open('public/lyrics.json', encoding='utf-8'))
    x = load()
    t, flux = onset_curve(x)
    out, cur, prev_last = [], 0, 0.0
    for li, (key, t0) in enumerate(LINES):
        while not lyrics[cur].startswith(key):
            cur += 1
        text = re.sub(r'[^一-鿿]', '', lyrics[cur])
        cur += 1
        n = len(text)
        t1 = LINES[li + 1][1] if li + 1 < len(LINES) else END
        lo = max(t0 - 0.3, prev_last + 0.08)
        hi = min(t1 - 0.06, t0 + MAXDUR.get(key, 2.05))
        m = (t > lo) & (t < hi)
        idx = np.where(m)[0]
        # 局部极大
        pk = [i for i in idx[1:-1] if flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]]
        pk.sort(key=lambda i: -flux[i])
        chosen = []
        for i in pk:
            if all(abs(t[i] - t[j]) > 0.09 for j in chosen):
                chosen.append(i)
            if len(chosen) == n:
                break
        times = sorted(float(t[i]) for i in chosen)
        if len(times) < n:  # 检测不足：在本句时长内均匀补齐
            times = list(np.linspace(max(lo, t0), hi - 0.2, n))
        times = [round(float(snap(v)), 3) for v in times]
        prev_last = times[-1]
        out.append({'key': key, 'lrc': t0, 'start': times[0], 'chars': times})
        print(f'{key} lrc={t0:6.2f} start={times[0]:6.2f} n={n} ' + ' '.join(f'{v:.2f}' for v in times))
    json.dump(out, open('src/mv/timing.json', 'w'), indent=1)


if __name__ == '__main__':
    sys.exit(main())
