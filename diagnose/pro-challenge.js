/* 专家挑战使用按知识点加载的独立题库，不改变普通检测的通关记录。 */
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
  function validTopicId(id, subject) {
    return typeof id === 'string' && (subject === 'science' ? /^cns_p\d{3}$/.test(id)
      : subject === 'physics' ? /^cnp_(?:h)?\d{3}$/.test(id) : false);
  }
  function isSupported(topic) {
    if (!topic || topic.external || !validTopicId(topic.id, topic.subject)) return false;
    var grade = Number(topic.grade);
    return Number.isInteger(grade) && (topic.subject === 'science' ? grade >= 1 && grade <= 6
      : grade >= 8 && grade <= 15);
  }
  function topicURL(id, subject) {
    return validTopicId(id, subject) ? '../data/pro/' + id + '.json' : '';
  }
  function eligible(topics, ids, statuses) {
    return !!topics && Array.isArray(ids) && ids.length === 1 && isSupported(topics[ids[0]]) &&
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
  function validateBank(topics, ordinary, bank, scopeIds) {
    if (!Array.isArray(topics) || !Array.isArray(bank) || !bank.length ||
        ordinary != null && !Array.isArray(ordinary)) return false;
    var expected = Object.create(null), counts = Object.create(null), seen = Object.create(null);
    var baseIds = Object.create(null), prompts = Object.create(null), byId = Object.create(null);
    topics.filter(isSupported).forEach(function (topic) { byId[topic.id] = topic; });
    var ids = scopeIds === undefined ? Object.keys(byId) : scopeIds;
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return false;
    for (var n = 0; n < ids.length; n++) {
      if (!byId[ids[n]]) return false;
      // 初中保留原来每点四题；新增小学和高中每点至少三题。
      expected[ids[n]] = isJunior(byId[ids[n]]) ? 4 : 3;
    }
    (ordinary || []).forEach(function (q) { if (q && typeof q.id === 'string') baseIds[q.id] = true; });
    for (var i = 0; i < bank.length; i++) {
      var q = bank[i];
      if (!q || !Object.prototype.hasOwnProperty.call(expected, q.topicId) || typeof q.id !== 'string' ||
          !new RegExp('^' + q.topicId + '_q[1-9][0-9]*$').test(q.id) || Number(q.id.split('_q')[1]) < 101 || seen[q.id] || baseIds[q.id] ||
          ['choice', 'numeric', 'short'].indexOf(q.type) < 0 || typeof q.prompt !== 'string' || !q.prompt.trim() ||
          typeof q.answer !== 'string' || !q.answer.trim() || typeof q.explanation !== 'string' || !q.explanation.trim() ||
          q.level !== 'pro' || q.origin !== 'original' || ['standard', 'challenge'].indexOf(q.difficulty) < 0) return false;
      if (prompts[q.prompt.trim()]) return false;
      prompts[q.prompt.trim()] = true;
      if (q.type === 'choice' && (!Array.isArray(q.choices) || q.choices.length < 2 ||
          !q.choices.some(function (choice) { return choice && choice.key === q.answer; }) ||
          q.choices.some(function (choice) { return !choice || typeof choice.key !== 'string' || !/^[A-Z]$/.test(choice.key) || typeof choice.text !== 'string' || !choice.text.trim(); }) ||
          new Set(q.choices.map(function (choice) { return choice.key; })).size !== q.choices.length ||
          new Set(q.choices.map(function (choice) { return choice.text.trim(); })).size !== q.choices.length)) return false;
      if (q.type === 'numeric' && !validNumeric(q.answer)) return false;
      if (q.type === 'numeric' && q.tol !== undefined && (typeof q.tol !== 'number' || !Number.isFinite(q.tol) || q.tol < 0)) return false;
      if (q.accept !== undefined && (!Array.isArray(q.accept) ||
          q.accept.some(function (value) { return typeof value !== 'string' || !value.trim(); }))) return false;
      seen[q.id] = true;
      counts[q.topicId] = (counts[q.topicId] || 0) + 1;
    }
    return Object.keys(expected).length > 0 && Object.keys(expected).every(function (id) {
      return counts[id] >= expected[id];
    });
  }
  function validAnswers(graph, saved) {
    var used = Object.create(null);
    return !!graph && !!graph.bank && !!saved && Array.isArray(saved.targets) && Array.isArray(saved.answers) && saved.answers.every(function (answer) {
      if (!answer || saved.targets.indexOf(answer.id) < 0 || typeof answer.qid !== 'string' ||
          ['correct', 'wrong', 'skip'].indexOf(answer.result) < 0 || used[answer.qid] ||
          !graph.bank[answer.id] || !graph.bank[answer.id].some(function (q) { return q.id === answer.qid; })) return false;
      used[answer.qid] = true;
      return true;
    });
  }
  return { isJunior: isJunior, isSupported: isSupported, validTopicId: validTopicId, topicURL: topicURL,
    eligible: eligible, validateBank: validateBank, validAnswers: validAnswers };
});
