# 문제 발굴소 윈도우 앱

웹 화면(`../index.html` 등)을 윈도우 창에 담은 앱이에요. Python + [pywebview](https://pywebview.flowrl.com/)로 만들고 PyInstaller로 exe 한 개로 묶어요. 윈도우 10/11의 WebView2가 필요해요(윈도우 11에는 기본으로 들어 있어요).

## exe 만들기

이 폴더에서 PowerShell로 실행해요. Python 3.9 이상이 필요해요.

```powershell
.\build.ps1
```

가상환경 만들기, 패키지 설치, 아이콘 만들기, 패키징까지 한 번에 하고 `dist\ProblemLab.exe`가 생겨요(약 13MB). 처음 실행할 때 압축을 푸느라 몇 초 걸려요. 서명하지 않은 파일이라 윈도우 SmartScreen이 경고할 수 있어요. 그때는 "추가 정보 → 실행"을 눌러요.

개발 중에는 빌드 없이 소스로 바로 띄울 수 있어요.

```powershell
.\.venv\Scripts\python.exe app.py
```

## AI 평가 설정

Claude(Anthropic)와 GPT(OpenAI) 중에 고를 수 있어요.

1. 헤더의 "AI"에서 제공사(Claude / GPT)를 골라요.
2. "API 키 설정"을 눌러 그 제공사의 키를 붙여넣고 저장해요. 제공사마다 키를 따로 저장해요.
3. "모델"에서 모델을 골라요. 키를 저장하면 내 계정에서 쓸 수 있는 모델 목록을 자동으로 불러오고, "목록 새로고침"으로 다시 불러올 수 있어요. 목록에 없는 모델은 "직접 입력…"으로 이름을 넣으면 돼요.
4. 고른 제공사와 모델은 기억해요. API 사용료는 본인의 Anthropic·OpenAI 계정에 청구돼요.

기본 목록은 Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5 / Fable 5.1, GPT는 gpt-5 / gpt-5-mini예요. GPT 모델 이름은 자주 바뀌니, 키를 저장한 뒤 불러온 목록에서 고르는 것을 권해요.

키는 Windows 계정으로 암호화(DPAPI)해서 `%APPDATA%\ProblemLab\settings.json`에 저장해요. 같은 계정의 같은 컴퓨터에서만 풀 수 있고, 화면(웹 코드)으로는 다시 보내지 않아요. AI 평가 요청은 앱 안의 파이썬이 `api.anthropic.com` 또는 `api.openai.com`으로만 보내요.

## 데이터 위치

| 파일 | 내용 |
|---|---|
| `%APPDATA%\ProblemLab\problems.json` | 저장한 문제들 |
| `%APPDATA%\ProblemLab\settings.json` | 선택한 제공사·모델, 암호화된 API 키 |

앱을 지워도 이 폴더는 남아요. 완전히 지우려면 폴더를 직접 삭제하세요.

## 구성

- `app.py`: 창 만들기, 화면 파일을 내 컴퓨터(127.0.0.1)에서만 서빙, 저장·설정·AI 호출 함수
- `make_icon.py`: `index.html`의 픽셀 보석 로고로 `icon.ico` 생성
- `build.ps1`: 빌드 스크립트
- `requirements.txt`: 빌드에 필요한 패키지

웹 화면은 주소에 `?app=desktop`이 붙어 있을 때만 이 앱의 저장·AI 함수를 써요(`js/store.js`, `js/ai.js`).
