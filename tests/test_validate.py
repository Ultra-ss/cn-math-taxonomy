#!/usr/bin/env python3
"""针对真实两科数据的校验回归：正确数据可用，损坏引用仍需阻断。"""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import validate as V


def read(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))


class TwoSubjectValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.topics = read('topics.json')
        cls.ids = {t['id']: t for t in cls.topics}
        cls.questions = read('questions.json')

    def setUp(self):
        V.errors.clear()
        V.warnings.clear()

    def test_actual_topics_and_questions_are_checked(self):
        V.check_topics(self.topics)
        problems, stats = V.question_errors(self.questions, self.ids)
        self.assertEqual(V.errors, [])
        self.assertEqual(problems, [])
        self.assertEqual(stats['total'], 2152)

    def test_removed_subject_cannot_reenter_topic_data(self):
        old = copy.deepcopy(self.topics[0])
        old.update(id='cnm_001', subject='math')
        V.check_topics([old])
        self.assertTrue(any('仅支持科学或物理' in e for e in V.errors))

    def test_dangling_question_reference_is_not_skipped(self):
        q = dict(self.questions[0], id='cnp_999_q1', topicId='cnp_999')
        problems, _ = V.question_errors([q], self.ids, require_coverage=False)
        self.assertTrue(any('topicId 不存在' in e for e in problems))

    def test_missing_topic_coverage_is_not_skipped(self):
        tid = self.questions[0]['topicId']
        qs = [q for q in self.questions if q['topicId'] != tid]
        problems, _ = V.question_errors(qs, self.ids)
        self.assertTrue(any(tid in e and '只有 0 道题' in e for e in problems))

    def test_mixed_subject_dependency_is_rejected(self):
        V.check_deps([{'topicId': 'cnp_001', 'prerequisiteId': 'cns_p001',
                       'strength': 'hard', 'reason': '错误的跨科先修'}], self.ids)
        self.assertTrue(V.errors)

    def check_mapping(self, edition, tid):
        data = {'edition': edition, 'label': '版本对照', 'status': 'draft',
                'source': '测试用对照依据', 'entries': [
                    {'topicId': tid, 'grade': self.ids[tid]['grade'],
                     'term': self.ids[tid]['semester']} ]}
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, edition + '.json').write_text(json.dumps(data), encoding='utf-8')
            with patch.object(V, 'MAPPINGS_DIR', folder):
                return V.check_mapping_files(self.ids)

    def test_new_physics_mapping_including_final_senior_volume(self):
        topic = next(t for t in self.topics if t['subject'] == 'physics' and t['grade'] == 15)
        self.assertEqual(self.check_mapping('example_physics', topic['id']), (1, 1))
        self.assertEqual(V.errors, [])

    def test_new_science_mapping(self):
        self.assertEqual(self.check_mapping('example_science', 'cns_p001'), (1, 1))
        self.assertEqual(V.errors, [])

    def test_mapping_rejects_cross_subject_and_removed_subject(self):
        self.check_mapping('example_science', 'cnp_001')
        self.assertTrue(any('只能对照科学' in e for e in V.errors))
        V.errors.clear()
        self.check_mapping('example_math', 'cnp_001')
        self.assertTrue(any('_science 或 _physics' in e for e in V.errors))

    def test_removed_standards_are_rejected(self):
        standard_file = read('cn-curriculum-standards.json')
        standard_file['items'].append({'id': 'cms-2022:1.NA.01',
                                      'domain': '数与代数', 'section': '数', 'text': '旧学科条目'})
        V.check_standards_file(standard_file)
        self.assertTrue(any('仅支持科学、初中物理和高中物理课标' in e for e in V.errors))


if __name__ == '__main__':
    unittest.main()
