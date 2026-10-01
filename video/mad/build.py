"""timeline.yaml -> out/<name>.mp4

所有时间都以"拍"为单位（output beat），由 music.grid.beat 换算成秒。
  - 音乐: 按小节编号从原曲里拼接（bars 列表），保证每一刀都在小节线上
  - 人声: 采样放在第几拍；给了 note 就用 Praat 把音高拉平到该音符（"唱"），
          给了 len 就把时长拉伸到该拍数
  - 画面: 每个镜头从 at 开始，持续到下一个镜头；单镜头渲染结果按参数哈希缓存
  - 字幕: 生成 ASS，用 libass 烧录

用法:
  python3 build.py                    # 渲染完整版 -> out/<meta.name>.mp4
  python3 build.py --from 16 --to 32  # 只渲染第 16~32 拍（快速预览）
  python3 build.py --audio-only       # 只出音频 out/<name>.wav
  python3 build.py --stills 0,8,24    # 导出指定拍的静帧 png，用于检查画面/字幕
"""
import argparse
import hashlib
import json
import math
import pathlib
import subprocess

import numpy as np
import soundfile as sf
import yaml

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache"
WORK = CACHE / "work"
OUT = ROOT / "out"
SR = 48000

NOTE_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note_hz(n):
    """'F#4' / 'Bb3' -> Hz"""
    name, octave = n[:-1], int(n[-1])
    semi = NOTE_NAMES[name[0].upper()] + name[1:].count("#") - name[1:].count("b")
    midi = 12 * (octave + 1) + semi
    return 440.0 * 2 ** ((midi - 69) / 12)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(" ".join(map(str, cmd)) + "\n" + r.stderr[-3000:])


def h(obj):
    return hashlib.sha1(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:12]


def src_path(key):
    """素材 key -> 文件路径。key 可以是 trailer 名、cache 相对路径。"""
    for cand in (CACHE / f"trailer_{key}.mp4", CACHE / key):
        if cand.exists():
            return cand
    raise FileNotFoundError(key)


def decode(path, start=None, end=None):
    """解码任意音频片段为 48k 单声道 float32（带缓存）"""
    out = WORK / f"dec_{h([str(path), start, end])}.wav"
    if not out.exists():
        WORK.mkdir(parents=True, exist_ok=True)
        cmd = ["ffmpeg", "-v", "error", "-y"]
        if start is not None:
            cmd += ["-ss", f"{start:.4f}"]
        cmd += ["-i", str(path)]
        if end is not None:
            cmd += ["-t", f"{end - (start or 0):.4f}"]
        run(cmd + ["-ac", "1", "-ar", str(SR), str(out)])
    y, _ = sf.read(out, dtype="float32")
    return y


def db(x):
    return 10 ** (x / 20)


# ───────────────────────────── audio ─────────────────────────────

class Clock:
    def __init__(self, tl):
        g = tl["music"]["grid"]
        self.beat = g["beat"]
        self.t0 = g["t0"]
        self.bpb = tl["music"].get("beats_per_bar", 4)

    def t(self, beats):
        return beats * self.beat


def render_music(tl, clk, n):
    m = tl["music"]
    y = decode(src_path(m["src"]))
    out = np.zeros(n, np.float32)
    bar_len = clk.bpb * clk.beat
    xf = int(0.012 * SR)  # 小节拼接处 12ms 交叉淡化，消除咔哒声
    for i, b in enumerate(m["bars"]):
        if b is None or b == "rest":
            continue
        s = int((clk.t0 + b * bar_len) * SR)
        d0 = int(i * bar_len * SR)
        seg = y[s: s + int(bar_len * SR) + xf].copy()
        seg[:xf] *= np.linspace(0, 1, xf)
        seg[-xf:] *= np.linspace(1, 0, xf)
        seg = seg[: max(0, n - d0)]
        out[d0: d0 + len(seg)] += seg
    out *= db(m.get("gain_db", 0))
    # 自动化：[[beat, db], ...] 线性插值的音量包络
    if "automation" in m:
        pts = np.array(m["automation"], float)
        tt = np.arange(n) / SR
        out *= db(np.interp(tt, clk.t(pts[:, 0]), pts[:, 1]))
    return out


