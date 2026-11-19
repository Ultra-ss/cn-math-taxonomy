#!/usr/bin/env python3
"""Validate expert coverage, ordinary separation, answers and generated chunks."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

import validate as V
import verify_questions as Q

ROOT = Path(__file__).resolve().parents[1]


def check(topics, ordinary, bank, sources):
    supported = {t['id']: t for t in topics if not t.get('external') and t.get('subject') in ('science', 'physics')}
    errors, _ = V.question_errors(bank, supported, require_coverage=False)
    actual = Counter(q.get('topicId') for q in bank)
    normal_counts = Counter(q['topicId'] for q in ordinary)
    for ident, topic in supported.items():
        if actual[ident] < 3:
            errors.append(ident + ' 专家题不足3道：' + str(actual[ident]))
        if topic['subject'] == 'physics' and topic['grade'] in (8, 9) and actual[ident] != normal_counts[ident]:
            errors.append(ident + ' 初中原有专家题数必须保持与普通题数一致')
    base_ids = {q['id'] for q in ordinary}
    normalize = lambda value: re.sub(r'\s+', '', str(value)).strip()
    base_prompts = {normalize(q['prompt']) for q in ordinary}
    prompts, seen_ids = set(), set()
    refs = {s['id'] for s in sources}
    if refs != {'gd%d' % y for y in range(2019, 2027)}:
        errors.append('初中来源目录必须保留2019—2026年已核验广东省卷概念参考')
    used = set()
    for q in bank:
        ident = q.get('id', '?')
        if ident in base_ids or ident in seen_ids:
            errors.append(ident + ' 与普通题库或其他专家题ID冲突')
        seen_ids.add(ident)
        match = re.fullmatch(r'(?:cns|cnp)_[A-Za-z0-9]+_q([1-9][0-9]*)', str(ident))
        if not match or int(match[1]) < 101:
            errors.append(ident + ' 专家题须使用独立的101及以上题号')
        if q.get('level') != 'pro' or q.get('origin') != 'original':
            errors.append(ident + ' 缺少独立专家层级或原创标记')
        if q.get('difficulty') not in ('standard', 'challenge'):
            errors.append(ident + ' 专家题必须为提高或拓展难度')
        if q.get('type') not in ('choice', 'numeric', 'short'):
            errors.append(ident + ' 必须可自动判题')
        prompt = normalize(q.get('prompt', ''))
        if prompt in base_prompts or prompt in prompts:
            errors.append(ident + ' 题干与普通或其他专家题重复')
        prompts.add(prompt)
        for ref in q.get('sourceRefs', []):
            used.add(ref)
            if ref not in refs:
                errors.append(ident + ' 引用了未登记来源 ' + str(ref))
    if used != refs:
        errors.append('初中已登记来源未使用：' + ','.join(sorted(refs - used)))
    results = Q.verify_all(bank)
    for mismatch in results['mismatch']:
        errors.append(mismatch['id'] + ' 答案核验不一致：' + mismatch['detail'])
    for q in bank:
        if q.get('type') == 'numeric' and not q.get('verify'):
            errors.append(q['id'] + ' 数值题必须提供独立计算表达式')
    return errors


def main():
    from build_pro_banks import load_banks, artifacts, check_artifacts
    read = lambda name: json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))
    topics, ordinary, bank = read('topics.json'), read('questions.json'), load_banks()
    errors = check(topics, ordinary, bank, read('pro-sources.json'))
    if not errors:
        output, manifest = artifacts(topics, bank)
        errors.extend(check_artifacts(ROOT, output))
    if errors:
        print('\n'.join(errors))
        return 1
    print('专家题库：%d题，%d个知识点，每点至少3题；覆盖、独立ID、答案及按点加载文件校验通过。' % (len(bank), manifest['topics']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
