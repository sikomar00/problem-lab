/* 문제 저장소. Claude 아티팩트에서는 내 비공개 db에, 그 밖에서는 이 브라우저의 localStorage에 저장한다. 두 경우 모두 같은 함수로 쓴다 */
(function () {
  var PL = window.PL, LKEY = 'problem-lab-v2', OLD = 'problem-lab-v1';
  var items = {}, mode = 'local', col = null, listeners = [], chains = {}, timer = null;
  var last = { id: null, sig: null, key: null };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function readLocal() { try { var o = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (o && o.items) return o.items; } catch (e) {} return {}; }
  function writeLocal() { try { localStorage.setItem(LKEY, JSON.stringify({ items: items })); } catch (e) {} }
  function legacyRecord() {
    try {
      var s = JSON.parse(localStorage.getItem(OLD) || 'null');
      if (s && s.problem && PL.hasAny(s)) {
        var rec = Object.assign(PL.blank(), s);
        rec.id = PL.newId(); rec.updatedAt = Date.now();
        return rec;
      }
    } catch (e) {}
    return null;
  }
  function clearLocal() { try { localStorage.removeItem(LKEY); localStorage.removeItem(OLD); } catch (e) {} }

  /* 저장할 모양: 평가 중이거나 실패한 결과는 빼고 깨끗한 복사본을 만든다 */
  function snapshot(S) {
    var r = {};
    Object.keys(S.results || {}).forEach(function (k) { var v = S.results[k]; if (v && !v.loading && !v.error) r[k] = v; });
    return clone({ id: S.id, title: S.title || '', createdAt: S.createdAt, updatedAt: S.updatedAt, archived: !!S.archived, step: S.step,
      problem: S.problem, whys: S.whys, tree: S.tree, hyp: S.hyp, hows: S.hows, scqa: S.scqa, results: r });
  }
  function contentSig(S) {
    var r = {};
    Object.keys(S.results || {}).forEach(function (k) { var v = S.results[k]; if (v && !v.loading && !v.error) r[k] = v; });
    return JSON.stringify([S.title, S.problem, S.whys, S.tree, S.hyp, S.hows, S.scqa, r, !!S.archived]);
  }

  /* backend: 로컬 모드면 null. db와 데스크톱 앱은 { set(rec), del(id) }를 채운다 */
  var backend = null;
  function queued(id, fn) {
    var p = (chains[id] || Promise.resolve()).then(fn)
      .then(function () { api.lastError = null; }, function (e) { api.lastError = e; emit(); });
    chains[id] = p;
    return p;
  }
  function save(rec) {
    items[rec.id] = rec;
    if (!backend) { writeLocal(); emit(); return Promise.resolve(); }
    var p = queued(rec.id, function () { return backend.set(rec); });
    if (mode === 'desktop') emit();
    return p;
  }
  function remove(id) {
    delete items[id];
    if (!backend) { writeLocal(); emit(); return Promise.resolve(); }
    var p = queued(id, function () { return backend.del(id); });
    emit();
    return p;
  }

  /* 화면에서 바뀔 때마다 부른다. 잠깐 모았다가 내용이 달라졌을 때만 한 번 저장한다 */
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 700); }
  function flush() {
    clearTimeout(timer); timer = null;
    var S = PL.S;
    if (!PL.hasAny(S)) return;
    var sig = contentSig(S), key = sig + '|' + S.step + '|' + S.id;
    if (key === last.key) return;
    if (S.id !== last.id || sig !== last.sig) S.updatedAt = Date.now();
    last = { id: S.id, sig: sig, key: key };
    save(snapshot(S));
  }
  /* 저장된 문제를 열었을 때: 안 바뀐 채로는 다시 저장하지 않도록 기준을 맞춘다 */
  function markOpened() {
    var S = PL.S, sig = contentSig(S);
    last = { id: S.id, sig: sig, key: sig + '|' + S.step + '|' + S.id };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.problem || typeof raw.problem !== 'object') return null;
    var rec = Object.assign(PL.blank(), clone(raw));
    rec.id = PL.newId();
    rec.createdAt = Number(raw.createdAt) || Date.now();
    rec.updatedAt = Date.now();
    return rec;
  }
  function parseImport(text) {
    var o = JSON.parse(text);
    var arr = Array.isArray(o) ? o : (o && o.items ? (Array.isArray(o.items) ? o.items : Object.keys(o.items).map(function (k) { return o.items[k]; })) : [o]);
    return arr.map(normalize).filter(Boolean);
  }
  function importRecords(recs) { recs.forEach(function (r) { save(r); }); return recs.length; }

  function leftovers() {
    if (mode !== 'db') return [];
    var out = [], local = readLocal();
    Object.keys(local).forEach(function (k) { if (!items[k]) out.push(local[k]); });
    var lg = legacyRecord(); if (lg) out.push(lg);
    return out;
  }
  function importLeftovers() { var l = leftovers(); l.forEach(save); clearLocal(); return l.length; }

  function fallbackLocal() {
    mode = 'local'; items = readLocal();
    var lg = legacyRecord();
    if (lg) { items[lg.id] = lg; writeLocal(); try { localStorage.removeItem(OLD); } catch (e) {} }
  }

  /* 윈도우 앱(pywebview)에서만 주소에 ?app=desktop이 붙는다. 파이썬 쪽 함수가 준비되길 기다린다 */
  var dp = null;
  PL.desktopApi = function () {
    if (dp) return dp;
    dp = new Promise(function (resolve) {
      if (!/[?&]app=desktop/.test(location.search)) return resolve(null);
      /* 파이썬 함수는 창이 다 뜬 뒤에 붙는다. 이벤트를 기다리면서 100ms마다 직접 확인하고, 15초가 지나면 포기한다 */
      var done = false, tries = 0;
      function ready() { return window.pywebview && window.pywebview.api && typeof window.pywebview.api.load_items === 'function'; }
      function finish() { if (done) return; done = true; resolve(ready() ? window.pywebview.api : null); }
      window.addEventListener('pywebviewready', function () { if (ready()) finish(); });
      var iv = setInterval(function () { tries++; if (ready() || tries > 150) { clearInterval(iv); finish(); } }, 100);
    });
    return dp;
  };

  var ready = (async function () {
    var desk = await PL.desktopApi();
    if (desk) {
      try {
        var all = JSON.parse(await desk.load_items());
        items = all.items || {};
        backend = { set: function (rec) { return desk.save_item(JSON.stringify(rec)); }, del: function (id) { return desk.delete_item(id); } };
        mode = 'desktop';
        return;
      } catch (e) { /* 파이썬 쪽이 응답하지 않으면 아래 로컬 저장으로 */ }
    }
    var db = null, uid = null;
    try {
      if (window.claude && window.claude.use) {
        db = await window.claude.use('db');
        var user = await window.claude.use('user');
        uid = user ? await user.id() : null;
      }
    } catch (e) {}
    if (!(db && uid)) { fallbackLocal(); return; }
    /* 내 비공개 영역: data/users/<내 id>/ 아래에 문제마다 문서 하나 */
    col = db.collection('data/users/' + uid);
    backend = { set: function (rec) { return col.doc(rec.id).set(rec); }, del: function (id) { return col.doc(id).delete(); } };
    mode = 'db';
    await new Promise(function (resolve) {
      var first = true;
      col.onSnapshot(function (snap) {
        var next = {};
        snap.docs.forEach(function (d) { if (d.exists) next[d.id] = clone(d.data()); });
        items = next;
        if (first) { first = false; resolve(); } else emit();
      }, function () {
        if (first) { first = false; backend = null; fallbackLocal(); resolve(); }
      });
    });
  })();

  var api = {
    ready: ready, lastError: null,
    mode: function () { return mode; },
    list: function () { return Object.keys(items).map(function (k) { return items[k]; }); },
    get: function (id) { return items[id] ? clone(items[id]) : null; },
    save: save, remove: remove, schedule: schedule, flushNow: flush, markOpened: markOpened,
    onChange: function (fn) { listeners.push(fn); },
    leftovers: leftovers, importLeftovers: importLeftovers,
    parseImport: parseImport, importRecords: importRecords,
    exportJSON: function () { return JSON.stringify({ app: 'problem-lab', version: 2, items: api.list() }, null, 2); }
  };
  PL.store = api;
})();
