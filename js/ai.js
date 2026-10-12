/* AI 연결과 모델 선택. 실행 환경에 따라 다르게 이어진다.
   - Claude 아티팩트: sample 기능을 쓰고, 모델은 속도·정교함 단계(빠름/균형/정교)로 고른다. Claude만 쓸 수 있다.
   - 윈도우 앱: 파이썬 쪽이 Claude(Anthropic) 또는 GPT(OpenAI) API를 부른다. 제공사와 모델을 고르고 API 키를 저장한다.
   - 그 밖: AI 평가는 쓸 수 없다 */
(function () {
  var PL = window.PL, ai = PL.ai;
  var TIERS = [{ value: 'quick', label: '빠름' }, { value: 'default', label: '균형' }, { value: 'complex', label: '정교' }];
  var CUSTOM = '__custom';
  var LKEY = 'problem-lab-model';
  var $ = function (id) { return document.getElementById(id); };
  var $bar = $('aibar'), $prov = $('ai-provider'), $sel = $('ai-model'), $custom = $('ai-custom'), $note = $('ai-note'), $refresh = $('ai-refresh');
  var $keyBtn = $('ai-key'), $panel = $('ai-panel'), $keyLabel = $('ai-keylabel'), $keyIn = $('ai-keyin'), $status = $('ai-status');
  var desk = null, st = null, fetched = {};

  function opt(v, label) { return '<option value="' + v + '">' + label + '</option>'; }
  function provInfo() { return st.providers.filter(function (p) { return p.id === st.provider; })[0]; }

  /* 모델이 JSON을 코드펜스나 설명과 함께 보내도 중괄호 부분만 꺼내 읽는다 */
  function parseJSON(text) {
    var t = String(text || '').replace(/```(?:json)?/gi, '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw { code: 'bad_format', message: 'JSON을 찾지 못했어요.' };
    return JSON.parse(t.slice(a, b + 1));
  }

  /* ---------- 윈도우 앱 ---------- */
  function renderModels() {
    var info = provInfo(), cur = st.models[st.provider];
    var ids = (fetched[st.provider] || []).concat(info.presets);
    if (ids.indexOf(cur) < 0) ids.push(cur);
    ids = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
    $sel.innerHTML = ids.map(function (v) { return opt(v, v); }).join('') + opt(CUSTOM, '직접 입력…');
    $sel.value = cur;
    $custom.hidden = true;
    ai.model = cur; ai.provider = st.provider;
  }
  function renderKey() {
    var has = st.has_key[st.provider], label = provInfo().label;
    $keyLabel.textContent = (st.provider === 'openai' ? 'OpenAI' : 'Anthropic') + ' API 키';
    $keyIn.placeholder = st.provider === 'openai' ? 'sk-...' : 'sk-ant-...';
    $status.textContent = has ? '키가 저장돼 있어요 (' + st.key_hint[st.provider] + '). 이 컴퓨터의 Windows 계정으로 암호화돼 저장되고, 화면으로는 다시 보내지 않아요.' : label + ' 키가 아직 없어요. 저장하면 이 제공사로 AI 평가를 쓸 수 있어요.';
    $note.textContent = has ? '' : label + ' API 키를 먼저 저장해 주세요.';
    $keyBtn.textContent = has ? 'API 키 변경' : 'API 키 설정';
    $refresh.hidden = !has;
  }
  function renderAll() { $prov.value = st.provider; renderModels(); renderKey(); }

  async function refreshModels(quiet) {
    var prov = st.provider;
    $refresh.disabled = true;
    try {
      var r = JSON.parse(await desk.list_models(prov));
      if (r.error) { if (!quiet) $note.textContent = r.error === 'auth_failed' ? '키가 올바르지 않아서 목록을 가져오지 못했어요.' : '모델 목록을 가져오지 못했어요. 기본 목록을 쓰고 있어요.'; }
      else { fetched[prov] = r.models; if (prov === st.provider) { renderModels(); $note.textContent = r.models.length + '개 모델을 불러왔어요.'; } }
    } catch (e) { if (!quiet) $note.textContent = '모델 목록을 가져오지 못했어요.'; }
    $refresh.disabled = false;
  }

  async function save(patch) { try { st = JSON.parse(await desk.save_settings(JSON.stringify(patch))); } catch (e) {} }

  async function initDesktop(api) {
    desk = api;
    st = JSON.parse(await api.get_settings());
    $prov.innerHTML = st.providers.map(function (p) { return opt(p.id, p.label); }).join('');
    $prov.hidden = false; $keyBtn.hidden = false;
    $bar.hidden = false;
    renderAll();
    ai.sample = {
      json: async function (prompt) {
        var res;
        try { res = JSON.parse(await api.complete(prompt, ai.provider, ai.model)); } catch (e) { throw { code: 'network', message: String(e) }; }
        if (res.error) throw { code: res.error, message: res.message || '' };
        return parseJSON(res.text);
      }
    };
    ai.kind = 'desktop'; ai.state = 'ok';
    if (!st.has_key[st.provider]) $panel.hidden = false; else refreshModels(true);
  }

  $prov.addEventListener('change', async function () {
    await save({ provider: $prov.value });
    renderAll();
    $panel.hidden = !!st.has_key[st.provider];
    if (st.has_key[st.provider]) refreshModels(true);
  });
  $sel.addEventListener('change', function () {
    if (ai.kind === 'desktop') {
      if ($sel.value === CUSTOM) { $custom.hidden = false; $custom.value = ''; $custom.focus(); return; }
      $custom.hidden = true; ai.model = $sel.value; save({ provider: st.provider, model: ai.model });
    } else { ai.model = $sel.value; try { localStorage.setItem(LKEY, ai.model); } catch (e) {} }
  });
  $custom.addEventListener('change', async function () {
    var v = $custom.value.trim();
    if (!/^[A-Za-z0-9._:\/-]{1,100}$/.test(v)) { $note.textContent = '모델 이름은 영문, 숫자, . _ : / - 만 쓸 수 있어요.'; return; }
    await save({ provider: st.provider, model: v });
    renderModels(); $note.textContent = v + '로 바꿨어요.';
  });
  $refresh.addEventListener('click', function () { refreshModels(false); });
  $keyBtn.addEventListener('click', function () { $panel.hidden = !$panel.hidden; if (!$panel.hidden) $keyIn.focus(); });
  $('ai-save').addEventListener('click', async function () {
    var k = $keyIn.value.trim();
    if (!k) { $status.textContent = '키를 입력해 주세요.'; return; }
    try {
      var r = JSON.parse(await desk.save_key(st.provider, k));
      if (r.error) { $status.textContent = r.message; return; }
      st = r.settings; $keyIn.value = ''; renderKey(); $panel.hidden = true; refreshModels(true);
    } catch (e) { $status.textContent = '키를 저장하지 못했어요.'; }
  });
  $('ai-clear').addEventListener('click', async function () {
    try { st = JSON.parse(await desk.clear_key(st.provider)); $keyIn.value = ''; delete fetched[st.provider]; renderModels(); renderKey(); } catch (e) { $status.textContent = '키를 지우지 못했어요.'; }
  });

  /* ---------- 아티팩트 ---------- */
  async function initArtifact() {
    var s = await window.claude.use('sample');
    if (!s) { ai.state = 'none'; return; }
    var saved = null; try { saved = localStorage.getItem(LKEY); } catch (e) {}
    $sel.innerHTML = TIERS.map(function (t) { return opt(t.value, t.label); }).join('');
    ai.model = TIERS.some(function (t) { return t.value === saved; }) ? saved : 'default';
    $sel.value = ai.model;
    $bar.hidden = false;
    $note.textContent = 'Claude로 평가해요. 단계가 높을수록 더 꼼꼼하고, 낮을수록 더 빨라요. GPT는 윈도우 앱에서만 쓸 수 있어요.';
    ai.sample = { json: function (prompt, opts) { return s.json(prompt, Object.assign({}, opts, { modelTier: ai.model })); } };
    ai.kind = 'artifact'; ai.state = 'ok';
  }

  /* 화면을 막지 않고 뒤에서 연결한다 */
  PL.initAI = function () {
    PL.desktopApi().then(function (api) {
      if (api) return initDesktop(api);
      if (window.claude && window.claude.use) return initArtifact();
      ai.state = 'none';
    }).catch(function () { ai.state = 'none'; });
  };
})();
