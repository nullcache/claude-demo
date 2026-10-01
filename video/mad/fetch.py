"""按 sources.yaml 下载素材到 cache/。已存在的文件跳过，可重复执行。

依赖: ffmpeg, yt-dlp, fonttools[woff] (brotli)
用法: python3 fetch.py
"""
import io
import json
import pathlib
import subprocess
import urllib.request

import yaml

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache"
UA = {"User-Agent": "Mozilla/5.0"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def steam(cfg):
    info = json.loads(get(f"https://store.steampowered.com/api/appdetails?appids={cfg['appid']}&l=english"))
    data = info[str(cfg["appid"])]["data"]
    for key, idx in cfg["trailers"].items():
        out = CACHE / f"trailer_{key}.mp4"
        if not out.exists():
            print("trailer", key)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", data["movies"][idx]["hls_h264"], "-c", "copy", str(out)], check=True)
    if cfg.get("screenshots"):
        for i, s in enumerate(data["screenshots"]):
            out = CACHE / f"shot_{i:02d}.jpg"
            if not out.exists():
                out.write_bytes(get(s["path_full"]))


def bilibili(items):
    for it in items:
        out = CACHE / it["out"]
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        print("bilibili", it["key"])
        url = f"https://www.bilibili.com/video/av{it['aid']}?p={it['p']}"
        cmd = ["yt-dlp", "-q", "--no-warnings", "-f", "ba", "-o", str(out.with_suffix(".%(ext)s")), url]
        if out.suffix == ".wav":
            cmd[5:5] = ["-x", "--audio-format", "wav"]
        subprocess.run(cmd, check=True)


def fonts(items):
    from fontTools.ttLib import TTFont

    for it in items:
        out = CACHE / it["out"]
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        if "woff2" in it:
            f = TTFont(io.BytesIO(get(it["woff2"])))
            f.flavor = None
            f.save(out)
        else:
            out.write_bytes(get(it["url"]))


if __name__ == "__main__":
    cfg = yaml.safe_load((ROOT / "sources.yaml").read_text())
    CACHE.mkdir(exist_ok=True)
    steam(cfg["steam"])
    bilibili(cfg["bilibili"])
    fonts(cfg["fonts"])
    print("ok")
