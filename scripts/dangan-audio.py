#!/usr/bin/env python3
"""
弹丸论破 PV 声音：真实 BGM + 录音音效，按 144 BPM 节拍网格精确剪辑与混音。
输出 public/dangan/score.m4a（不入库，见 .gitignore；渲染前先运行本脚本）。

素材来源（详见 assets/dangan-sfx/CREDITS.md）：
  · BGM「Games Music」— Grigoriy Nuzhny，Mixkit Stock Music Free License（运行时下载）
  · 音效 — Mixkit Sound Effects Free License（运行时下载）
  · 左轮枪声 / 玻璃碎裂 — CC0，已随仓库提供于 assets/dangan-sfx/

用法：python3 scripts/dangan-audio.py
依赖：ffmpeg（含 rubberband 滤镜）、numpy、scipy
"""
import json
import subprocess
import urllib.request
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'dangan-audio'
LOCAL = ROOT / 'assets' / 'dangan-sfx'
OUT = ROOT / 'public' / 'dangan' / 'score.m4a'
SR = 48000
BPM = 144
BEAT = 60 / BPM
DUR = 20.0
N = int(SR * DUR)


def B(x):
    return x * BEAT


# ───────────── 素材 ─────────────
MUSIC_URL = 'https://assets.mixkit.co/music/706/706.mp3'  # Games Music — Grigoriy Nuzhny
TRACK_BPM = 139.99  # 实测（起音包络互相关扫描）
TRACK_FIRST = 0.043  # 第一个小节首拍（秒，原速）

MIXKIT = {
    # 名称: Mixkit 音效 ID
    'bass_hit': 2299,  # Short bass hit
    'drum_hit': 546,  # Cinematic mystery trailer drum hit
    'horror_hit': 565,  # Hard horror hit drum
    'big_impact': 788,  # Big cinematic impact
    'trailer_impact': 2918,  # Epic movie trailer whoosh impact
    'riser': 790,  # Cinematic trailer riser
    'glass_thud': 759,  # Glass break with hammer thud
    'shatter': 1693,  # Shatter shot explosion
    'glass_debris': 172,  # Sweeping glass debris
    'breaking': 3208,  # Breaking apart
    'glass_sting': 677,  # Cinematic glass hit suspense
    'glitch_break': 2951,  # Digital glitch break
    'glitch_static': 1457,  # Glitch static
    'static_elec': 2597,  # Static electric glitch
    'whoosh_fast': 1490,  # Fast whoosh transition
    'whoosh_cine': 1492,  # Cinematic whoosh fast transition
    'swoosh_laser': 1467,  # Cinematic laser swoosh
    'swoosh_fly': 1469,  # Flying fast swoosh
    'sweep': 174,  # Fast sweep transition
    'swoosh_speed': 1484,  # Speeding swoosh
    'whoosh_elec': 2596,  # Electric whoosh
    'punch': 2143,  # Hard and quick punch
    'punch_strong': 2155,  # Impact of a strong punch
    'blood': 263,  # Gore video game blood splash
    'metal_door': 201,  # Prison metal door close
    'metal_slide': 1534,  # Metallic door sliding
    'metal_bar': 3138,  # Metal bar movement hits
    'shutter': 1133,  # Camera shutter click
    'type_hard': 1119,  # Hard typewriter click
    'type_soft': 1125,  # Typewriter soft click
    'click_tone': 2568,  # Cool interface click tone
    'beep': 221,  # Positive interface beep
    'lock_beeps': 2852,  # Electronic lock success beeps
    'gear_lock': 2858,  # Gear metallic lock sound
    'chamber_spin': 1674,  # Revolver chamber spin
    'gun_move': 1668,  # Handgun movement
    'gun_click': 1660,  # Handgun click
    'heartbeat': 498,  # Deep heartbeat impact
    'heartbeat_drum': 559,  # Horror deep drum heartbeat
    'chime': 112,  # Elevator announcement bells
    'slot_wheel': 1933,  # Arcade slot machine wheel
    'slot_win': 1928,  # Slot machine win
    'coins': 1993,  # Clinking coins
    'game_over': 213,  # Arcade retro game over
}
CC0 = {
    'revolver': 'revolver-sw642.flac',  # The Free Firearm Sound Library — S&W 642 .38 Special
    'glass_break': 'glass-break.flac',  # Till Behrend「Glass Break」
    'glass_falling': 'glass-falling.flac',  # rubberduck「75 CC0 breaking / falling / hit sfx」
    'glass_crack': 'glass-crack.flac',
}


