# 科学与物理题库

当前题库 `data/questions.json` 仅包含科学、物理，2152 题，每个知识点 4 题；科学和物理各 1076 题。题型为选择题和数值题，题目数量按数据实时统计。

## 格式

```json
{
  "id": "cnp_001_q1",
  "topicId": "cnp_001",
  "difficulty": "basic",
  "type": "choice",
  "prompt": "长度的国际单位是什么？",
  "choices": [{"key": "A", "text": "米（m）"}, {"key": "B", "text": "秒（s）"}],
  "answer": "A",
  "explanation": "长度的国际单位是米。"
}
```

上例用于展示字段结构，正式数据的选项以题库为准。题目 ID 以对应知识点 ID 加 `_q` 和序号组成，`topicId` 必须存在。难度主要为 `basic`、`standard`、`challenge`（旧值 `advanced` 对应拓展题）；选择题答案引用选项键，数值题答案需与 `diagnose/engine.js` 的保守判题兼容。

修改题干、选项或答案时保留稳定 ID；如果语义变更会使旧答题记录失效，应同时考虑 `assets/stem-compat.js` 的历史兼容机制。新增题目不应复用已有 ID。

运行 `npm test` 检查结构、关联、示意图、答案格式和诊断回归。自动校验只验证可检查的规则，不代表题目、难度和学科答案已由教师审核。原项目的旧学科生成脚本及审核记录属于历史资料，不应直接用于覆盖当前两科数据。
