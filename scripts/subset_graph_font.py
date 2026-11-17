#!/usr/bin/env python3
"""从本地 ZCOOL KuaiLe TTF 生成图谱字体子集（构建时需 fonttools，运行网页无需依赖）。"""
import argparse
import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='原始 ZCOOLKuaiLe-Regular.ttf 路径')
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/fonts/physicalmap-playful.woff')
    args = parser.parse_args()
    topics = json.loads((ROOT / 'data/topics.json').read_text(encoding='utf-8'))
    labels = ''.join(topic['name'] for topic in topics)
    extras = ''.join(chr(n) for n in range(32, 127)) + '…·—−×÷±πθωαβγΔΩμ℃°✓⭐年级科学物理知识点先修上册下册全必选择性第一二三四五六七八九十百千绪言'
    font = TTFont(args.source)
    missing = sorted({char for char in labels if ord(char) not in font.getBestCmap()})
    if missing:
        raise SystemExit('知识点名称中缺少字形：' + ''.join(missing))
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.recalc_average_width = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=labels + extras)
    subsetter.subset(font)
    names = {1:'Physicalmap Playful', 2:'Regular', 3:'PhysicalmapPlayful-Regular;2026',
             4:'Physicalmap Playful Regular', 6:'PhysicalmapPlayful-Regular',
             16:'Physicalmap Playful', 17:'Regular'}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font.flavor = 'woff'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    font.save(args.output)
    print('图谱字体：%d 个名称字符全部覆盖，WOFF %d 字节。' % (len(set(labels)), args.output.stat().st_size))


if __name__ == '__main__':
    main()
