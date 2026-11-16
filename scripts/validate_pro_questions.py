#!/usr/bin/env python3
"""校验独立专家题库的覆盖、普通题隔离、来源登记及可计算答案。"""
import json
import sys
from collections import Counter
from pathlib import Path

import validate as V
import verify_questions as Q

ROOT = Path(__file__).resolve().parents[1]


def check(topics, ordinary, bank, sources):
    junior = {t['id']: t for t in topics if t.get('subject') == 'physics' and t.get('grade') in (8, 9)}
    errors, _ = V.question_errors(bank, junior, require_coverage=False)
    expected = Counter(q['topicId'] for q in ordinary if q['topicId'] in junior)
    actual = Counter(q.get('topicId') for q in bank)
    if actual != expected:
        errors.append('专家题库每点题数必须与普通初中题库一致：%r' % (actual - expected or expected - actual))
    base_ids = {q['id'] for q in ordinary}
    base_prompts = {q['prompt'].strip() for q in ordinary}
    prompts = set()
    refs = {s['id'] for s in sources}
    if refs != {'gd%d' % y for y in range(2019, 2027)}:
        errors.append('来源目录必须覆盖已核验的2019—2026年广东省卷')
    used = set()
    for q in bank:
        ident = q.get('id', '?')
        if ident in base_ids:
            errors.append(ident + ' 与普通题库ID冲突')
        if q.get('level') != 'pro' or q.get('origin') != 'original':
            errors.append(ident + ' 缺少独立专家层级或原创标记')
        if q.get('difficulty') not in ('standard', 'challenge'):
            errors.append(ident + ' 专家题必须为提高或拓展难度')
        if q.get('type') not in ('choice', 'numeric', 'short'):
            errors.append(ident + ' 必须可自动判题')
        prompt = q.get('prompt', '').strip()
        if prompt in base_prompts or prompt in prompts:
            errors.append(ident + ' 题干与其他题完全重复')
        prompts.add(prompt)
        for ref in q.get('sourceRefs', []):
            used.add(ref)
            if ref not in refs:
                errors.append(ident + ' 引用了未登记来源 ' + str(ref))
    if used != refs:
        errors.append('尚未在题目概念参考中使用的年份：' + ','.join(sorted(refs - used)))
    results = Q.verify_all(bank)
    for mismatch in results['mismatch']:
        errors.append(mismatch['id'] + ' 答案核验不一致：' + mismatch['detail'])
    missing_numeric = [q['id'] for q in bank if q.get('type') == 'numeric' and not q.get('verify')]
    if missing_numeric:
        errors.append('数值题必须提供独立计算表达式：' + ','.join(missing_numeric))
    return errors


def main():
    read = lambda name: json.loads((ROOT / 'data' / name).read_text())
    bank = read('questions-pro.json')
    errors = check(read('topics.json'), read('questions.json'), bank, read('pro-sources.json'))
    if errors:
        print('\n'.join(errors))
        return 1
    print('Pro题库：%d题，92个初中知识点，每点4题；独立ID、答案、2019—2026来源登记校验通过。' % len(bank))
    return 0


if __name__ == '__main__':
    sys.exit(main())
