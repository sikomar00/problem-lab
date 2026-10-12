/* 화면 그리기, 이벤트 연결, 시작 */
(function () {
  var PL = window.PL, S = PL.S, STEPS = PL.STEPS, esc = PL.esc, filled = PL.filled, setPath = PL.setPath, persist = PL.persist;
  var $strata = document.getElementById('strata'), $panel = document.getElementById('panel');

  function render() {
    var key = STEPS[S.step].key;
    var views = PL.views;
    var label = key === 'final' ? '종합 평가 받기' : 'AI 평가 받기';
    $panel.innerHTML = PL.gauge() + views[key]() + '<div id="local"></div>' +
      '<div class="tools"><button class="btn primary" data-act="eval"' + (PL.ai.busy ? ' disabled' : '') + '>' + label + '</button></div>' +
      '<p class="note">' + esc(STEPS[S.step].q) + '</p>' + PL.resultHTML(key) +
      '<div class="nav"><button class="btn" data-act="prev"' + (S.step === 0 ? ' disabled' : '') + '>이전 층</button>' +
      '<button class="btn" data-act="next"' + (S.step === STEPS.length - 1 ? ' disabled' : '') + '>' + (STEPS[S.step + 1] && STEPS[S.step + 1].opt ? '다음 층 (선택)' : '다음 층') + '</button></div>';
    $strata.innerHTML = STEPS.map(function (s, i) {
      var done = S.results[s.key] && S.results[s.key].score != null;
      return '<li class="l' + (i + 1) + (done ? ' done' : '') + '"' + (i === S.step ? ' aria-current="step"' : '') + '><button data-go="' + i + '"><span class="depth">' + (i < 6 ? '-' + (i + 1) + 'm' : '출토') + '</span><span class="nm">' + s.name + (s.opt ? '<span class="opt">선택</span>' : '') + '</span></button></li>';
    }).join('');
    PL.updateLocal();
    persist();
  }

  /* ---------- 이벤트 ---------- */
  $panel.addEventListener('input', function (e) {
    var p = e.target.getAttribute && e.target.getAttribute('data-path');
    if (!p) return;
    setPath(p, e.target.value); persist();
    if (e.target.tagName === 'SELECT') {
      render();
      var again = $panel.querySelector('[data-path="' + p + '"]');
      if (again) again.focus();
    } else { PL.updateLocal(); }
  });
  /* ---------- 대시보드 <-> 작업 화면 ---------- */
  var $layout = document.querySelector('.layout'), $dash = document.getElementById('dash'), $tabs = document.getElementById('tabs');
  function setView(v) {
    PL.view = v;
    $layout.hidden = v !== 'work';
    $dash.hidden = v !== 'dash';
    Array.prototype.forEach.call($tabs.querySelectorAll('[data-view]'), function (b) {
      if (b.getAttribute('data-view') === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (v === 'dash') PL.renderDash();
    window.scrollTo(0, 0);
  }
  PL.setView = setView;
  PL.openRecord = function (id) {
    PL.store.flushNow();
    var rec = PL.store.get(id);
    if (!rec) return;
    PL.load(rec); PL.store.markOpened(); render(); setView('work');
  };
  PL.newProblem = function () {
    PL.store.flushNow();
    PL.reset(); PL.store.markOpened(); render(); setView('work');
  };
  $tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'newp') return PL.newProblem();
    var v = b.getAttribute('data-view');
    if (v) { PL.store.flushNow(); setView(v); }
  });
  $strata.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (b) { S.step = +b.getAttribute('data-go'); render(); window.scrollTo(0, 0); }
  });
  $panel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'eval') return PL.evaluate(STEPS[S.step].key);
    if (a === 'next' && S.step < STEPS.length - 1) { S.step++; render(); window.scrollTo(0, 0); return; }
    if (a === 'prev' && S.step > 0) { S.step--; render(); window.scrollTo(0, 0); return; }
    if (a === 'add-why') S.whys.push({ t: '', e: '' });
    else if (a === 'del-why') S.whys.pop();
    else if (a === 'add-br') S.tree.branches.push({ t: '', e: '' });
    else if (a === 'del-br') S.tree.branches.pop();
    else if (a === 'import-why') {
      S.whys.filter(function (w) { return filled(w.t); }).forEach(function (w) {
        if (S.tree.branches.some(function (b) { return b.t.trim() === w.t.trim(); })) return;
        var slot = S.tree.branches.filter(function (b) { return !filled(b.t); })[0];
        if (slot) { slot.t = w.t; slot.e = w.e; }
        else if (S.tree.branches.length < 6) S.tree.branches.push({ t: w.t, e: w.e });
      });
    }
    else if (a === 'add-how') S.hows.push({ t: '' });
    else if (a === 'del-how') S.hows.pop();
    else if (a === 'sample') {
      S.problem = { what: '이번 달에 평일 아침 출근 시간에 5번 늦었다.', who: '나(직장인 2년 차)', when: '월·수요일 아침, 집에서 나서는 시각이 8시 20분을 넘길 때', impact: '지각 5번, 팀 아침 회의 앞부분을 놓침. 매번 15분 정도 늦음.' };
      S.whys = [{ t: '집에서 나서는 시각이 계획보다 늦어진다.', e: 'confirmed' }, { t: '준비하다가 가방을 다시 싸게 된다.', e: 'guess' }];
    }
    else if (a === 'copy') {
      var sc = STEPS.filter(function (s) { return S.results[s.key] && S.results[s.key].score != null; }).map(function (s) { return '- ' + s.name + ' ' + S.results[s.key].score + '/10: ' + S.results[s.key].summary; }).join('\n');
      var txt = PL.recapHTML().filter(function (x) { return filled(x[1]); }).map(function (x) { return '## ' + x[0] + '\n' + x[1]; }).join('\n\n') + (sc ? '\n\n## AI 평가\n' + sc : '');
      var msg = document.getElementById('copyMsg');
      var ok = function () { if (msg) msg.textContent = '복사했어요.'; };
      var fail = function () { if (msg) msg.textContent = '복사가 막혀 있어요. 아래 내용을 직접 선택해 복사해 주세요.'; };
      try { navigator.clipboard.writeText(txt).then(ok, fail); } catch (er) { fail(); }
      return;
    }
    render();
    if (/^add-/.test(a)) { var ta = $panel.querySelectorAll('.row textarea'); if (ta.length) ta[ta.length - 1].focus(); }
  });

  render();
  setView('work');

  /* 저장소가 준비되면 가장 최근 문제를 불러오고 대시보드를 먼저 보여 준다 */
  PL.store.ready.then(function () {
    var recs = PL.store.list();
    if (recs.length && !PL.hasAny(S)) {
      recs.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      PL.load(recs[0]); PL.store.markOpened(); render();
      setView('dash');
    } else if (PL.view === 'dash') { PL.renderDash(); }
  });

  /* AI 연결은 화면을 막지 않고 뒤에서 확인 */
  PL.initAI();

  PL.render = render;
})();