def fetch(url: str, dst: Path) -> Path:
    if dst.exists() and dst.stat().st_size > 2048:
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        dst.write_bytes(r.read())
    return dst


def decode(path: Path, filters: str | None = None) -> np.ndarray:
    """任意音频 → (2, n) float64 @48k"""
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', str(path)]
    if filters:
        cmd += ['-af', filters]
    cmd += ['-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)


_sfx_cache: dict[str, np.ndarray] = {}


def sfx(name: str) -> np.ndarray:
    if name not in _sfx_cache:
        if name in CC0:
            _sfx_cache[name] = decode(LOCAL / CC0[name])
        else:
            i = MIXKIT[name]
            p = fetch(f'https://assets.mixkit.co/active_storage/sfx/{i}/{i}-preview.mp3', CACHE / 'sfx' / f'{i}.mp3')
            _sfx_cache[name] = decode(p)
    return _sfx_cache[name]


# ───────────── 工具 ─────────────
def db(x):
    return 10 ** (x / 20)


def fade(sig, fin=0.0, fout=0.0):
    sig = sig.copy()
    n = sig.shape[1]
    if fin > 0:
        k = min(n, int(fin * SR))
        sig[:, :k] *= np.sin(np.linspace(0, np.pi / 2, k)) ** 2
    if fout > 0:
        k = min(n, int(fout * SR))
        sig[:, n - k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return sig


def resample_rate(sig, rate):
    """变速（音高随之变化）：rate<1 变慢变低"""
    n = sig.shape[1]
    idx = np.arange(0, n - 1, rate)
    return np.vstack([np.interp(idx, np.arange(n), ch) for ch in sig])


def pan(sig, p):
    a = (p + 1) * np.pi / 4
    return np.vstack([sig[0] * np.cos(a) * np.sqrt(2), sig[1] * np.sin(a) * np.sqrt(2)])


def hp(sig, fc, order=2):
    sos = butter(order, fc, 'high', fs=SR, output='sos')
    return np.vstack([sosfilt(sos, ch) for ch in sig])


def sweep_lp(sig, fc_fn, block=256):
    out = np.zeros_like(sig)
    zi = [None, None]
    for i in range(0, sig.shape[1], block):
        fc = float(np.clip(fc_fn(i / SR), 60, SR * 0.45))
        sos = butter(2, fc, 'low', fs=SR, output='sos')
        for c in range(2):
            if zi[c] is None:
                zi[c] = np.zeros((sos.shape[0], 2))
            out[c, i:i + block], zi[c] = sosfilt(sos, sig[c, i:i + block], zi=zi[c])
    return out


class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def put(self, t0, sig, gain_db=0.0):
        i0 = int(round(t0 * SR))
        j0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(sig.shape[1] - j0, N - i0)
        if n > 0:
            self.x[:, i0:i0 + n] += db(gain_db) * sig[:, j0:j0 + n]


music, fx = Bus(), Bus()


def cue(name, beat=None, t=None, hit=0.0, gain=0.0, p=0.0, trim_from=None, length=None, fin=0.0, fout=0.0, rate=1.0):
    """把音效 name 的「命中点」hit（秒，素材内）对齐到第 beat 拍（或绝对时间 t）"""
    s = sfx(name)
    if trim_from is not None:
        s = s[:, int(trim_from * SR):]
        hit -= trim_from
    if length is not None:
        s = s[:, :int(length * SR)]
    if rate != 1.0:
        s = resample_rate(s, rate)
        hit /= rate
    s = fade(s, fin, fout or min(0.01, s.shape[1] / SR / 4))
    if p:
        s = pan(s, p)
    at = (B(beat) if beat is not None else t) - hit
    fx.put(at, s, gain)


# ───────────── 音乐：时间伸缩到 144 BPM 后按小节重剪 ─────────────
def build_music():
    src = fetch(MUSIC_URL, CACHE / 'music-706.mp3')
    ratio = BPM / TRACK_BPM
    trk = decode(src, f'rubberband=tempo={ratio:.6f}:transients=crisp:detector=percussive:pitchq=quality')

    # 起音包络：把每个剪辑点吸附到最近的真实鼓点（±25ms）
    mono = trk.mean(0)
    hop = 128
    rms = np.sqrt(np.convolve(mono ** 2, np.ones(hop) / hop, 'same')[::hop])
    env = np.maximum(0, np.diff(np.concatenate([[0], rms])))

    def bar_start(k, beat_off=0.0):
        t = (TRACK_FIRST + (k * 4 + beat_off) * 60 / TRACK_BPM) / ratio
        c = int(t * SR / hop)
        w = int(0.025 * SR / hop)
        lo = max(0, c - w)
        win = env[lo:c + w]
        if len(win) and win.max() > 0:
            c = lo + int(np.argmax(win))
        return c * hop / SR

    def seg(dst_beat, n_beats, bar, beat_off=0.0, fin=0.006, fout=0.012, gain=0.0, proc=None):
        s0 = bar_start(bar, beat_off) - fin
        a = trk[:, int(s0 * SR):int((s0 + fin + n_beats * BEAT) * SR)]
        if proc:
            a = proc(a)
        music.put(B(dst_beat) - fin, fade(a, fin, fout), gain)

    seg(0, 4, 0, fin=0.002)  # 小节 1：前奏（无低频）
    seg(4, 4, 17)  # 小节 2：间奏段 —— 黑白熊
    seg(8, 4, 1)  # 小节 3：A 段 —— 学园 / 名册
    # 小节 4：b12–b14 音乐骤停（尸体发现），b14 起接 C 段前的过门
    seg(14, 2, 23, beat_off=2)
    seg(16, 4, 24)  # 小节 5：C 段落拍 —— 学级裁判
    seg(20, 4, 25)  # 小节 6：无休止议论
    # 小节 7：弹巢装填，低通逐渐收紧，b27 枪响前戛然而止
    seg(24, 3, 26, fout=0.004, proc=lambda a: sweep_lp(a, lambda x: 18000 * (300 / 18000) ** min(1, x / (3 * BEAT))))
    # 小节 8：那是错的！—— 断奏蓄力段，最后 1/8 拍留白
    seg(28, 3.75, 47, fout=0.004)
    seg(32, 4, 48)  # 小节 9：最大落拍 —— 论破！
    # 小节 10：老虎机一拍半 + 磁带停转，GAME OVER 期间让位给 8-bit
    seg(36, 1.75, 49, fout=0.004)
    s0 = bar_start(49, 1.75)
    tail = trk[:, int(s0 * SR):int((s0 + BEAT * 0.6) * SR)]
    rate = np.linspace(1.0, 0.0, int(BEAT * 0.25 * SR)) ** 1.4
    pos = np.cumsum(rate)
    pos = pos[pos < tail.shape[1] - 1]
    stop = np.vstack([np.interp(pos, np.arange(tail.shape[1]), ch) for ch in tail])
    music.put(B(37.75), fade(stop, 0.002, 0.03))
    seg(40, 4, 64)  # 小节 11：标题
    seg(44, 4.5, 65, fout=0.2)  # 小节 12：曲终重击 + 自然衰减
    t = np.arange(N) / SR
    return music.x * np.clip((DUR - t) / 0.12, 0, 1)


# ───────────── 音效编排（与画面同一套拍点） ─────────────
def build_fx():
    # 小节 1：裂缝 / 希望 / 绝望 / 拉远
    cue('bass_hit', 0, hit=0.06, gain=-4)
    cue('whoosh_fast', 0, hit=0.42, gain=-12)
    cue('drum_hit', 1, hit=0.03, gain=-3)
    cue('horror_hit', 2, hit=0.06, gain=-3)
    cue('glitch_break', 2, hit=0.01, gain=-6, p=0.4)
    cue('swoosh_laser', 3.4, hit=0.34, gain=-8, p=-0.3)
    # 小节 2：红眼 / 噗噗噗 / 校规
    cue('glass_sting', 4, hit=0.04, gain=-5, length=2.4, fout=1.0)
    for k, r in enumerate([1.0, 1.12, 1.26, 1.41]):
        cue('click_tone', 4.25 + k * 0.5, gain=-10, rate=r, p=(-0.5 if k % 2 else 0.5))
    cue('punch', 6, hit=0.03, gain=-3)
    for k in range(6):
        cue('type_hard', t=B(6) + k * 0.022, hit=0.14, gain=-14 + k, p=-0.4 + k * 0.16)
    cue('blood', 7, hit=0.05, gain=-2)
    cue('horror_hit', 7, hit=0.06, gain=-2)
    cue('type_soft', 7.5, hit=0.11, gain=-12)
    # 小节 3：学园铁板 / 超高校级名册
    cue('metal_door', 9, gain=-3)
    for k in range(6):
        cue('shutter', 10 + k * 0.25, hit=0.14, gain=-8, p=(-0.3 if k % 2 else 0.3))
    cue('glitch_static', 11.5, gain=-5, length=0.3, fout=0.08)
    cue('glitch_break', 11.5, hit=0.01, gain=-8)
    # 小节 4：尸体发现 / 电梯下行
    cue('blood', 12, hit=0.05, gain=-1)
    cue('drum_hit', 12, hit=0.03, gain=-1)
    cue('punch_strong', 12.25, hit=0.09, gain=-4)
    cue('chime', 12.45, hit=0.1, gain=-5, length=3.0, fout=1.2)
    for k in range(12):
        cue('type_soft', t=B(12.75) + k / 44, hit=0.11, gain=-15, p=0.2)
    cue('metal_slide', 14, hit=0.05, gain=-9)
    for k in range(4):
        cue('bass_hit', 14 + k * 0.5, hit=0.06, gain=-9 + 1.5 * k)
        cue('punch', 14 + k * 0.5, hit=0.03, gain=-11 + k)
    cue('riser', 16, hit=2.55, gain=-3)
    # 小节 5：学级裁判 开庭
    cue('big_impact', 16, hit=2.18, trim_from=1.7, fin=0.3)
    cue('punch_strong', 17, hit=0.09, gain=-5)
    cue('whoosh_cine', 18.3, hit=1.08, gain=-8)
    # 小节 6：无休止议论
    cue('whoosh_elec', 20, hit=0.25, gain=-11)
    cue('beep', 20, hit=0.1, gain=-12)
    cue('swoosh_fly', 21.2, hit=0.51, gain=-10, p=-0.5)
    cue('sweep', 22.0, hit=0.52, gain=-10, p=0.5)
    cue('lock_beeps', 23, gain=-9)
    # 小节 7：弹巢旋转（与画面同一角度函数）→ 锁定 → 扳机 → 枪响
    turns, prev = 2.6, None
    for i in range(int(B(1.5) * 1000)):
        tl = i / 1000
        e = 1 - 2 ** (-10 * tl / B(1.5))
        k = int(np.floor((1 - e) * turns * 6))
        if prev is not None and k != prev:
            cue('chamber_spin', t=B(24) + tl, hit=0.01, gain=-9, length=0.09, p=0.25)
        prev = k
    cue('gear_lock', 25.5, hit=0.04, gain=-4)
    cue('gun_move', 26.4, hit=0.04, gain=-7)
    cue('gun_click', 26.6, hit=0.22, gain=-3)
    cue('revolver', 27, hit=0.04)
    cue('bass_hit', 27, hit=0.06, gain=-5)
    cue('swoosh_speed', 27.05, gain=-7, rate=0.62, length=1.2, fout=0.3)
    cue('heartbeat', 27.45, hit=0.04, gain=-6)
    # 小节 8：那是错的！
    cue('glass_thud', 28, hit=0.02, gain=-1)
    cue('glass_break', 28, hit=0.02, gain=-2)
    cue('drum_hit', 28, hit=0.03, gain=-3)
    cue('glass_debris', 28.4, hit=0.16, gain=-11)
    cue('whoosh_cine', 28.6, hit=1.08, gain=-8)
    cue('punch_strong', 29, hit=0.09, gain=-2)
    cue('horror_hit', 29, hit=0.06, gain=-5)
    cue('heartbeat_drum', 30.5, hit=0.03, gain=-4)
    cue('heartbeat_drum', 31, hit=0.03, gain=-3)
    cue('riser', 31.75, hit=2.55, gain=-2)
    # 小节 9：论破！
    cue('trailer_impact', 32, hit=3.04, trim_from=2.98)
    cue('shatter', 32, hit=0.01, gain=-2)
    cue('glass_break', 32, hit=0.02, gain=-4)
    cue('bass_hit', 32, hit=0.06, gain=-2)
    cue('breaking', 34, hit=0.09, gain=-6)
    cue('glass_crack', 34, hit=0.02, gain=-8)
    cue('glass_break', 35.25, hit=0.02, gain=-3)
    cue('glass_falling', 35.4, hit=0.02, gain=-6)
    cue('glass_debris', 35.35, hit=0.16, gain=-6)
    # 小节 10：投票老虎机 → GAME OVER
    cue('slot_wheel', 35.3, hit=0.11, gain=-9, length=B(2.2), fout=0.05)
    cue('metal_bar', 35.6, hit=0.07, gain=-9)
    for k in range(3):
        cue('gear_lock', 36.5 + k * 0.5, hit=0.04, gain=-5, p=-0.5 + 0.5 * k)
    cue('slot_win', 37.5, hit=0.12, gain=-9, length=1.0, fout=0.4)
    cue('coins', 37.5, hit=0.08, gain=-6)
    cue('game_over', 38, hit=0.1, gain=-3, length=1.5, fout=0.6)
    # 小节 11–12：标题 → 收尾
    cue('big_impact', 40, hit=2.18, trim_from=1.85, fin=0.25)
    for k, x in enumerate([B(40) + 0.1, B(40.5), B(41), B(41.5)]):
        cue('drum_hit', t=x, hit=0.03, gain=-7 + k)
    cue('revolver', 42, hit=0.04, gain=-1)
    cue('glass_crack', 42, hit=0.02, gain=-5)
    cue('glass_thud', 42, hit=0.02, gain=-9)
    for k in range(11):
        cue('type_soft', t=B(43) + k * 0.05, hit=0.11, gain=-17, p=-0.3 + k * 0.06)
    cue('drum_hit', 44, hit=0.03, gain=-5)
    cue('glass_sting', 45.1, hit=0.04, gain=-9, length=2.0, fout=0.8)
    cue('static_elec', 47.1, hit=0.02, gain=-10, length=0.45, fout=0.2)
    cue('bass_hit', 47.1, hit=0.06, gain=-9)


def main():
    m = build_music()
    build_fx()
    # 大冲击处让音乐让位（预告片式侧链）
    t = np.arange(N) / SR
    duck = np.ones(N)
    for beat, depth in [(16, 5), (27, 9), (28, 6), (29, 3), (32, 5), (40, 5), (42, 6)]:
        dt = t - B(beat)
        duck *= 1 - (1 - db(-depth)) * np.where(dt >= -0.01, np.exp(-np.clip(dt, 0, None) / 0.35), 0)
    mix = hp(m * duck * db(-3.5) + fx.x, 25)
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / 'mix.wav'
    wavfile.write(tmp, SR, (mix / max(np.max(np.abs(mix)), 1e-6) * 0.98).T.astype(np.float32))
    # 两遍 loudnorm：-14 LUFS，真峰值 -1.2 dBTP
    probe = subprocess.run(
        ['ffmpeg', '-hide_banner', '-i', str(tmp), '-af', 'loudnorm=I=-14:TP=-1.2:LRA=11:print_format=json', '-f', 'null', '-'],
        capture_output=True,
        text=True,
    ).stderr
    st = json.loads(probe[probe.rindex('{'):probe.rindex('}') + 1])
    ln = (
        f"loudnorm=I=-14:TP=-1.2:LRA=11:measured_I={st['input_i']}:measured_TP={st['input_tp']}:"
        f"measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true"
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-y', '-i', str(tmp), '-af', f'{ln},aresample=48000', '-t', str(DUR), '-c:a', 'aac', '-b:a', '256k', str(OUT)],
        check=True,
    )
    print('wrote', OUT.relative_to(ROOT), f'{OUT.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
