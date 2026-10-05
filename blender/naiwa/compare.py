"""和参考图并排对比：按三视图的机位渲正面/侧面/背面（灯组跟着相机转），拼成一张 compare.jpg。

    python blender/naiwa/compare.py blender/naiwa/naiwa.blend OUTDIR
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import build  # noqa: E402

REFS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'refs')
FONT = os.environ.get('NAIWA_FONT', next((p for p in (
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') if os.path.exists(p)), ''))
# 参考图接近正交投影（长焦远拍）：正面/背面略微俯视，侧面平视。用 200mm 镜头、8 米远拍，透视和参考一致
VIEWS = (('front', '正面', (0, -8.0, 0.85), 0), ('side', '侧面', (-8.0, 0, 0.55), -90), ('back', '背面', (0, 8.0, 0.85), 180))
LENS = 200


def render_views(out, res=720, samples=32):
    sc = bpy.context.scene
    cam = sc.camera
    bpy.context.view_layer.update()
    lights = [o for o in bpy.data.objects if o.type == 'LIGHT']
    base = {o.name: o.matrix_world.copy() for o in lights}
    for name, _, loc, ang in VIEWS:
        for o in lights:
            o.matrix_world = Matrix.Rotation(math.radians(ang), 4, 'Z') @ base[o.name]
        build.aim(cam, loc, (0, 0, 0.5), LENS)
        build.render(os.path.join(out, f'{name}.png'), (res, res), samples)
    for o in lights:
        o.matrix_world = base[o.name]


def crop_to(im, m, H, pad=0.05):
    ys, xs = np.nonzero(m)
    p = int(pad * (ys.max() - ys.min()))
    box = (xs.min() - p, ys.min() - p, xs.max() + p, ys.max() + p)
    c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (236, 236, 236))
    c.paste(im.crop((max(box[0], 0), max(box[1], 0), min(box[2], im.width), min(box[3], im.height))),
            (max(-box[0], 0), max(-box[1], 0)))
    return c.resize((int(c.width * H / c.height), H), Image.LANCZOS)


def model_mask(im):
    a = np.asarray(im).astype(int)
    m = ((a.max(2) - a.min(2)) > 45) | (a.sum(2) < 260)
    m[int(im.height * 0.97):] = False
    return m


def sheet(out, H=560):
    turn = Image.open(os.path.join(REFS, 'turn.png')).convert('RGB')
    tm = np.asarray(Image.open(os.path.join(REFS, 'turn_mask.png'))) > 127
    refs = {
        # 此轮统一采用同一张三视图，不混入另一帧不同受光的单独正面。
        'front': crop_to(turn.crop((420, 0, 860, turn.height)), tm[:, 420:860], H),
        'side': crop_to(turn.crop((0, 0, 420, turn.height)), tm[:, :420], H),
        'back': crop_to(turn.crop((860, 0, 1280, turn.height)), tm[:, 860:], H),
    }
    font = ImageFont.truetype(FONT, 26)
    cols = []
    for name, label, _, _ in VIEWS:
        mi = Image.open(os.path.join(out, f'{name}.png')).convert('RGB')
        cols.append((label, refs[name], crop_to(mi, model_mask(mi), H)))
    W = sum(max(a.width, b.width) for _, a, b in cols) + 20 * (len(cols) + 1)
    img = Image.new('RGB', (W, 2 * H + 120), (30, 30, 32))
    d = ImageDraw.Draw(img)
    x = 20
    for label, a, b in cols:
        w = max(a.width, b.width)
        img.paste(a, (x + (w - a.width) // 2, 40))
        img.paste(b, (x + (w - b.width) // 2, H + 80))
        d.text((x, 8), f'参考 · {label}', font=font, fill=(240, 230, 200))
        d.text((x, H + 48), f'Blender 模型 · {label}', font=font, fill=(240, 230, 200))
        x += w + 20
    img.save(os.path.join(out, 'compare.jpg'), quality=90)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(argv[0]))
    os.makedirs(argv[1], exist_ok=True)
    render_views(argv[1])
    sheet(argv[1])