def sing(y, note=None, semitones=None, dur=None, flat=1.0):
    """Praat PSOLA：音高拉平到 note（flat=1 完全拉平，0.5 保留一半语调起伏），时长拉伸到 dur 秒"""
    import parselmouth
    from parselmouth.praat import call

    snd = parselmouth.Sound(y.astype(np.float64), SR)
    man = call(snd, "To Manipulation", 0.01, 60, 400)
    if note or semitones:
        pt = call(man, "Extract pitch tier")
        pitch = snd.to_pitch(0.01, 60, 400)
        f0 = pitch.selected_array["frequency"]
        f0v = f0[f0 > 0]
        if len(f0v):
            med = float(np.median(f0v))
            # 气泡音会让基频检测出现倍频/半频错误：偏离中位数 7 个半音以上的帧钳回中位数
            bad = (f0 > 0) & (np.abs(np.log2(np.where(f0 > 0, f0, med) / med)) > 7 / 12)
            f0 = np.where(bad, med, f0)
            target = note_hz(note) if note else med * 2 ** (semitones / 12)
            if note:
                # 新音高 = target * (原f0/中位数)^(1-flat)：flat=1 完全拉平成一个音，<1 保留部分语调
                call(pt, "Remove points between", snd.xmin, snd.xmax)
                ts = pitch.xs()
                for t, f in zip(ts, f0):
                    if f > 0:
                        call(pt, "Add point", t, target * (f / med) ** (1 - flat))
            else:
                call(pt, "Multiply frequencies", snd.xmin, snd.xmax, target / med)
            call([pt, man], "Replace pitch tier")
    if dur:
        dt = call(man, "Extract duration tier")
        call(dt, "Add point", snd.xmin, dur / snd.duration)
        call([dt, man], "Replace duration tier")
    out = call(man, "Get resynthesis (overlap-add)")
    return out.values[0].astype(np.float32)


def fx_chain(y, fx):
    import pedalboard as pb

    chain = []
    for f in fx or []:
        name, *arg = f.split(":")
        a = [float(x) for x in arg]
        if name == "reverb":      # reverb[:混响量 0-1]
            w = a[0] if a else 0.35
            chain.append(pb.Reverb(room_size=0.85, damping=0.6, wet_level=w, dry_level=1 - w * 0.6, width=1.0))
        elif name == "hall":      # 超长尾巴，用于结尾
            chain.append(pb.Reverb(room_size=0.98, damping=0.3, wet_level=0.6, dry_level=0.5))
        elif name == "delay":     # delay[:秒]
            chain.append(pb.Delay(delay_seconds=a[0] if a else 0.265, feedback=0.35, mix=0.3))
        elif name == "radio":     # 老收音机/内心声音的窄带
            chain += [pb.HighpassFilter(500), pb.LowpassFilter(3200), pb.Distortion(drive_db=6)]
        elif name == "lowpass":
            chain.append(pb.LowpassFilter(a[0] if a else 1500))
        elif name == "warm":
            chain += [pb.LowShelfFilter(200, 2.5), pb.HighShelfFilter(6000, -3)]
        else:
            raise ValueError(f"unknown audio fx {f}")
    if not chain:
        return y
    tail = np.zeros(int(SR * 3), np.float32) if any(f.split(":")[0] in ("reverb", "hall", "delay") for f in fx) else np.zeros(0, np.float32)
    return pb.Pedalboard(chain)(np.concatenate([y, tail]), SR)


