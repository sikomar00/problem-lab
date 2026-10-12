# 윈도우 실행 파일(dist\ProblemLab.exe)을 만든다. 이 폴더(desktop)에서 실행:  .\build.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) { python -m venv .venv }
$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
& $py -m pip install -q -r requirements.txt
& $py make_icon.py
& $py -m PyInstaller --noconfirm --onefile --windowed --name ProblemLab --icon icon.ico `
  --add-data '..\index.html;web' --add-data '..\styles.css;web' `
  --add-data '..\js;web\js' --add-data '..\fonts;web\fonts' app.py
Write-Host "`n만들었어요: $PSScriptRoot\dist\ProblemLab.exe"
