"""Shot list for "Пачка сигарет" x Disco Elysium.

Idea: the song is a man alone with a pack of cigarettes ("my friends are my
cigarettes", "mama, why do I want to die?"). Harry starts the game exactly
like that. The two choruses carry the *same* lyrics; chorus 1 answers them with
Harry alone (self-destruction, absurd identity roulette), chorus 2 answers them
with Kim. What makes him live through the day was never the cigarettes.

All times are song times. Lyric line k starts at beat 99 + 8k (8 beats each,
~152 BPM). at(k, j) = j-th beat after the start of line k.
"""
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "media", "audio", "beats.json")) as f:
    BEATS = json.load(f)["beats"]

SONG = "audio/pachka_sigaret_lizer.wav"
GRAIN = 0.0            # no film grain, no colour grading
AUDIO_FADE_OUT = 2.6


def at(k, j=0):
    return BEATS[99 + 8 * k + j]


SONG_IN = 37.92
SONG_OUT = at(20, 7) + 0.55          # ~104.8 s -> ~67 s total

SERIF, SERIF_B = "fonts/NotoSerifSC-Regular.otf", "fonts/NotoSerifSC-Bold.otf"
LAT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
F = lambda p: os.path.join(ROOT, p) if not p.startswith("/") else p

# --------------------------------------------------------------------------
# shot helpers
# --------------------------------------------------------------------------
SHOTS = []


def shot(t0, t1, kind, src=None, **kw):
    SHOTS.append(dict(t0=t0, t1=t1, kind=kind, src=src, **kw))


def vid(t0, t1, src, src_in, **kw):
    shot(t0, t1, "video", "video/" + src, src_in=src_in, **kw)


def img(t0, t1, src, **kw):
    shot(t0, t1, "image", "art/" + src, **kw)


WM = (0.5, 0.56, 1.13, 0)          # bilibili footage: zoom past the watermark
LEFT = (0, 0, 0.6, 1)              # bilibili footage: drop the dialogue panel

# ---- intro: darkness, waking --------------------------------------------
vid(SONG_IN, at(1), "p1_wake.mp4", 11.6, crop=(0, 0.06, 0.86, 1), cam0=(0.42, 0.6, 1.15, 0),
    cam1=(0.42, 0.62, 1.55, 0), ease="linear", fx=dict(fadein=0.6))    # out of the black: face-down on the floor
# L0  Пачка сигарет никогда не закончится   (same shot continues)
# L1  Бросить курить, если честно, не хочется
img(at(1), at(1, 4), "f_Portrait_electrochemistry.png", fit="contain", bg="black",
    cam0=(0.5, 0.45, 0.92, 0), cam1=(0.5, 0.42, 1.05, 0), fx=dict(flash=0.5))
img(at(1, 4), at(2), "Arch_sensitive.png", cam0=(0.5, 0.55, 1.0, 0), cam1=(0.5, 0.62, 1.25, 0),
    punch=0.03)                                                          # the necktie
# L2  Стены так давят меня в этой комнате
vid(at(2), at(3), "trailer_fc.mp4", 17.0, cam0=(0.5, 0.5, 1.45, 0), cam1=(0.5, 0.5, 1.0, 0), ease="out")
# L3  Белый потолок, засыпаю в холоде
vid(at(3), at(3, 5), "trailer_hc.mp4", 49.2, cam0=(0.45, 0.5, 1.15, 0), cam1=(0.45, 0.55, 1.3, 0))
shot(at(3, 5), at(4), "black")
# L4  Открытые окна, в них дует ветер
vid(at(4), at(5), "p1_window.mp4", 11.6, crop=LEFT, cam0=(0.48, 0.45, 1.25, 0), cam1=(0.45, 0.5, 1.55, 0),
    fx=dict(flash=0.35))
