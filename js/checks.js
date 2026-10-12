/* AI에 보내기 전에 브라우저에서 바로 하는 점검 */
(function () {
  var PL = window.PL, S = PL.S, STEPS = PL.STEPS, esc = PL.esc, filled = PL.filled;

  function localChecks() {
    var key = STEPS[S.step].key, c = [];
    function add(ok, good, bad) { c.push({ s: ok ? 'good' : 'warn', t: ok ? good : bad }); }
    if (key === 'problem') {
      var p = S.problem;
      if (!filled(p.what)) return [];
      add(p.what.trim().length >= 15, '문제 문장이 구체적이에요', '문제 문장이 짧아요. 상황을 한 줄 더 적어 보세요');
      add(/\d/.test(p.what + p.impact), '숫자가 들어 있어요', '횟수나 시간 같은 숫자가 없어요');
      add(!/(해야|하자|하면 좋|만들|도입|사야)/.test(p.what), '해결책이 섞이지 않았어요', '해결책이 섞인 말투예요. 일어난 일만 적어 보세요');
    } else if (key === 'whys') {
      var rows = S.whys.filter(function (w) { return filled(w.t); });
      if (!rows.length) return [];
      add(rows.some(function (w) { return w.e === 'confirmed'; }), '직접 확인한 줄이 있어요', '“확인됨”으로 표시한 줄이 없어요');
      add(rows.every(function (w) { return w.e; }), '모든 줄에 근거를 표시했어요', '근거를 표시하지 않은 줄이 있어요');
      if (rows.some(function (w) { return w.e === 'unknown' && !filled(w.q); })) add(false, '', '“확인 필요”에서 멈췄다면 확인할 질문을 남겨 주세요');
    } else if (key === 'tree') {
      var bs = S.tree.branches.filter(function (b) { return filled(b.t); });
      if (!bs.length) return [];
      add(filled(S.tree.criterion), '나누는 기준을 적었어요', '나누는 기준이 비어 있어요');
      add(bs.length >= 3, '가지가 세 개 이상이에요', '가지가 세 개보다 적어요. 빠진 원인이 없는지 보세요');
      add(bs.every(function (b) { return b.e; }), '가지마다 근거를 표시했어요', '근거를 표시하지 않은 가지가 있어요');
    } else if (key === 'hyp') {
      if (!filled(S.hyp.claim)) return [];
      add(!!S.hyp.pick, '확인할 후보를 골랐어요', '이슈 트리에서 확인할 후보를 고르지 않았어요');
      add(filled(S.hyp.counter), '반례를 적었어요', '반례가 비어 있어요');
      add(filled(S.hyp.check), '확인 방법을 적었어요', '확인 방법이 비어 있어요');
    }
    return c;
  }
  function updateLocal() {
    var el = document.getElementById('local');
    if (!el) return;
    var c = localChecks();
    el.innerHTML = c.length ? '<p class="chiphd">보내기 전 스스로 점검</p><div class="chips">' + c.map(function (x) { return '<span class="chip ' + x.s + '">' + esc(x.t) + '</span>'; }).join('') + '</div>' : '';
  }

  PL.localChecks = localChecks;
  PL.updateLocal = updateLocal;
})();