def render_voice(tl, clk, n):
    samples = tl.get("samples", {})
    out = np.zeros(n, np.float32)
    duck = np.zeros(n, np.float32)
    for ev in tl.get("voice", []):
        sm = samples[ev["sample"]]
        key = h([sm, {k: ev.get(k) for k in ("note", "semitones", "len", "flat", "fx", "reverse", "speed")}, clk.beat])
        cached = WORK / f"voice_{key}.wav"
        if cached.exists():
            y, _ = sf.read(cached, dtype="float32")
        else:
            y = decode(src_path(sm["src"]), sm["start"], sm["end"])
            fade = int(0.008 * SR)
            y[:fade] *= np.linspace(0, 1, fade)
            y[-fade:] *= np.linspace(1, 0, fade)
            if ev.get("speed"):
                y = sing(y, dur=len(y) / SR / ev["speed"])
            if ev.get("note") or ev.get("semitones") or ev.get("len"):
                y = sing(y, ev.get("note"), ev.get("semitones"),
                         clk.t(ev["len"]) if ev.get("len") else None, ev.get("flat", 1.0))
            if ev.get("reverse"):
                y = y[::-1].copy()
            y = fx_chain(y, ev.get("fx"))
            sf.write(cached, y, SR)
        y = y * db(ev.get("gain_db", 0))
        s = int(clk.t(ev["at"]) * SR)
        y = y[: max(0, n - s)]
        out[s: s + len(y)] += y
        if ev.get("duck", True):
            e = min(n, s + int(len(y) * 0.8))
            duck[s:e] = np.maximum(duck[s:e], 1)
    # 人声出现时把音乐压下去（平滑包络）
    k = int(0.25 * SR)
    duck = np.convolve(duck, np.ones(k) / k, mode="same")
    return out, duck


def render_audio(tl, clk, total_beats):
    import pedalboard as pb

    n = int(clk.t(total_beats) * SR)
    music = render_music(tl, clk, n)
    voice, duck = render_voice(tl, clk, n)
    depth = db(tl["music"].get("duck_db", -7))
    mix = music * (1 - duck * (1 - depth)) + voice
    mix = pb.Pedalboard([pb.Compressor(threshold_db=-18, ratio=2.5, attack_ms=10, release_ms=200),
                         pb.Limiter(threshold_db=-1.0)])(mix, SR)
    # 响度粗略对齐到 -16 dBFS RMS
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix = np.clip(mix * db(-16) / rms, -0.98, 0.98)
    fo = int(clk.t(tl["music"].get("fade_out_beats", 2)) * SR)
    mix[-fo:] *= np.linspace(1, 0, fo) ** 2
    return mix


# ───────────────────────────── video ─────────────────────────────

def shot_filters(sh, dur, fps, W, H):
    """单镜头滤镜链（输出已是 W x H, fps）"""
    sp = sh.get("speed", 1.0)
    f = []
    if sh.get("reverse"):
        f.append("reverse")
    f.append(f"setpts=(PTS-STARTPTS)/{sp}")
    f.append(f"fps={fps}")
    crop = sh.get("crop")  # [x, y, w, h] 0-1 归一化，用于取特写
    if crop:
        x, y, w, hh = crop
        f.append(f"crop=iw*{w}:ih*{hh}:iw*{x}:ih*{y}")
    f.append(f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}")
    for fx in sh.get("fx", []):
        name, *arg = str(fx).split(":")
        a = [float(x) for x in arg]
        if name == "push":   # 缓慢推近 push[:总放大比例]
            z = a[0] if a else 0.08
            nfr = max(1, int(dur * fps))
            f.append(f"zoompan=z='1+{z}*on/{nfr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={fps}")
        elif name == "pull":
            z = a[0] if a else 0.08
            nfr = max(1, int(dur * fps))
            f.append(f"zoompan=z='1+{z}-{z}*on/{nfr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={fps}")
        elif name == "hflip":
            f.append("hflip")
        elif name == "mono":
            f.append("hue=s=0")
        elif name == "dim":  # dim[:亮度]
            f.append(f"eq=brightness={-(a[0] if a else 0.12)}")
        elif name == "blur":
            f.append(f"gblur=sigma={a[0] if a else 6}")
        elif name == "ghost":  # 拖影，迷幻/醉酒感
            f.append("tmix=frames=6:weights='1 1 1 1 1 1'")
        elif name == "flash":  # 开头从白闪入
            f.append(f"fade=t=in:st=0:d={a[0] if a else 0.18}:color=white")
        elif name == "fadein":
            f.append(f"fade=t=in:st=0:d={a[0] if a else 0.5}")
        elif name == "fadeout":
            d = a[0] if a else 0.5
            f.append(f"fade=t=out:st={max(0, dur - d):.3f}:d={d}")
        elif name == "stutter":  # 音MAD 经典：重复开头 N 帧
            k = int(a[0] if a else 4)
            f.append(f"loop=loop=-1:size={k}:start=0")
        else:
            raise ValueError(f"unknown video fx {fx}")
    f.append(f"trim=duration={dur:.4f},setpts=PTS-STARTPTS")
    return ",".join(f)


