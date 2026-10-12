"""문제 발굴소 윈도우 앱.

웹 화면(index.html 등)을 내 컴퓨터에서만 열리는 작은 서버로 띄우고, pywebview 창에 보여 준다.
화면에서 부르는 함수(Api)는 세 가지를 맡는다.
  - 문제 저장: %APPDATA%\ProblemLab\problems.json
  - 설정 저장: 모델 선택, API 키(Windows 계정으로 암호화)
  - AI 평가: Anthropic(Claude) 또는 OpenAI(GPT) API 호출. 키는 화면으로 돌려보내지 않는다.
"""
import base64
import ctypes
import functools
import http.server
import json
import os
import re
import sys
import threading
import urllib.error
import urllib.request
from ctypes import wintypes

import webview

APP_NAME = "문제 발굴소"
DATA_DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "ProblemLab")
ITEMS_FILE = os.path.join(DATA_DIR, "problems.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
PROVIDERS = {
    "anthropic": {
        "label": "Claude",
        "default": "claude-sonnet-5-5",
        "presets": ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"],
        "url": "https://api.anthropic.com/v1/messages",
        "models_url": "https://api.anthropic.com/v1/models?limit=100",
    },
    "openai": {
        "label": "GPT",
        "default": "gpt-5",
        "presets": ["gpt-5", "gpt-5-mini"],
        "url": "https://api.openai.com/v1/chat/completions",
        "models_url": "https://api.openai.com/v1/models",
    },
}
DEFAULT_PROVIDER = "anthropic"
MODEL_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,100}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
lock = threading.Lock()


def web_dir():
    """패키징했을 때는 번들 안의 web 폴더, 개발할 때는 저장소 루트."""
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "web")
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


# ---------- 파일 읽고 쓰기 ----------
def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)  # 쓰다가 꺼져도 파일이 깨지지 않게 통째로 바꾼다


# ---------- Windows DPAPI: 현재 Windows 계정으로만 풀 수 있게 암호화 ----------
class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(data):
    buf = ctypes.create_string_buffer(data, len(data))
    return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf


def protect(text):
    blob_in, _keep = _blob(text.encode("utf-8"))
    blob_out = _Blob()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise OSError("CryptProtectData failed")
    try:
        return base64.b64encode(ctypes.string_at(blob_out.pbData, blob_out.cbData)).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def unprotect(b64):
    raw = base64.b64decode(b64)
    blob_in, _keep = _blob(raw)
    blob_out = _Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def load_settings():
    """예전 형식(model, key_enc: Claude 하나만)을 새 형식으로 바꿔서 읽는다."""
    st = read_json(SETTINGS_FILE, {})
    st.setdefault("keys", {})
    st.setdefault("models", {})
    if "key_enc" in st:
        st["keys"].setdefault("anthropic", st.pop("key_enc"))
    if "model" in st:
        st["models"].setdefault("anthropic", st.pop("model"))
    return st


def get_key(provider):
    enc = load_settings()["keys"].get(provider)
    if not enc:
        return None
    try:
        return unprotect(enc)
    except OSError:
        return None


def public_settings():
    st = load_settings()
    provider = st.get("provider") if st.get("provider") in PROVIDERS else DEFAULT_PROVIDER
    keys = {p: get_key(p) for p in PROVIDERS}
    models = {}
    for p, info in PROVIDERS.items():
        m = st["models"].get(p)
        models[p] = m if isinstance(m, str) and MODEL_RE.match(m) else info["default"]
    return {
        "provider": provider,
        "models": models,
        "has_key": {p: bool(k) for p, k in keys.items()},
        "key_hint": {p: ("\u2026" + k[-4:]) if k else "" for p, k in keys.items()},
        "providers": [{"id": p, "label": i["label"], "presets": i["presets"], "default": i["default"]} for p, i in PROVIDERS.items()],
    }


