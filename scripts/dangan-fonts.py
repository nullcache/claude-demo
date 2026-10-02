#!/usr/bin/env python3
"""
弹丸论破 PV 字体子集化：扫描 src/dangan 中实际出现的字符，生成体积极小的字体文件到 public/fonts/dangan/。

源字体（均为 SIL Open Font License，来自 github.com/google/fonts）：
  NotoSansSC[wght].ttf        → 实例化 wght=900 / 500
  NotoSerifSC[wght].ttf       → 实例化 wght=900
  ZCOOLQingKeHuangYou-Regular.ttf
  Anton-Regular.ttf
  PressStart2P-Regular.ttf
  以及各自的 OFL.txt，命名为 OFL-notosanssc.txt / OFL-notoserifsc.txt / OFL-zcoolqingkehuangyou.txt / OFL-anton.txt / OFL-pressstart2p.txt

用法：python3 scripts/dangan-fonts.py <源字体目录>
（目录中需包含上面的源文件；可变字体会自动实例化）
"""
import os
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'fonts-src'
OUT = ROOT / 'public' / 'fonts' / 'dangan'

text = ''
for p in (ROOT / 'src' / 'dangan').rglob('*.ts*'):
    text += p.read_text('utf-8')
ascii_chars = ''.join(chr(c) for c in range(0x20, 0x7F))
cjk = ''.join(sorted(set(ch for ch in text if ord(ch) > 0x7F)))
# 注释里的字也会被收录——多几个字无伤大雅，保证不会缺字
# 子集属于 OFL 意义上的“修改版本”：统一改用中性族名，避开保留字体名（如 'Source'、'Press Start 2P'）
JOBS = [
    ('NotoSansSC[wght].ttf', 900, 'NotoSansSC-Black.ttf', ascii_chars + cjk, 'DanganPV Sans Black'),
    ('NotoSansSC[wght].ttf', 500, 'NotoSansSC-Medium.ttf', ascii_chars + cjk, 'DanganPV Sans Medium'),
    ('NotoSerifSC[wght].ttf', 900, 'NotoSerifSC-Black.ttf', ascii_chars + cjk, 'DanganPV Serif Black'),
    ('ZCOOLQingKeHuangYou-Regular.ttf', None, 'ZCOOLQingKeHuangYou.ttf', ascii_chars + cjk, 'DanganPV Pop'),
    ('Anton-Regular.ttf', None, 'Anton.ttf', ascii_chars + '·—’', 'DanganPV Latin'),
    ('PressStart2P-Regular.ttf', None, 'PressStart2P.ttf', ascii_chars, 'DanganPV Pixel'),
]
LICENSES = ['notosanssc', 'notoserifsc', 'zcoolqingkehuangyou', 'anton', 'pressstart2p']


def rename(font, family):
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22):
            name.removeNames(nameID=rec.nameID)
    ps = family.replace(' ', '')
    for nid, val in [(1, family), (2, 'Regular'), (3, f'{ps};subset'), (4, family), (6, ps)]:
        name.setName(val, nid, 3, 1, 0x409)
        name.setName(val, nid, 1, 0, 0)

OUT.mkdir(parents=True, exist_ok=True)
for src, wght, dst, chars, family in JOBS:
    font = TTFont(SRC_DIR / src)
    if wght is not None and 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wght': wght})
    opts = subset.Options()
    opts.layout_features = ['kern', 'liga', 'palt', 'vert']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=chars)
    sub.subset(font)
    rename(font, family)
    font.save(OUT / dst)
    print(f'{dst:28s} {len(chars):5d} chars  {os.path.getsize(OUT / dst) / 1024:7.1f} KB')

# 许可证：源目录中的 OFL-<名称>.txt（来自 github.com/google/fonts/ofl/<名称>/OFL.txt）合并附在字体旁
parts = []
for key in LICENSES:
    lic = SRC_DIR / f'OFL-{key}.txt'
    if lic.exists():
        parts.append(f'===== {key} =====\n\n' + lic.read_text('utf-8').strip() + '\n')
if parts:
    (OUT / 'OFL.txt').write_text(
        'Subsetted and renamed (Modified Versions under SIL OFL 1.1) for the DanganPV composition.\n\n' + '\n\n'.join(parts),
        'utf-8',
    )