# L5  Я не закрывал их, я жду тепла  -> Kim is already downstairs
vid(at(5), at(5, 6), "p1_kim.mp4", 22.6, cam0=(0.45, 0.6, 1.45, 0), cam1=(0.45, 0.66, 1.75, 0))
img(at(5, 6), at(6), "Kim_Kitsuragi_-_Closeup_Portrait.png", fit="contain", bg="black",
    cam0=(0.5, 0.5, 0.75, 0), cam1=(0.5, 0.5, 0.8, 0), fx=dict(flash=0.6))
# L6  Мои друзья — это мои сигареты   (cigarettes vs Kim, every 2 beats)
for j in range(4):
    if j % 2 == 0:
        img(at(6, 2 * j), at(6, 2 * j + 2), "f_Portrait_electrochemistry.png", fit="contain", bg="black",
            cam0=(0.5, 0.45, 0.95 + 0.04 * j, 0), cam1=(0.5, 0.45, 1.0 + 0.04 * j, 0))
    else:
        img(at(6, 2 * j), at(6, 2 * j + 2), "Kim_Kitsuragi_-_Closeup_Portrait.png", fit="contain", bg="black",
            cam0=(0.5, 0.5, 0.78 + 0.04 * j, 0), cam1=(0.5, 0.5, 0.82 + 0.04 * j, 0))
# L7  Мы с ними никогда не расстанемся
img(at(7), at(8), "DE_Kims_Coupris_Kineema.png", cam0=(0.62, 0.62, 1.15, 0), cam1=(0.68, 0.6, 1.5, 0),
    ease="smooth")

# ---- chorus 1: Harry alone --------------------------------------------
# L8  Пачка сигарет в моём кармане
img(at(8), at(8, 2), "Tequila_face.jpg", cam0=(0.42, 0.45, 1.0, 0), cam1=(0.42, 0.45, 1.08, 0), punch=0.05,
    fx=dict(flash=0.4))
img(at(8, 2), at(8, 4), "f_Idiot_doom_spiral.jpg", cam0=(0.5, 0.35, 1.0, 0), cam1=(0.5, 0.33, 1.1, 0), punch=0.05)
img(at(8, 4), at(8, 6), "f_Madman.jpg", cam0=(0.5, 0.3, 1.0, 0), cam1=(0.5, 0.28, 1.1, 0), punch=0.05)
img(at(8, 6), at(9), "f_DE_Background_2.png", cam0=(0.2, 0.5, 1.6, 0), cam1=(0.18, 0.5, 1.75, 0), punch=0.05)
# L9  Заставляет жить меня этот день  (who am I today?)
for j, a in enumerate(["f_Hobocop.png", "f_Superstar_cop.png", "f_Apocalypse_cop.png", "f_Sorry_cop.png",
                       "f_Jamais_vu.png", "f_Narcomania.png", "f_Honour.png", "f_Lawbringer.png"]):
    img(at(9, j), at(9, j + 1), a, cam0=(0.5, 0.5, 1.05, 0), cam1=(0.5, 0.5, 1.12, 0),
        fx=dict(rgbsplit=6))
# L10 Я возьму телефон, позвоню своей маме  -> the name his mother gave him
vid(at(10), at(11), "kim_p03.mp4", 36.0, crop=LEFT, cam0=(0.45, 0.42, 1.3, 0), cam1=(0.47, 0.42, 1.5, 0),
    freeze=0.0, fx=dict(darken=0.35))
# L11 "Мама, почему я хочу умереть?"
img(at(11), at(11, 7), "f_Suicide_is_painless.png", cam0=(0.5, 0.5, 1.0, 0), cam1=(0.5, 0.48, 1.6, 0),
    ease="in")
shot(at(11, 7), at(12), "black")

# ---- chorus 2: the same words, answered by Kim --------------------------
# L12 Пачка сигарет в моём кармане
vid(at(12), at(12, 4), "endings.mp4", 6.0, cam0=(0.5, 0.5, 1.15, 0), cam1=(0.52, 0.52, 1.3, 0),
    fx=dict(flash=0.4))