def render_shot(sh, dur, fps, W, H):
    key = h([sh, round(dur, 4), fps, W, H, "v2"])
    out = WORK / f"shot_{key}.mp4"
    if out.exists():
        return out
    src = src_path(sh["src"])
    sp = sh.get("speed", 1.0)
    vf = shot_filters(sh, dur, fps, W, H)
    if src.suffix.lower() in (".jpg", ".png"):
        cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(fps), "-t", f"{dur + 0.2:.3f}", "-i", str(src)]
    else:
        need = dur * sp + 0.2
        if sh.get("reverse"):
            cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, sh['in'] - need):.3f}", "-t", f"{need:.3f}", "-i", str(src)]
        else:
            cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{sh['in']:.3f}", "-t", f"{need:.3f}", "-i", str(src)]
    run(cmd + ["-an", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", str(out)])
    return out


def grade_filter(tl, W, H, ass):
    g = tl.get("grade", {})
    f = [
        f"eq=saturation={g.get('saturation', 0.78)}:contrast={g.get('contrast', 1.05)}:gamma={g.get('gamma', 0.97)}",
        # 阴影偏青、高光偏暖：油画/旧胶片的冷暖对比
        "colorbalance=rs=-0.04:gs=0.0:bs=0.05:rh=0.06:gh=0.02:bh=-0.05",
        # 抬黑位、压白位：褪色胶片
        "curves=all='0/0.045 0.5/0.48 1/0.94'",
        f"vignette=angle={g.get('vignette', 0.55)}",
        f"noise=alls={g.get('grain', 8)}:allf=t",
    ]
    lb = tl["meta"].get("letterbox")
    if lb:
        bar = int((H - W / lb) / 2)
        f.append(f"drawbox=x=0:y=0:w={W}:h={bar}:color=black:t=fill,drawbox=x=0:y={H - bar}:w={W}:h={bar}:color=black:t=fill")
    if ass:
        f.append(f"subtitles={ass}:fontsdir={CACHE / 'fonts'}")
    return ",".join(f)


# ───────────────────────────── text (ASS) ─────────────────────────────

SKILL_COLORS = {  # ASS 颜色 &HBBGGRR，参照游戏四大属性配色并降饱和
    "int": "&H00D9B65E&",   # Intellect 蓝
    "psy": "&H00D07C8E&",   # Psyche 紫
    "fys": "&H004A4FC4&",   # Physique 红
    "mot": "&H0040B8D8&",   # Motorics 黄
    "none": "&H00C8D2D8&",
}


def ass_time(t):
    cs = int(round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def build_ass(tl, clk, W, H, offset_beats=0):
    lb = tl["meta"].get("letterbox")
    bar = int((H - W / lb) / 2) if lb else 120
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: EN,Libre Baskerville,36,&H00D8E0E6&,&H000000FF&,&H00000000&,&H64000000&,0,0,0,0,100,100,0.5,0,1,0,2,2,160,160,{bar - 66},1
Style: ZH,Noto Serif SC,28,&H00A8B2B8&,&H000000FF&,&H00000000&,&H64000000&,0,0,0,0,100,100,2,0,1,0,2,2,160,160,{bar - 112},1
Style: CENTER,Libre Baskerville,52,&H00D8E0E6&,&H000000FF&,&H00000000&,&H00000000&,0,1,0,0,100,100,1,0,1,0,0,5,160,160,0,1
Style: CENTERZH,Noto Serif SC,30,&H009AA4AA&,&H000000FF&,&H00000000&,&H00000000&,0,0,0,0,100,100,6,0,1,0,0,5,160,160,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for t in tl.get("text", []):
        a = clk.t(t["at"] - offset_beats)
        b = a + clk.t(t["len"])
        if b <= 0:
            continue
        a = max(a, 0)
        fi, fo = t.get("fade", [250, 400])
        if t.get("style") == "center":
            y = H // 2 - 30
            lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},CENTER,,0,0,0,,{{\\fad({fi},{fo})\\pos({W // 2},{y})}}{t['en']}")
            if t.get("zh"):
                lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},CENTERZH,,0,0,0,,{{\\fad({fi},{fo})\\pos({W // 2},{y + 64})}}{t['zh']}")
            continue
        en = t.get("en", "")
        if t.get("skill"):
            col = SKILL_COLORS[t.get("attr", "none")]
            en = f"{{\\c{col}\\b1}}{t['skill'].upper()}{{\\b0\\c&H00D8E0E6&}}  —  {en}"
        if t.get("check"):  # 例: "[Legendary: Failure]"
            en += f"  {{\\c&H00707A80&\\fs30}}{t['check']}"
        lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},EN,,0,0,0,,{{\\fad({fi},{fo})}}{en}")
        if t.get("zh"):
            lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},ZH,,0,0,0,,{{\\fad({fi},{fo})}}{t['zh']}")
    return head + "\n".join(lines) + "\n"


# ───────────────────────────── main ─────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("timeline", nargs="?", default=str(ROOT / "timeline.yaml"))
    ap.add_argument("--from", dest="b0", type=float, default=0)
    ap.add_argument("--to", dest="b1", type=float)
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument("--stills", help="逗号分隔的拍号")
    ap.add_argument("--name")
    args = ap.parse_args()

    tl = yaml.safe_load(open(args.timeline))
    meta = tl["meta"]
    fps = meta.get("fps", 30)
    W, H = meta.get("size", [1920, 1080])
    clk = Clock(tl)
    total = meta.get("beats") or len(tl["music"]["bars"]) * clk.bpb
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(exist_ok=True)
    name = args.name or meta.get("name", "mad")

    print(f"[audio] {total} beats = {clk.t(total):.2f}s @ {60 / clk.beat:.2f} BPM")
    mix = render_audio(tl, clk, total)
    wav = WORK / f"{name}_mix.wav"
    sf.write(wav, mix, SR)
    if args.audio_only:
        sf.write(OUT / f"{name}.wav", mix, SR)
        print("->", OUT / f"{name}.wav")
        return

    b0, b1 = args.b0, args.b1 if args.b1 is not None else total
    shots = sorted(tl["shots"], key=lambda s: s["at"])
    parts = []
    for i, sh in enumerate(shots):
        s_at = sh["at"]
        e_at = shots[i + 1]["at"] if i + 1 < len(shots) else total
        if e_at <= b0 or s_at >= b1:
            continue
        dur = clk.t(e_at - s_at)
        print(f"[shot] beat {s_at:5.1f}-{e_at:5.1f}  {sh['src']}@{sh.get('in', 0)}  {sh.get('fx', [])}")
        p = render_shot(sh, dur, fps, W, H)
        # 预览区间裁剪
        cut_a = max(0, clk.t(b0 - s_at))
        cut_b = min(dur, clk.t(b1 - s_at))
        parts.append((p, cut_a, cut_b))

    lst = WORK / f"{name}_concat.txt"
    lst.write_text("".join(f"file '{p}'\ninpoint {a:.4f}\noutpoint {b:.4f}\n" for p, a, b in parts))
    ass = WORK / f"{name}.ass"
    ass.write_text(build_ass(tl, clk, W, H, offset_beats=b0))
    vf = grade_filter(tl, W, H, ass)

    if args.stills:
        for bt in [float(x) for x in args.stills.split(",")]:
            png = OUT / f"{name}_beat{bt:g}.png"
            run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                 "-ss", f"{clk.t(bt - b0):.3f}", "-vf", vf, "-frames:v", "1", str(png)])
            print("->", png)
        return

    suffix = "" if (b0 == 0 and b1 == total) else f"_b{b0:g}-{b1:g}"
    out = OUT / f"{name}{suffix}.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-ss", f"{clk.t(b0):.4f}", "-t", f"{clk.t(b1 - b0):.4f}", "-i", str(wav),
         "-map", "0:v", "-map", "1:a", "-vf", vf, "-r", str(fps),
         "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-maxrate", "16M", "-bufsize", "32M", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(out)])
    print("->", out)


if __name__ == "__main__":
    main()
