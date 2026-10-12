/* 단계별 입력 화면과 종합 화면을 문자열로 만든다 */
(function () {
  var PL = window.PL, S = PL.S, STEPS = PL.STEPS, EV = PL.EV, EVL = PL.EVL, esc = PL.esc, filled = PL.filled, clip = PL.clip;

  /* ---------- 화면 조각 ---------- */
  function field(path, label, hint, val, rows) {
    var id = 'f-' + path.replace(/\./g, '-');
    return '<div class="field"><label for="' + id + '">' + label + (hint ? ' <span class="hint">' + hint + '</span>' : '') + '</label>' +
      '<textarea id="' + id + '" data-path="' + path + '"' + (rows ? ' style="min-height:' + rows + 'px"' : '') + '>' + esc(val) + '</textarea></div>';
  }
  function evSelect(path, v) {
    return '<select data-path="' + path + '" aria-label="근거 표시">' + EV.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select>';
  }

  function viewProblem() {
    var p = S.problem;
    return head('층 1', '문제를 한 덩어리로 써 보세요', '해결책이나 원인을 섞지 말고, 지금 벌어지는 일을 있는 그대로 적습니다.') +
      '<div class="tools"><button class="btn" data-act="sample">예시로 채워 보기</button></div>' +
      field('problem.what', '어떤 일이 벌어지나요?', '예: 이번 달 5번 지각했다', p.what, 80) +
      field('problem.who', '누가 겪나요?', '', p.who) +
      field('problem.when', '언제·어디서 생기나요?', '', p.when) +
      field('problem.impact', '그래서 어떤 손해가 있나요?', '횟수·시간·금액처럼 셀 수 있으면 좋아요', p.impact);
  }
  function viewWhys() {
    var rows = S.whys.map(function (w, i) {
      var prev = i === 0 ? '이 문제가 왜 생겼을까?' : '왜 “' + clip(S.whys[i - 1].t || '앞의 답', 28) + '”일까?';
      return '<div class="row"><div class="q"><b>Why ' + (i + 1) + '</b>' + esc(prev) + '</div>' +
        '<textarea data-path="whys.' + i + '.t" aria-label="Why ' + (i + 1) + ' 답">' + esc(w.t) + '</textarea>' + evSelect('whys.' + i + '.e', w.e) + '</div>' +
        (w.e === 'unknown' ? '<div class="field stop"><label for="why-q-' + i + '">여기서 멈춰요. 다음에 확인할 질문은 무엇인가요?</label><textarea id="why-q-' + i + '" data-path="whys.' + i + '.q">' + esc(w.q) + '</textarea></div>' : '');
    }).join('');
    return head('층 2', '5 Whys: 원인 후보를 깊게', '다섯 번을 채울 필요는 없어요. 근거가 없으면 “확인 필요”로 표시하고 멈춘 뒤, 다음에 확인할 질문을 마지막 칸에 남기세요.') +
      '<p class="tip">앞 단계의 문제: ' + esc(clip(S.problem.what || '(아직 안 썼어요)', 80)) + '</p>' + rows +
      '<div class="tools">' + (S.whys.length < 5 ? '<button class="btn" data-act="add-why">Why 더하기</button>' : '') +
      (S.whys.length > 1 ? '<button class="btn" data-act="del-why">마지막 줄 지우기</button>' : '') + '</div>';
  }
  function viewTree() {
    var t = S.tree;
    var rows = t.branches.map(function (b, i) {
      return '<div class="row"><div class="q"><b>가지 ' + (i + 1) + '</b></div><textarea data-path="tree.branches.' + i + '.t" aria-label="가지 ' + (i + 1) + '">' + esc(b.t) + '</textarea>' + evSelect('tree.branches.' + i + '.e', b.e) + '</div>';
    }).join('');
    return head('층 3', '이슈 트리: 다른 이유도 있을까?', '한 원인에 너무 빨리 확신하지 않도록, 같은 기준으로 원인을 나눠 봅니다. 세 갈래를 만들었다고 원인이 모두 설명되는 것은 아니에요.') +
      field('tree.criterion', '나누는 기준', '예: 사람 / 절차 / 자료 / 도구, 또는 시간 순서', t.criterion) + rows +
      '<div class="tools">' + (S.whys.some(function (w) { return filled(w.t); }) ? '<button class="btn" data-act="import-why">5 Whys 답을 가지로 가져오기</button>' : '') + (t.branches.length < 6 ? '<button class="btn" data-act="add-br">가지 더하기</button>' : '') +
      (t.branches.length > 2 ? '<button class="btn" data-act="del-br">마지막 가지 지우기</button>' : '') + '</div>';
  }
  function viewHyp() {
    var h = S.hyp;
    var opts = '<option value="">먼저 확인할 후보를 고르세요</option>' + S.tree.branches.filter(function (b) { return filled(b.t); }).map(function (b) {
      return '<option value="' + esc(b.t) + '"' + (b.t === h.pick ? ' selected' : '') + '>' + esc(clip(b.t, 60)) + '</option>';
    }).join('');
    return head('층 4', '가설과 반례', '점수를 올리려고 쓰지 말고, 틀릴 수 있게 쓰세요. 틀렸다면 무엇이 보일지까지 적어야 확인할 수 있습니다.') +
      '<div class="field"><label for="f-hyp-pick">먼저 확인할 원인 후보</label><select id="f-hyp-pick" data-path="hyp.pick">' + opts + '</select></div>' +
      field('hyp.claim', '내 가설', '“~ 때문에 ~가 생긴다” 한 문장', h.claim) +
      field('hyp.counter', '반례: 이 가설이 틀렸다면 무엇이 보일까?', '', h.counter) +
      field('hyp.check', '확인 방법', '이번 주에 할 수 있는 가장 작은 확인', h.check);
  }
  function viewHows() {
    var rows = S.hows.map(function (w, i) {
      var prev = i === 0 ? '고르고 싶은 해결 방향을 어떻게 할까?' : '“' + clip(S.hows[i - 1].t || '앞의 답', 28) + '”을(를) 구체적으로 어떻게 할까?';
      return '<div class="row" style="grid-template-columns:minmax(0,1fr)"><div class="q"><b>How ' + (i + 1) + '</b>' + esc(prev) + '</div>' +
        '<textarea data-path="hows.' + i + '.t" aria-label="How ' + (i + 1) + '">' + esc(w.t) + '</textarea></div>';
    }).join('');
    return head('층 5 · 선택', '5 Hows: 실행 방법이 막연할 때', '해결이 막연하면 “어떻게”를 반복해 오늘 할 첫 행동까지 내려옵니다. 건너뛰어도 괜찮아요.') + rows +
      '<div class="tools">' + (S.hows.length < 5 ? '<button class="btn" data-act="add-how">How 더하기</button>' : '') +
      (S.hows.length > 1 ? '<button class="btn" data-act="del-how">마지막 줄 지우기</button>' : '') + '</div>';
  }
  function viewScqa() {
    var s = S.scqa;
    return head('층 6 · 선택', 'SCQA: 네 문장으로 말하기', '짝에게 설명한다고 생각하고 한 문장씩 쓰세요.') +
      field('scqa.s', 'S 상황', '모두가 동의하는 배경', s.s) +
      field('scqa.c', 'C 문제', '상황과 어긋나는 점', s.c) +
      field('scqa.q', 'Q 질문', '그래서 우리가 답해야 할 질문', s.q) +
      field('scqa.a', 'A 제안', '질문에 대한 지금의 답', s.a);
  }
  function recapHTML() {
    var p = S.problem, out = [];
    out.push(['문제', [p.what, p.who && '누가: ' + p.who, p.when && '언제·어디서: ' + p.when, p.impact && '손해: ' + p.impact].filter(Boolean).join('\n')]);
    out.push(['5 Whys', S.whys.filter(function (w) { return filled(w.t); }).map(function (w, i) { return (i + 1) + '. ' + w.t + ' [' + (EVL[w.e] || '') + ']'; }).join('\n')]);
    out.push(['이슈 트리 (' + (S.tree.criterion || '기준 없음') + ')', S.tree.branches.filter(function (b) { return filled(b.t); }).map(function (b) { return '· ' + b.t + ' [' + (EVL[b.e] || '') + ']'; }).join('\n')]);
    out.push(['가설과 반례', [S.hyp.pick && '후보: ' + S.hyp.pick, S.hyp.claim && '가설: ' + S.hyp.claim, S.hyp.counter && '반례: ' + S.hyp.counter, S.hyp.check && '확인: ' + S.hyp.check].filter(Boolean).join('\n')]);
    var hw = S.hows.filter(function (w) { return filled(w.t); }).map(function (w, i) { return (i + 1) + '. ' + w.t; }).join('\n');
    if (hw) out.push(['5 Hows', hw]);
    var s = S.scqa;
    if (filled(s.s + s.c + s.q + s.a)) out.push(['SCQA', 'S ' + s.s + '\nC ' + s.c + '\nQ ' + s.q + '\nA ' + s.a]);
    return out;
  }
  function viewFinal() {
    var r = recapHTML().filter(function (x) { return filled(x[1]); }).map(function (x) { return '<div><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
    var rated = STEPS.filter(function (s) { return S.results[s.key] && S.results[s.key].score != null && s.key !== 'final'; });
    var low = rated.length > 1 ? rated.reduce(function (m, s) { return S.results[s.key].score < S.results[m.key].score ? s : m; }) : null;
    var table = rated.length ? '<ul class="scorelist">' + rated.map(function (s) {
      var rr = S.results[s.key], stale = rr.sig && rr.sig !== PL.describe(s.key);
      return '<li' + (low && low.key === s.key ? ' class="weak"' : '') + '><span class="sn">' + s.name + '</span><span class="sv">' + rr.score + ' / 10</span><span class="sm">' + esc(rr.summary) + (stale ? ' (수정 뒤 재평가 필요)' : '') + '</span></li>';
    }).join('') + '</ul>' : '';
    return head('종합', '지금까지 판 것을 한눈에', '단계별 점수를 모아 보고, 전체가 이어지는지 AI에게 마지막으로 점검받으세요. 점수가 가장 낮은 층부터 다시 파면 효과가 커요.') + table +
      '<div class="recap">' + (r || '<span class="note">아직 쓴 내용이 없어요. 왼쪽에서 1층부터 시작하세요.</span>') + '</div>' +
      '<div class="tools"><button class="btn" data-act="copy">내용 복사</button></div><p class="note" id="copyMsg" aria-live="polite"></p>';
  }
  function head(eyebrow, title, lead) { return '<p class="eyebrow">' + eyebrow + '</p><h2>' + title + '</h2><p class="lead">' + lead + '</p>'; }

  function gauge() {
    var t = '';
    for (var i = 0; i < STEPS.length; i++) t += '<i class="' + (i === S.step ? 'cur' : i < S.step ? 'on' : '') + '"></i>';
    return '<div class="gauge" aria-hidden="true"><div class="ticks">' + t + '</div><div class="gl"><span>지표면</span><span>현재 깊이 ' + (S.step < 6 ? '−' + (S.step + 1) + 'm' : '출토 단계') + '</span></div></div>';
  }

  PL.views = { problem: viewProblem, whys: viewWhys, tree: viewTree, hyp: viewHyp, hows: viewHows, scqa: viewScqa, final: viewFinal };
  PL.recapHTML = recapHTML;
  PL.gauge = gauge;
})();
