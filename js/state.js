/* 상태, 단계 정의, 저장, 공용 도우미. 다른 파일은 window.PL로 이것들을 가져다 쓴다. */
window.PL = window.PL || {};
(function () {
  var STEPS = [
    { key: 'problem', name: '문제 쓰기', q: '누가, 언제, 무엇 때문에 어떤 일을 겪나요?' },
    { key: 'whys', name: '5 Whys', q: '방금 말한 일이 왜 생겼을까?' },
    { key: 'tree', name: '이슈 트리', q: '다른 이유도 있을까? 겹치거나 빠진 것은?' },
    { key: 'hyp', name: '가설과 반례', q: '내 생각이 틀렸다면 무엇이 보여야 할까?' },
    { key: 'hows', name: '5 Hows', opt: true, q: '그 해결을 구체적으로 어떻게 할까?' },
    { key: 'scqa', name: 'SCQA', opt: true, q: '상황·문제·질문·제안 순으로 말해 볼까?' },
    { key: 'final', name: '종합 점검' }
  ];
  var EV = [['', '근거 선택'], ['confirmed', '확인됨'], ['guess', '추측'], ['unknown', '확인 필요']];
  var EVL = { confirmed: '확인됨(직접 본 것·기록·숫자)', guess: '추측', unknown: '확인 필요', '': '(근거 표시 안 함)' };

  function blank() {
    return {
      step: 0,
      problem: { what: '', who: '', when: '', impact: '' },
      whys: [{ t: '', e: '' }],
      tree: { criterion: '', branches: [{ t: '', e: '' }, { t: '', e: '' }, { t: '', e: '' }] },
      hyp: { pick: '', claim: '', counter: '', check: '' },
      hows: [{ t: '' }],
      scqa: { s: '', c: '', q: '', a: '' },
      results: {}
    };
  }

  /* S는 다른 파일이 같은 객체를 계속 보도록 통째로 바꾸지 않고 안의 내용만 바꾼다 */
  var S = {};
  function reset() {
    Object.keys(S).forEach(function (k) { delete S[k]; });
    Object.assign(S, blank());
  }
  reset();
  try {
    var saved = JSON.parse(localStorage.getItem('problem-lab-v1') || 'null');
    if (saved && saved.problem) {
      Object.assign(S, saved);
      Object.keys(S.results || {}).forEach(function (k) { if (S.results[k] && (S.results[k].loading || S.results[k].error)) delete S.results[k]; });
    }
  } catch (e) {}
  function persist() { try { localStorage.setItem('problem-lab-v1', JSON.stringify(S)); } catch (e) {} }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setPath(path, val) {
    var p = path.split('.'), o = S;
    for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
    o[p[p.length - 1]] = val;
  }
  function filled(s) { return s && String(s).trim().length > 0; }
  function clip(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

  PL.STEPS = STEPS; PL.EV = EV; PL.EVL = EVL;
  PL.S = S; PL.blank = blank; PL.reset = reset; PL.persist = persist;
  PL.esc = esc; PL.setPath = setPath; PL.filled = filled; PL.clip = clip;
  /* AI 연결 상태. app.js가 채운다 */
  PL.ai = { sample: null, busy: false, state: 'pending' };
})();