vid(at(12, 4), at(13), "trailer_da.mp4", 53.6, cam0=(0.5, 0.48, 1.4, 0), cam1=(0.5, 0.5, 1.6, 0))
# L13 Заставляет жить меня этот день   -> Kim: "can you go on?"
vid(at(13), at(14), "kim_p05.mp4", 6.0, crop=LEFT, cam0=(0.45, 0.45, 1.3, 0), cam1=(0.45, 0.47, 1.6, 0),
    freeze=0.0, fx=dict(darken=0.25))
# L14 Я возьму телефон, позвоню своей маме -> the handkerchief
img(at(14), at(15), "f_Coupris_kineema.png", cam0=(0.55, 0.45, 1.25, 0), cam1=(0.6, 0.42, 1.5, 0),
    fx=dict(darken=0.3))
# L15 "Мама, почему я хочу умереть?"  -> "come work at the 41st"
img(at(15), at(15, 4), "Portrait_you.png", fit="contain", bg="black",
    cam0=(0.95, 0.5, 0.62, 0), cam1=(0.95, 0.5, 0.65, 0))
img(at(15, 4), at(16), "Portrait_kitsuragi.png", fit="contain", bg="black",
    cam0=(0.95, 0.5, 0.62, 0), cam1=(0.95, 0.5, 0.65, 0), fx=dict(flash=0.3))

# ---- bridge / outro -----------------------------------------------------
# L16 Дождь за окном, сердце бьётся
vid(at(16), at(16, 4), "trailer_hc.mp4", 35.0, cam0=(0.45, 0.45, 1.2, 0), cam1=(0.48, 0.42, 1.35, 0))
vid(at(16, 4), at(17), "trailer_fc.mp4", 11.2, cam0=(0.35, 0.45, 1.3, 0), cam1=(0.3, 0.45, 1.45, 0))
# L17 Эта песня, что в ней поётся
vid(at(17), at(17, 4), "p25_stage.mp4", 68.0, cam0=(0.42, 0.55, 1.45, 0), cam1=(0.44, 0.52, 1.75, 0))
vid(at(17, 4), at(18), "p25_church.mp4", 31.0, cam0=WM[:2] + (1.15, 0), cam1=(0.5, 0.6, 1.3, 0))
# L18 Может быть, новый день не начнётся
vid(at(18), at(18, 4), "trailer_fc.mp4", 3.9, cam0=(0.5, 0.5, 1.0, 0), cam1=(0.55, 0.5, 1.15, 0))
vid(at(18, 4), at(19), "trailer_da.mp4", 91.6, cam0=(0.5, 0.5, 1.1, 0), cam1=(0.5, 0.5, 1.3, 0))
# L19 Может, завтра тут выглянет солнце
img(at(19), at(20), "f_F76_Revachol_Panorama.jpg", cam0=(0.3, 0.55, 1.35, 0), cam1=(0.55, 0.5, 1.15, 0),
    fx=dict(flash=0.25))
# L20 А-а-а  -> together, out of Martinaise
vid(at(20), at(20, 5), "endings.mp4", 18.0, cam0=(0.5, 0.5, 1.1, 0), cam1=(0.5, 0.52, 1.25, 0))
img(at(20, 5), SONG_OUT, "f_Coupris_kineema.png", cam0=(0.5, 0.5, 1.0, 0), cam1=(0.52, 0.5, 1.08, 0),
    fx=dict(fadeout=1.6))

# --------------------------------------------------------------------------
# text
# --------------------------------------------------------------------------
TEXTS = []