def http_json(url, headers, body=None, timeout=180):
    """JSON을 보내고(body가 없으면 GET) 받는다. 실패하면 {__error, message} 모양의 dict를 돌려준다."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e).get("error", {})
            msg = err.get("message", "") if isinstance(err, dict) else str(err)
        except (ValueError, OSError):
            msg = ""
        code = {401: "auth_failed", 403: "auth_failed", 429: "rate_limited"}.get(e.code, "bad_request" if e.code in (400, 404) else "api")
        return {"__error": code, "message": msg[:300]}
    except (urllib.error.URLError, OSError):
        return {"__error": "network", "message": ""}


# ---------- 화면에서 부르는 함수 ----------
class Api:
    def load_items(self):
        return json.dumps({"items": read_json(ITEMS_FILE, {}).get("items", {})}, ensure_ascii=False)

    def save_item(self, rec_json):
        rec = json.loads(rec_json)
        if not isinstance(rec, dict) or not ID_RE.match(str(rec.get("id", ""))):
            raise ValueError("bad id")
        with lock:
            data = read_json(ITEMS_FILE, {"items": {}})
            data.setdefault("items", {})[rec["id"]] = rec
            write_json(ITEMS_FILE, data)
        return True

    def delete_item(self, rec_id):
        if not ID_RE.match(str(rec_id)):
            raise ValueError("bad id")
        with lock:
            data = read_json(ITEMS_FILE, {"items": {}})
            data.setdefault("items", {}).pop(rec_id, None)
            write_json(ITEMS_FILE, data)
        return True

    def get_settings(self):
        return json.dumps(public_settings())

    def save_settings(self, patch_json):
        """{provider, model}: 제공사를 바꾸고, model이 있으면 그 제공사의 모델로 기억한다."""
        patch = json.loads(patch_json)
        with lock:
            st = load_settings()
            provider = patch.get("provider")
            if provider in PROVIDERS:
                st["provider"] = provider
            else:
                provider = st.get("provider") if st.get("provider") in PROVIDERS else DEFAULT_PROVIDER
            model = patch.get("model")
            if isinstance(model, str) and MODEL_RE.match(model):
                st["models"][provider] = model
            write_json(SETTINGS_FILE, st)
        return json.dumps(public_settings())

    def save_key(self, provider, key):
        key = str(key).strip()
        if provider not in PROVIDERS:
            return json.dumps({"error": "bad_key", "message": "알 수 없는 제공사예요."})
        if not key or re.search(r"\s", key) or len(key) > 300:
            return json.dumps({"error": "bad_key", "message": "키 형식이 올바르지 않아요. 공백 없이 한 줄로 붙여넣어 주세요."})
        with lock:
            st = load_settings()
            st["keys"][provider] = protect(key)
            write_json(SETTINGS_FILE, st)
        return json.dumps({"settings": public_settings()})

    def clear_key(self, provider):
        with lock:
            st = load_settings()
            st["keys"].pop(provider, None)
            write_json(SETTINGS_FILE, st)
        return json.dumps(public_settings())

    def list_models(self, provider):
        """내 키로 쓸 수 있는 모델 이름 목록. 실패하면 {error}."""
        if provider not in PROVIDERS:
            return json.dumps({"error": "bad_request"})
        key = get_key(provider)
        if not key:
            return json.dumps({"error": "no_key"})
        if provider == "anthropic":
            headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        else:
            headers = {"Authorization": "Bearer " + key}
        res = http_json(PROVIDERS[provider]["models_url"], headers, timeout=30)
        if "__error" in res:
            return json.dumps({"error": res["__error"], "message": res["message"]})
        ids = [m.get("id", "") for m in res.get("data", []) if isinstance(m, dict)]
        if provider == "anthropic":
            ids = [i for i in ids if i.startswith("claude")]
        else:
            skip = ("audio", "realtime", "transcribe", "tts", "image", "embedding", "moderation", "search", "instruct", "whisper", "dall", "codex", "computer-use", "diarize")
            ids = [i for i in ids if i.startswith(("gpt-", "o1", "o3", "o4", "chatgpt")) and not any(x in i for x in skip)]
        return json.dumps({"models": sorted(i for i in set(ids) if MODEL_RE.match(i))})

    def complete(self, prompt, provider, model):
        """프롬프트 하나를 보내고 답 글자를 돌려준다. 실패하면 {error, message}."""
        if provider not in PROVIDERS:
            provider = DEFAULT_PROVIDER
        info = PROVIDERS[provider]
        key = get_key(provider)
        if not key:
            return json.dumps({"error": "no_key"})
        if not (isinstance(model, str) and MODEL_RE.match(model)):
            model = info["default"]
        messages = [{"role": "user", "content": str(prompt)}]
        text = ""
        if provider == "anthropic":
            headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
            res = http_json(info["url"], headers, {"model": model, "max_tokens": 2000, "messages": messages})
            if "__error" not in res:
                text = "".join(b.get("text", "") for b in res.get("content", []) if b.get("type") == "text")
        else:
            headers = {"Authorization": "Bearer " + key, "content-type": "application/json"}
            res = http_json(info["url"], headers, {"model": model, "messages": messages})
            if "__error" not in res:
                content = ((res.get("choices") or [{}])[0].get("message") or {}).get("content")
                text = content if isinstance(content, str) else ""
        if "__error" in res:
            return json.dumps({"error": res["__error"], "message": res["message"]}, ensure_ascii=False)
        return json.dumps({"text": text}, ensure_ascii=False)


# ---------- 내 컴퓨터에서만 열리는 정적 파일 서버 ----------
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve():
    handler = functools.partial(Quiet, directory=web_dir())
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def main():
    port = serve()
    webview.create_window(APP_NAME, "http://127.0.0.1:%d/index.html?app=desktop" % port,
                          js_api=Api(), width=1180, height=860, min_size=(420, 560))
    webview.start()


if __name__ == "__main__":
    main()
