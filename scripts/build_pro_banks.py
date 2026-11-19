#!/usr/bin/env python3
"""Build deterministic small expert banks; runtime fetches only its target chunk."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTHORING = ('science-1-2', 'science-3-4', 'science-5-6', 'physics-compulsory', 'physics-elective')
MAX_CHUNK_BYTES = 32768


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def group_of(topic):
    if topic['subject'] == 'science':
        return 'science'
    return 'junior' if topic['grade'] in (8, 9) else 'senior'


def load_banks(root=ROOT):
    bank = read_json(root / 'data/questions-pro.json')
    for name in AUTHORING:
        questions = read_json(root / 'data/pro-authoring' / (name + '.json'))
        if not isinstance(questions, list):
            raise ValueError(name + ': authoring catalogue must be an array')
        bank.extend(questions)
    return bank


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def artifacts(topics, bank):
    by_topic = defaultdict(list)
    for q in bank:
        by_topic[q['topicId']].append(q)
    output, entries = {}, {}
    grouped = defaultdict(lambda: {'topics': 0, 'questions': 0, 'bytes': 0})
    for topic in topics:
        if topic.get('external') or topic.get('subject') not in ('science', 'physics'):
            continue
        ident = topic['id']
        questions = sorted(by_topic[ident], key=lambda q: int(q['id'].rsplit('_q', 1)[1]))
        raw = encode(questions)
        if len(raw) > MAX_CHUNK_BYTES:
            raise ValueError(ident + ': expert topic chunk exceeds 32 KiB')
        path = 'pro/' + ident + '.json'
        output[path] = raw
        entries[ident] = {'file': path, 'questions': len(questions), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        stats = grouped[group_of(topic)]
        stats['topics'] += 1
        stats['questions'] += len(questions)
        stats['bytes'] += len(raw)
    manifest = {'v': 1, 'level': 'pro', 'minimumPerTopic': 3, 'topics': len(entries), 'questions': len(bank),
                'bytes': sum(map(len, output.values())), 'maxChunkBytes': max(map(len, output.values()), default=0),
                'groups': dict(grouped), 'chunks': entries}
    output['pro-manifest.json'] = encode(manifest)
    return output, manifest


def check_artifacts(root, output):
    errors = []
    for path, expected in output.items():
        target = root / 'data' / path
        if not target.is_file() or target.read_bytes() != expected:
            errors.append('Missing or stale generated expert bank: data/' + path)
    expected = set(output) - {'pro-manifest.json'}
    actual = {'pro/' + p.name for p in (root / 'data/pro').glob('*.json')}
    errors.extend('Unexpected expert topic chunk: data/' + path for path in sorted(actual - expected))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='check checked-in output without writing')
    args = parser.parse_args()
    from validate_pro_questions import check
    topics = read_json(ROOT / 'data/topics.json')
    bank = load_banks()
    errors = check(topics, read_json(ROOT / 'data/questions.json'), bank, read_json(ROOT / 'data/pro-sources.json'))
    if errors:
        raise SystemExit('\n'.join(errors))
    output, manifest = artifacts(topics, bank)
    if args.check:
        errors = check_artifacts(ROOT, output)
        if errors:
            raise SystemExit('\n'.join(errors))
    else:
        (ROOT / 'data/pro').mkdir(exist_ok=True)
        for path, raw in output.items():
            (ROOT / 'data' / path).write_bytes(raw)
    print(json.dumps({k: manifest[k] for k in ('topics', 'questions', 'bytes', 'maxChunkBytes', 'groups')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
