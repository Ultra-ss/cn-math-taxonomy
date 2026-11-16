/* 专家挑战只使用独立初中物理题库，不改变普通检测的通关记录。 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmProChallenge = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function isJunior(topic) {
    return !!topic && topic.subject === 'physics' && (Number(topic.grade) === 8 || Number(topic.grade) === 9);
  }
  function eligible(topics, ids, statuses) {
    return Array.isArray(ids) && ids.length === 1 && isJunior(topics[ids[0]]) &&
      !!statuses && !!statuses[ids[0]] && statuses[ids[0]].status === 'mastered';
  }
  function validNumeric(answer) {
    return answer.split(',').every(function (raw) {
      var token = raw.trim();
      if (!/^-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(token)) return false;
      var fraction = token.split('/');
      return Number.isFinite(Number(fraction[0])) && (fraction.length === 1 || (Number.isFinite(Number(fraction[1])) && Number(fraction[1]) !== 0));
    });
  }
  function validateBank(topics, ordinary, bank) {
    if (!Array.isArray(bank) || !bank.length || !Array.isArray(ordinary)) return false;
    var expected = Object.create(null), counts = Object.create(null), seen = Object.create(null);
    topics.filter(isJunior).forEach(function (topic) { expected[topic.id] = 0; });
    ordinary.forEach(function (q) { if (Object.prototype.hasOwnProperty.call(expected, q.topicId)) expected[q.topicId]++; });
    for (var i = 0; i < bank.length; i++) {
      var q = bank[i];
      if (!q || !Object.prototype.hasOwnProperty.call(expected, q.topicId) || typeof q.id !== 'string' ||
          !new RegExp('^' + q.topicId + '_q[1-9][0-9]*$').test(q.id) || seen[q.id] ||
          ordinary.some(function (base) { return base.id === q.id; }) ||
          ['choice', 'numeric', 'short'].indexOf(q.type) < 0 || typeof q.prompt !== 'string' || !q.prompt.trim() ||
          typeof q.answer !== 'string' || !q.answer.trim() || typeof q.explanation !== 'string' || !q.explanation.trim() ||
          q.level !== 'pro' || q.origin !== 'original' || ['standard', 'challenge'].indexOf(q.difficulty) < 0) return false;
      if (q.type === 'choice' && (!Array.isArray(q.choices) || q.choices.length < 2 ||
          !q.choices.some(function (choice) { return choice && choice.key === q.answer; }) ||
          q.choices.some(function (choice) { return !choice || typeof choice.key !== 'string' || typeof choice.text !== 'string' || !choice.text.trim(); }))) return false;
      if (q.type === 'numeric' && !validNumeric(q.answer)) return false;
      if (q.type === 'short' && q.accept !== undefined && (!Array.isArray(q.accept) ||
          q.accept.some(function (value) { return typeof value !== 'string' || !value.trim(); }))) return false;
      seen[q.id] = true;
      counts[q.topicId] = (counts[q.topicId] || 0) + 1;
    }
    return Object.keys(expected).length > 0 && Object.keys(expected).every(function (id) {
      return expected[id] > 0 && counts[id] === expected[id];
    });
  }
  function validAnswers(graph, saved) {
    var used = Object.create(null);
    return Array.isArray(saved.answers) && saved.answers.every(function (answer) {
      if (!answer || saved.targets.indexOf(answer.id) < 0 || typeof answer.qid !== 'string' ||
          ['correct', 'wrong', 'skip'].indexOf(answer.result) < 0 || used[answer.qid] ||
          !graph.bank[answer.id] || !graph.bank[answer.id].some(function (q) { return q.id === answer.qid; })) return false;
      used[answer.qid] = true;
      return true;
    });
  }
  return { isJunior: isJunior, eligible: eligible, validateBank: validateBank, validAnswers: validAnswers };
});