LYRICS = [
    ("Пачка сигарет никогда не закончится", "这包烟永远抽不完"),
    ("Бросить курить, если честно, не хочется", "说实话，我并不想戒"),
    ("Стены так давят меня в этой комнате", "这房间的墙压得我喘不过气"),
    ("Белый потолок, засыпаю в холоде", "白色的天花板，我在寒冷里睡去"),
    ("Открытые окна, в них дует ветер", "窗户敞着，风灌了进来"),
    ("Я не закрывал их, я жду тепла", "我没有关窗，我在等一点温暖"),
    ("Мои друзья — это мои сигареты", "我的朋友，就是我的香烟"),
    ("Мы с ними никогда не расстанемся", "我们永远不会分开"),
    ("Пачка сигарет в моём кармане", "口袋里有一包烟"),
    ("Заставляет жить меня этот день", "是它让我撑过今天"),
    ("Я возьму телефон, позвоню своей маме", "我拿起电话，打给妈妈"),
    ("«Мама, почему я хочу умереть?»", "“妈妈，我为什么想死？”"),
    ("Пачка сигарет в моём кармане", "口袋里有一包烟"),
    ("Заставляет жить меня этот день", "是它让我撑过今天"),
    ("Я возьму телефон, позвоню своей маме", "我拿起电话，打给妈妈"),
    ("«Мама, почему я хочу умереть?»", "“妈妈，我为什么想死？”"),
    ("Дождь за окном, сердце бьётся", "窗外下着雨，心还在跳"),
    ("Эта песня, что в ней поётся", "这首歌里，唱的是什么"),
    ("Может быть, новый день не начнётся", "也许新的一天不会开始"),
    ("Может, завтра тут выглянет солнце", "也许明天，太阳会出来"),
]
for k, (ru, zh) in enumerate(LYRICS):
    TEXTS.append(dict(t0=at(k) - 0.05, t1=at(k + 1) - 0.12, y=0.885, fadein=0.12, fadeout=0.2,
                      lines=[(zh, F(SERIF), 40, (240, 236, 228, 255), 2),
                             (ru, F(LAT), 22, (200, 196, 188, 220), 0)]))


def quote(t0, t1, speaker, line, y=0.42, cps=16, color=(232, 226, 214, 255), size=44, xoff=0, width=1300, box=0.3):
    """Game-style dialogue line: speaker name + quote, typed out."""
    TEXTS.append(dict(t0=t0, t1=t1, y=y, cps=cps, fadein=0.08, fadeout=0.35, box=box, width=width, xoff=xoff,
                      lines=[(speaker, F(SERIF_B), 30, (214, 120, 60, 255), 8),
                             (line, F(SERIF), size, color, 0)]))


ANCIENT = (180, 172, 160, 255)
TEXTS.append(dict(t0=at(3, 4), t1=at(4) - 0.05, y=0.42, cps=22, fadein=0.1, fadeout=0.25, width=1200,
                  lines=[("古老的爬虫脑", F(SERIF_B), 28, (150, 140, 128, 255), 8),
                         ("这里什么也没有。只有温暖的、原始的黑暗。你不用再做任何事了。", F(SERIF), 40, ANCIENT, 0)]))
quote(at(7, 1), at(8) - 0.05, "金·曷城", "“很高兴认识你，哈里尔·杜博阿。”", y=0.40)
quote(at(10, 1), at(11) - 0.05, "金·曷城",
      "“这是一个战时的名字。就是那种母亲会在乱世给儿子起的名字。”", y=0.42, cps=18)
quote(at(13, 1), at(14) - 0.05, "金·曷城", "“你能继续吗？”", y=0.42, cps=10, size=52)
quote(at(14, 1), at(15) - 0.05, "金·曷城",
      "“是的，我从来没见你哭过，也没把我的手帕借给你擦过眼泪。”", y=0.40, cps=18)
quote(at(15) + 0.05, at(15, 4) - 0.05, "你", "“来41分局工作。”", y=0.45, cps=14, xoff=330, width=700, box=0)
quote(at(15, 4) + 0.05, at(16) - 0.05, "金·曷城", "“我受宠若惊……”", y=0.45, cps=12, xoff=330, width=700, box=0)
quote(at(19, 3), at(20) - 0.05, "天人感应", "春天来了。到时间了。", y=0.40, cps=10,
      color=(236, 228, 214, 255))
TEXTS.append(dict(t0=SONG_OUT - 2.2, t1=SONG_OUT, y=0.5, fadein=0.5, fadeout=0.9,
                  lines=[("Disco Elysium  ×  LIZER — Пачка сигарет", F(LAT), 26, (230, 224, 214, 230), 0)]))
