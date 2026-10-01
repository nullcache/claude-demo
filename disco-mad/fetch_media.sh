#!/usr/bin/env bash
# Rebuild media/ from the original sources. Needs yt-dlp, ffmpeg, curl, python3.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p media/video media/art media/audio fonts
V=media/video; A=media/art
B="https://www.bilibili.com/video"
PLAY="$B/BV1zb4y1Q7Js"       # 极乐迪斯科 最终剪辑版 全流程无解说（琥珀沙漠）
sec() { yt-dlp -q -f "30080/bv*[height<=1080]" --download-sections "*$3" -o "$V/$4.%(ext)s" "$1?p=$2"; }

# --- song: LIZER - Пачка сигарет (BV1QHb16dE6x) + beat grid
yt-dlp -q -x --audio-format wav -o "media/audio/pachka_sigaret_lizer.%(ext)s" "$B/BV1QHb16dE6x"
python3 analyze_song.py

# --- full playthrough sections (1080p)
sec "$PLAY" 1 200-245 p1_wake
sec "$PLAY" 1 360-420 p1_window
sec "$PLAY" 1 1215-1250 p1_kim
sec "$PLAY" 25 1240-1300 p25_church
sec "$PLAY" 25 1560-1660 p25_stage
# --- Kim clip compilation (BV1Wy4y147V1): p3 "阿金喊哈里", p5 "阿金安慰哭哭德彪"
for p in 3 5; do yt-dlp -q -f "30080/bv*[height<=1080]" -o "$V/kim_p0$p.%(ext)s" "$B/BV1Wy4y147V1?p=$p"; done
# --- all ending animations (BV1Yu411v77U)
yt-dlp -q -f "30080/bv*[height<=1080]" -o "$V/endings.%(ext)s" "$B/BV1Yu411v77U"

# --- official Steam trailers (app 632470)
curl -s "https://store.steampowered.com/api/appdetails?appids=632470" | python3 -c '
import json,sys
m={x["id"]:x["hls_h264"] for x in json.load(sys.stdin)["632470"]["data"]["movies"]}
names={256827872:"trailer_fc",256762286:"trailer_da",256776131:"trailer_hc"}
for k,v in names.items(): print(v, m[k])' | while read n u; do ffmpeg -loglevel error -y -i "$u" -c copy "$V/$n.mp4" </dev/null; done

# --- official art from the Disco Elysium wiki (fandom)
python3 - <<'PY'
import requests
H={"User-Agent":"Mozilla/5.0"}
names={"Kim Kitsuragi - Closeup Portrait.png":"Kim_Kitsuragi_-_Closeup_Portrait.png",
 "Portrait kitsuragi.png":"Portrait_kitsuragi.png","Portrait you.png":"Portrait_you.png",
 "Tequila face.jpg":"Tequila_face.jpg","Arch sensitive.png":"Arch_sensitive.png",
 "DE Kim's Coupris Kineema.png":"DE_Kims_Coupris_Kineema.png"}
for f in ["Portrait_electrochemistry.png","Idiot_doom_spiral.jpg","Madman.jpg","DE_Background_2.png",
          "Hobocop.png","Superstar_cop.png","Apocalypse_cop.png","Sorry_cop.png","Jamais_vu.png",
          "Narcomania.png","Honour.png","Lawbringer.png","Suicide_is_painless.png","Coupris_kineema.png",
          "F76_Revachol_Panorama.jpg"]:
    names[f.replace("_"," ")]="f_"+f
for title,out in names.items():
    d=requests.get("https://discoelysium.fandom.com/api.php",headers=H,params=dict(
        action="query",titles="File:"+title,prop="imageinfo",iiprop="url",format="json")).json()
    url=next(iter(d["query"]["pages"].values()))["imageinfo"][0]["url"]
    open("media/art/"+out,"wb").write(requests.get(url,headers=H).content); print(out)
PY

# --- fonts
for f in NotoSerifSC-Regular NotoSerifSC-Bold; do
  curl -sSL -o "fonts/$f.otf" "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC/$f.otf"
done
