/* 평가 기준(RUBRIC), AI에 보내는 프롬프트, 평가 결과 카드 */
(function () {
  var PL = window.PL, S = PL.S, STEPS = PL.STEPS, EVL = PL.EVL, esc = PL.esc, filled = PL.filled, persist = PL.persist, recapHTML = PL.recapHTML, ai = PL.ai;

  var RUBRIC = {
    problem: '문제가 구체적인지(누가·언제·어디서·얼마나), 원인이나 해결책이 섞이지 않았는지, 관찰할 수 있는 사실로 적혔는지, 손해를 셀 수 있게 적었는지 본다.',
    whys: '각 줄이 앞 줄의 원인인지(인과가 이어지는지), 근거 표시(확인됨/추측/확인 필요)가 서술과 맞는지, 추측을 사실처럼 쓰지 않았는지 본다. 근거가 없는데 억지로 다섯 번을 채웠으면 지적한다. 근거가 없을 때 “확인 필요”로 멈추고 다음에 확인할 질문을 남겼으면 칭찬한다.',
    tree: '같은 기준으로 나눴는지, 가지끼리 겹치는지, 빠진 가지(사람·절차·자료·도구 등)가 있는지, 가지마다 근거 표시가 있는지 본다. 세 갈래를 만들었다고 원인이 모두 설명되는 것은 아님을 상기시킨다.',
    hyp: '가설이 틀릴 수 있게 쓰였는지, 반례가 눈으로 볼 수 있는 구체적 신호인지, 확인 방법이 작고 이번 주에 가능한지, 고른 후보가 이슈 트리와 5 Whys에서 근거가 있는지 본다.',
    hows: '각 단계가 앞 단계보다 더 구체적인 행동으로 내려가는지, 마지막이 오늘 바로 할 수 있는 첫 행동인지 본다.',
    scqa: '상황이 모두 동의할 사실인지, 문제가 상황과 어긋남을 보여 주는지, 질문이 문제에서 자연스럽게 나오는지, 제안이 질문에 답하는지, 문장이 짧은지 본다.',
    final: '문제 정의, 5 Whys, 이슈 트리, 가설이 서로 이어지는지, 가장 약한 연결 고리가 어디인지, 다음에 확인할 것이 분명한지 본다.'
  };
  function describe(key) {
    var map = {
      problem: function () { return recapHTML()[0][1]; },
      whys: function () { return '문제: ' + S.problem.what + '\n' + S.whys.map(function (w, i) { return 'Why ' + (i + 1) + ': ' + w.t + ' / 근거 표시: ' + EVL[w.e] + (w.e === 'unknown' ? ' / 다음에 확인할 질문: ' + (w.q || '(비어 있음)') : ''); }).join('\n'); },
      tree: function () { return '문제: ' + S.problem.what + '\n나누는 기준: ' + S.tree.criterion + '\n' + S.tree.branches.map(function (b, i) { return '가지 ' + (i + 1) + ': ' + b.t + ' / 근거 표시: ' + EVL[b.e]; }).join('\n') + '\n(참고) 5 Whys: ' + S.whys.map(function (w) { return w.t; }).join(' → '); },
      hyp: function () { return '문제: ' + S.problem.what + '\n고른 후보: ' + S.hyp.pick + '\n가설: ' + S.hyp.claim + '\n반례: ' + S.hyp.counter + '\n확인 방법: ' + S.hyp.check + '\n(참고) 이슈 트리 가지: ' + S.tree.branches.map(function (b) { return b.t + '[' + EVL[b.e] + ']'; }).join(' | '); },
      hows: function () { return '가설: ' + S.hyp.claim + '\n' + S.hows.map(function (w, i) { return 'How ' + (i + 1) + ': ' + w.t; }).join('\n'); },
      scqa: function () { return 'S: ' + S.scqa.s + '\nC: ' + S.scqa.c + '\nQ: ' + S.scqa.q + '\nA: ' + S.scqa.a + '\n(참고) 문제: ' + S.problem.what; },
      final: function () { return recapHTML().map(function (x) { return '[' + x[0] + ']\n' + x[1]; }).join('\n\n'); }
    };
    return map[key]();
  }
  function hasContent(key) {
    if (key === 'problem') return filled(S.problem.what);
    if (key === 'whys') return S.whys.some(function (w) { return filled(w.t); });
    if (key === 'tree') return S.tree.branches.filter(function (b) { return filled(b.t); }).length >= 2;
    if (key === 'hyp') return filled(S.hyp.claim);
    if (key === 'hows') return S.hows.some(function (w) { return filled(w.t); });
    if (key === 'scqa') return filled(S.scqa.s + S.scqa.c + S.scqa.q + S.scqa.a);
    return filled(S.problem.what);
  }
  function minMsg(key) {
    return { problem: '“어떤 일이 벌어지나요?”를 먼저 써 주세요.', whys: 'Why를 한 줄 이상 써 주세요.', tree: '가지를 두 개 이상 써 주세요.', hyp: '내 가설을 써 주세요.', hows: 'How를 한 줄 이상 써 주세요.', scqa: '네 문장 중 하나 이상 써 주세요.', final: '1층에서 문제를 먼저 써 주세요.' }[key];
  }

  function evaluate(key) {
    if (ai.busy) return;
    if (!hasContent(key)) { S.results[key] = { error: minMsg(key) }; return PL.render(); }
    if (!ai.sample) { S.results[key] = { error: ai.state === 'pending' ? 'AI 연결을 확인하는 중이에요. 잠시 뒤 다시 눌러 주세요.' : '이 화면에서는 AI 평가를 쓸 수 없어요. 직접 쓰는 연습은 그대로 할 수 있습니다.' }; return PL.render(); }
    ai.busy = true; S.results[key] = { loading: true }; PL.render();
    var prompt = '너는 문제정의를 가르치는 코치다. 학습자가 직접 쓴 생각을 평가한다.\n' +
      '규칙: 학습자 대신 답을 써 주지 않는다. 칭찬은 구체적인 부분만, 지적은 가장 고칠 것 위주로. 점수는 후하게 주지 않는다(5 이하면 크게 고칠 것이 있다는 뜻). 한국어로, 중학생도 이해할 쉬운 말로 쓴다.\n' +
      '이번 단계: ' + STEPS.filter(function (s) { return s.key === key; })[0].name + '\n평가 관점: ' + RUBRIC[key] + '\n\n[학습자가 쓴 내용]\n' + describe(key) + '\n\n' +
      '아래 JSON만 출력해. 설명이나 코드펜스 없이.\n' +
      '{"score": 0~10 정수, "summary": "한 줄 총평(60자 이내)", "checks": [{"label": "점검 항목 이름", "status": "good|warn|gap", "note": "근거를 들어 한두 문장"}] (3~5개), "questions": ["학습자에게 되묻는 질문 또는 반례를 찾게 하는 질문"] (2~3개), "next": "다음에 확인하거나 고칠 것 한 가지"}';
    ai.sample.json(prompt, { cache: false }).then(function (r) {
      ai.busy = false;
      if (!r || typeof r.score === 'undefined') throw { message: '형식이 맞지 않는 답이 왔어요.' };
      r.sig = describe(key); S.results[key] = r; persist(); PL.render();
    }).catch(function (err) {
      ai.busy = false;
      var m = err && err.code === 'rate_limited' ? '요청이 너무 잦아요. 잠시 뒤에 다시 눌러 주세요.' : err && err.code === 'not_granted' ? 'AI 사용을 허용하지 않아서 평가할 수 없어요.' : '평가를 가져오지 못했어요. 다시 눌러 주세요.';
      S.results[key] = { error: m }; PL.render();
    });
  }

  function resultHTML(key) {
    var r = S.results[key];
    if (!r) return '';
    if (r.loading) return '<div class="result"><span class="loading">내 생각을 읽고 있어요…</span></div>';
    if (r.error) return '<div class="result"><span class="note">' + esc(r.error) + '</span></div>';
    var sc = Math.max(0, Math.min(10, Math.round(Number(r.score) || 0)));
    var bar = ''; for (var i = 0; i < 10; i++) bar += '<i class="' + (i < sc ? 'on' : '') + '"></i>';
    var st = { good: '좋아요', warn: '보완', gap: '비어 있음' };
    var checks = (r.checks || []).map(function (c) {
      var k = st[c.status] ? c.status : 'warn';
      return '<li><span class="pill ' + k + '">' + st[k] + '</span><div><div class="lb">' + esc(c.label) + '</div><div class="nt">' + esc(c.note) + '</div></div></li>';
    }).join('');
    var qs = (r.questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('');
    return '<div class="result" aria-live="polite"><div class="score"><div class="n">' + sc + '<small> / 10</small></div><div class="bar" aria-hidden="true">' + bar + '</div></div>' +
      '<p class="summary">' + esc(r.summary) + '</p><ul class="checks">' + checks + '</ul>' +
      (qs ? '<div><h3>되물음</h3><ul class="qs">' + qs + '</ul></div>' : '') +
      (r.next ? '<div><h3>다음에 할 것</h3><div>' + esc(r.next) + '</div></div>' : '') +
      (r.sig && r.sig !== describe(key) ? '<p class="stale">이 평가는 수정하기 전 내용 기준이에요. 다시 평가받아 보세요.</p>' : '<p class="note">고친 뒤 다시 평가받으면 점수가 달라질 수 있어요.</p>') + '</div>';
  }

  PL.RUBRIC = RUBRIC;
  PL.describe = describe;
  PL.evaluate = evaluate;
  PL.resultHTML = resultHTML;
})();
