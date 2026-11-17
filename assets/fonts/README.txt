Physicalmap Playful is a renamed, reduced webfont subset of ZCOOL KuaiLe Regular.

Original font: ZCOOL KuaiLe
Designers: Liu Bingke, Yang Kang, Wu Shaojie
Copyright 2018 The ZCOOL KuaiLe Project Authors
License: SIL Open Font License 1.1; see OFL-ZCOOL-KuaiLe.txt.
Source: https://github.com/google/fonts/tree/main/ofl/zcoolkuaile
Upstream: https://github.com/googlefonts/zcool-kuaile
Upstream source commit (Google Fonts metadata): 577cd45e035fa0cd27f74579de6ff47db62fde8c
Downloaded original SHA-256: 812a6fc1fe54b6d73a419245c32dfeba8aa33104d5be90d1cf6af082007cb71d

Modified 2026-11-17 for knowledge-map labels: subset to current topic names, grade labels and common Latin/punctuation; renamed family to Physicalmap Playful; encoded as WOFF. Missing scientific symbols use the system font stack. Body text remains in the site UI font.

When topic names change, regenerate the subset from the upstream TTF using the script in scripts/subset_graph_font.py. The full original TTF is not required at runtime.

Rebuild (requires fonttools in the build environment only):
  python3 scripts/subset_graph_font.py --source /path/to/ZCOOLKuaiLe-Regular.ttf
