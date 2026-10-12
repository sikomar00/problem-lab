/* 대시보드: 저장된 문제를 모아 보고, 열기·복제·보관·삭제·내보내기·가져오기를 한다 */
(function () {
  var PL = window.PL, STEPS = PL.STEPS, esc = PL.esc, store = PL.store;
  var $dash = document.getElementById('dash');
  var F = { q: '', status: 'all', sort: 'recent' };
  var armedId = null, armTimer = null;
  var CORE = ['problem', 'whys', 'tree', 'hyp'];
  var CHART = STEPS.filter(function (s) { return s.key !== 'final'; });
  var STATUS = { new: '시작 전', active: '진행 중', done: '핵심 완료', archived: '보관' };

  function scoreOf(rec, k) { var r = rec.results && rec.results[k]; return r && typeof r.score === 'number' ? r.score : null; }
  function metrics(rec) {
    var sc = [], weak = null, wv = 11;
    CHART.forEach(function (s) {
      var v = scoreOf(rec, s.key);
      if (v != null) { sc.push(v); if (v < wv) { wv = v; weak = s.key; } }
    });
    var avg = sc.length ? sc.reduce(function (a, b) { return a + b; }, 0) / sc.length : null;
    var done = CORE.every(function (k) { return scoreOf(rec, k) != null; });
    return { avg: avg, weak: weak, status: rec.archived ? 'archived' : done ? 'done' : sc.length ? 'active' : 'new' };
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function fmt(n) { return n == null ? '-' : (Math.round(n * 10) / 10).toFixed(1); }
  function ago(ts) {
    var d = Date.now() - (ts || 0), m = Math.floor(d / 60000);
    if (m < 1) return '방금'; if (m < 60) return m + '분 전';
    var h = Math.floor(m / 60); if (h < 24) return h + '시간 전';
    var days = Math.floor(h / 24); if (days < 30) return days + '일 전';
    return new Date(ts).toLocaleDateString('ko-KR');
  }
  function cells(n, cls) { var s = ''; for (var i = 0; i < 10; i++) s += '<i class="' + (i < n ? 'on ' + (cls || '') : '') + '"></i>'; return s; }

  /* 뼈대는 한 번만 만든다. 검색칸과 가져오기 칸이 다시 그려지며 입력을 잃지 않게 하기 위해서다 */
  $dash.innerHTML =
    '<div class="dhead"><div><p class="eyebrow">대시보드</p><h2>내가 판 문제들</h2><p class="lead" id="d-info"></p></div>' +
    '</div>' +
    '<div id="d-stats" class="stats"></div>' +
    '<div id="d-charts" class="cards"></div>' +
    '<div class="dbar">' +
    '<div class="field"><label for="d-q">찾기</label><input type="text" id="d-q" placeholder="제목이나 내용으로 찾기"></div>' +
    '<div class="field"><label for="d-status">상태</label><select id="d-status"><option value="all">전체 (보관 제외)</option><option value="active">진행 중</option><option value="done">핵심 완료</option><option value="new">시작 전</option><option value="archived">보관</option></select></div>' +
    '<div class="field"><label for="d-sort">정렬</label><select id="d-sort"><option value="recent">최근 수정순</option><option value="created">만든 순</option><option value="low">점수 낮은 순</option><option value="high">점수 높은 순</option></select></div>' +
    '</div>' +
    '<ul id="d-list" class="plist"></ul>' +
    '<section class="dmgmt"><h3>내 데이터</h3>' +
    '<div id="d-left"></div>' +
    '<div class="tools"><button class="btn" data-d="export" type="button">JSON으로 내보내기</button><button class="btn" data-d="import" type="button">아래 JSON 가져오기</button></div>' +
    '<div class="field"><label for="d-io">내보낸 JSON이 여기에 나와요. 가져오려면 JSON을 붙여넣으세요.</label><textarea id="d-io" spellcheck="false"></textarea></div>' +
    '<p class="note" id="d-msg" aria-live="polite"></p></section>';

  var $q = document.getElementById('d-q'), $st = document.getElementById('d-status'), $so = document.getElementById('d-sort');
  var $io = document.getElementById('d-io'), $msg = document.getElementById('d-msg');

  function bars(rows, max, cls) {
    return '<ul class="hbars">' + rows.map(function (r) {
      var n = r.v == null ? 0 : Math.round(Math.min(r.v, max) / max * 10);
      return '<li><span class="hl">' + esc(r.label) + '</span><span class="hb">' + cells(n, cls) + '</span><span class="hv">' + r.text + '</span></li>';
    }).join('') + '</ul>';
  }

  function update() {
    var all = store.list(), live = all.filter(function (r) { return !r.archived; });
    var ms = live.map(metrics);
    var avgs = ms.map(function (m) { return m.avg; }).filter(function (v) { return v != null; });
    var doneN = ms.filter(function (m) { return m.status === 'done'; }).length;
    var week = live.filter(function (r) { return Date.now() - (r.updatedAt || 0) < 7 * 864e5; }).length;
    var info = store.mode() === 'db' ? '저장 위치: 이 아티팩트 안의 내 비공개 저장소예요. 다른 사람은 볼 수 없어요.' : '저장 위치: 이 브라우저예요. 다른 기기에서는 보이지 않아요.';
    if (store.lastError) info += ' 마지막 저장이 실패했어요. 잠시 뒤 다시 시도해 주세요.';
    document.getElementById('d-info').textContent = info;

    document.getElementById('d-stats').innerHTML = [
      ['문제', live.length, '보관 ' + (all.length - live.length)],
      ['평균 점수', fmt(mean(avgs)), '10점 만점'],
      ['핵심 완료', doneN + ' / ' + live.length, '1~4층 모두 평가'],
      ['이번 주 수정', week, '최근 7일']
    ].map(function (s) { return '<div class="stat"><span class="sl">' + s[0] + '</span><span class="sv">' + esc(s[1]) + '</span><span class="ss">' + esc(s[2]) + '</span></div>'; }).join('');

    var stepRows = CHART.map(function (s) {
      var v = mean(live.map(function (r) { return scoreOf(r, s.key); }).filter(function (x) { return x != null; }));
      return { label: s.name, v: v, text: fmt(v) };
    });
    var weakCount = {}; ms.forEach(function (m) { if (m.weak) weakCount[m.weak] = (weakCount[m.weak] || 0) + 1; });
    var wmax = Math.max.apply(null, [1].concat(Object.keys(weakCount).map(function (k) { return weakCount[k]; })));
    var weakRows = CHART.map(function (s) { var n = weakCount[s.key] || 0; return { label: s.name, v: n, text: n + '개' }; });
    document.getElementById('d-charts').innerHTML =
      '<section class="card"><h3>층별 평균 점수</h3>' + bars(stepRows, 10) + '<p class="note">평가받은 층만 계산해요.</p></section>' +
      '<section class="card"><h3>가장 약했던 층</h3>' + bars(weakRows, wmax, 'warn') + '<p class="note">문제마다 점수가 가장 낮은 층을 세요. 많이 나온 층이 지금 내 약점이에요.</p></section>';

    var q = F.q.trim().toLowerCase();
    var rows = all.map(function (r) { return { r: r, m: metrics(r) }; }).filter(function (x) {
      if (F.status === 'all' ? x.r.archived : x.m.status !== F.status) return false;
      if (!q) return true;
      var p = x.r.problem || {};
      return (PL.titleOf(x.r) + ' ' + p.what + ' ' + p.who + ' ' + p.when + ' ' + (x.r.hyp && x.r.hyp.claim || '')).toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) {
      if (F.sort === 'created') return (b.r.createdAt || 0) - (a.r.createdAt || 0);
      if (F.sort === 'low') return (a.m.avg == null ? 99 : a.m.avg) - (b.m.avg == null ? 99 : b.m.avg);
      if (F.sort === 'high') return (b.m.avg == null ? -1 : b.m.avg) - (a.m.avg == null ? -1 : a.m.avg);
      return (b.r.updatedAt || 0) - (a.r.updatedAt || 0);
    });
    var cur = PL.S.id;
    document.getElementById('d-list').innerHTML = rows.length ? rows.map(function (x) {
      var r = x.r, m = x.m, id = esc(r.id);
      var gauge = STEPS.map(function (s) {
        var v = scoreOf(r, s.key), c = v == null ? '' : v >= 7 ? 'g' : v >= 4 ? 'w' : 'b';
        return '<i class="' + c + '" title="' + esc(s.name) + (v == null ? '' : ' ' + v + '점') + '"></i>';
      }).join('');
      return '<li class="pitem' + (r.id === cur ? ' cur' : '') + '"><div class="pmain">' +
        '<button class="ptitle" data-d="open" data-id="' + id + '" type="button">' + esc(PL.titleOf(r)) + '</button>' +
        '<div class="pmeta"><span class="pill ' + (m.status === 'done' ? 'good' : m.status === 'active' ? 'warn' : '') + '">' + STATUS[m.status] + '</span>' +
        '<span>평균 ' + fmt(m.avg) + '</span>' + (m.weak ? '<span>약한 층 ' + esc(STEPS.filter(function (s) { return s.key === m.weak; })[0].name) + '</span>' : '') +
        '<span>' + ago(r.updatedAt) + ' 수정</span>' + (r.id === cur ? '<span>작업 중</span>' : '') + '</div></div>' +
        '<div class="pgauge" aria-label="층별 점수">' + gauge + '</div>' +
        '<div class="pact"><button class="btn small" data-d="open" data-id="' + id + '" type="button">열기</button>' +
        '<button class="btn small" data-d="dup" data-id="' + id + '" type="button">복제</button>' +
        '<button class="btn small" data-d="arch" data-id="' + id + '" type="button">' + (r.archived ? '복원' : '보관') + '</button>' +
        '<button class="btn small del" data-d="del" data-id="' + id + '" type="button">' + (armedId === r.id ? '정말 삭제?' : '삭제') + '</button></div></li>';
    }).join('') : '<li class="pempty">' + (all.length ? '조건에 맞는 문제가 없어요.' : '아직 저장된 문제가 없어요. “새 문제 시작”으로 첫 층을 파 보세요. 쓰는 대로 자동 저장돼요.') + '</li>';

    var left = store.leftovers();
    document.getElementById('d-left').innerHTML = left.length ? '<p class="tip">이 브라우저에 저장돼 있던 문제가 ' + left.length + '개 있어요. 지금 저장소로 옮길 수 있어요. <button class="btn small" data-d="left" type="button">옮기기</button></p>' : '';
  }

  function say(t) { $msg.textContent = t; }

  $dash.addEventListener('input', function (e) {
    if (e.target === $q) { F.q = $q.value; update(); }
    else if (e.target === $st) { F.status = $st.value; update(); }
    else if (e.target === $so) { F.sort = $so.value; update(); }
  });
  $dash.addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]');
    if (!b) return;
    var a = b.getAttribute('data-d'), id = b.getAttribute('data-id');
    if (a === 'new') return PL.newProblem();
    if (a === 'open') return PL.openRecord(id);
    if (a === 'dup' || a === 'arch') {
      store.flushNow();
      var rec = store.get(id); if (!rec) return;
      if (a === 'dup') {
        rec.id = PL.newId(); rec.title = PL.titleOf(rec) + ' (복사)'; rec.createdAt = rec.updatedAt = Date.now(); rec.archived = false;
      } else {
        rec.archived = !rec.archived;
        if (PL.S.id === id) PL.S.archived = rec.archived;
      }
      store.save(rec); update(); return;
    }
    if (a === 'del') {
      if (armedId !== id) {
        armedId = id; clearTimeout(armTimer); armTimer = setTimeout(function () { armedId = null; update(); }, 3500); update(); return;
      }
      armedId = null; clearTimeout(armTimer);
      if (PL.S.id === id) { PL.reset(); store.markOpened(); PL.render(); }
      store.remove(id); update(); return;
    }
    if (a === 'export') {
      store.flushNow();
      $io.value = store.exportJSON();
      $io.select();
      var n = store.list().length;
      try { navigator.clipboard.writeText($io.value).then(function () { say('문제 ' + n + '개를 복사했어요.'); }, function () { say('복사가 막혀 있어요. 위 칸의 내용을 직접 복사해 주세요.'); }); }
      catch (er) { say('복사가 막혀 있어요. 위 칸의 내용을 직접 복사해 주세요.'); }
      return;
    }
    if (a === 'import') {
      try {
        var recs = store.parseImport($io.value);
        if (!recs.length) return say('가져올 문제를 찾지 못했어요. 내보내기로 만든 JSON인지 확인해 주세요.');
        say('문제 ' + store.importRecords(recs) + '개를 가져왔어요. 같은 문제가 이미 있어도 새 문제로 추가돼요.');
        $io.value = ''; update();
      } catch (er) { say('JSON을 읽지 못했어요. 내용이 잘리지 않았는지 확인해 주세요.'); }
      return;
    }
    if (a === 'left') { say('문제 ' + store.importLeftovers() + '개를 옮겼어요.'); update(); }
  });

  store.onChange(function () { if (!$dash.hidden) update(); });
  PL.renderDash = update;
})();
