$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$root'; python backend\server.py`""
