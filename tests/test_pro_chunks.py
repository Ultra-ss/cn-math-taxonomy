#!/usr/bin/env python3
"""Expert catalogue publication, bounded topic chunks and precache regressions."""
import ast
import json
import re
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_pro_banks as B
import validate_pro_questions as P


class ProPublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.topics = B.read_json(ROOT / 'data/topics.json')
        cls.ordinary = B.read_json(ROOT / 'data/questions.json')
        cls.bank = B.load_banks()
        cls.output, cls.manifest = B.artifacts(cls.topics, cls.bank)

    def test_every_primary_and_senior_topic_has_three_independent_expert_questions(self):
        errors = P.check(self.topics, self.ordinary, self.bank, B.read_json(ROOT / 'data/pro-sources.json'))
        self.assertEqual(errors, [])
        counts = Counter(q['topicId'] for q in self.bank)
        for topic in self.topics:
            if not topic.get('external'):
                self.assertGreaterEqual(counts[topic['id']], 3, topic['id'])
        self.assertEqual(set(counts), set(self.manifest['chunks']))

    def test_existing_junior_ids_answers_and_prompts_are_preserved(self):
        junior = {t['id'] for t in self.topics if t['subject'] == 'physics' and t['grade'] in (8, 9)}
        original = B.read_json(ROOT / 'data/questions-pro.json')
        self.assertEqual([q for q in self.bank if q['topicId'] in junior], original)

    def test_generated_chunks_are_exact_and_deterministic(self):
        self.assertEqual(B.check_artifacts(ROOT, self.output), [])
        again, manifest = B.artifacts(self.topics, self.bank)
        self.assertEqual(again, self.output)
        self.assertEqual(manifest, self.manifest)

    def test_each_runtime_file_is_small_and_contains_only_its_topic(self):
        for ident, entry in self.manifest['chunks'].items():
            raw = self.output[entry['file']]
            self.assertLessEqual(len(raw), 32768, ident)
            self.assertEqual(len(raw), entry['bytes'])
            questions = json.loads(raw)
            self.assertEqual(len(questions), entry['questions'])
            self.assertEqual({q['topicId'] for q in questions}, {ident})
            self.assertTrue(all(q['level'] == 'pro' for q in questions))

    def test_missing_stale_and_unexpected_published_chunks_are_detected(self):
        path, expected = next((path, raw) for path, raw in self.output.items() if path.startswith('pro/'))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/pro').mkdir(parents=True)
            target = root / 'data' / path
            self.assertTrue(B.check_artifacts(root, {path: expected}))
            target.write_bytes(expected)
            self.assertEqual(B.check_artifacts(root, {path: expected}), [])
            target.write_bytes(expected + b' ')
            self.assertTrue(B.check_artifacts(root, {path: expected}))
            target.write_bytes(expected)
            (root / 'data/pro/rogue.json').write_text('[]')
            self.assertTrue(any('Unexpected' in e for e in B.check_artifacts(root, {path: expected})))

    def test_home_and_graph_prewarm_never_include_expert_banks(self):
        sw = (ROOT / 'sw.js').read_text()
        for name in ('SHELL', 'GRAPH_DATA'):
            match = re.search(r'var ' + name + r'\s*=\s*(\[[\s\S]*?\]);', sw)
            self.assertIsNotNone(match)
            entries = ast.literal_eval(match[1])
            self.assertFalse(any('data/pro/' in p or 'questions-pro' in p or 'pro-manifest' in p for p in entries))


if __name__ == '__main__':
    unittest.main()
