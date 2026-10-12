import ctypes, datetime as dt, json, os, shutil, socket, subprocess, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_NAME = "WinHood"
VERSION = "v5.0"
BASE_DIR = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "WindowsOptimizer"
LOG_DIR = BASE_DIR / "logs"
BACKUP_DIR = BASE_DIR / "backups"
CLEANUP_SCRIPT = Path(__file__).with_name("cleanup_script.bat")

for d in (BASE_DIR, LOG_DIR, BACKUP_DIR):
    d.mkdir(parents=True, exist_ok=True)

CATEGORY_PACKAGES = {
    "Navegadores e comunicação": [
        ("Google.Chrome", "Chrome"), ("Mozilla.Firefox", "Firefox"),
        ("Microsoft.Edge", "Edge"), ("Brave.Brave", "Brave"),
        ("Opera.Opera", "Opera"), ("Vivaldi.Vivaldi", "Vivaldi"),
        ("Discord.Discord", "Discord"), ("Telegram.TelegramDesktop", "Telegram"),
        ("Zoom.Zoom", "Zoom"), ("Microsoft.Teams", "Teams"),
        ("Mozilla.Thunderbird", "Thunderbird"), ("SlackTechnologies.Slack", "Slack")
    ],
    "Utilitários de suporte": [
        ("7zip.7zip", "7-Zip"), ("RARLab.WinRAR", "WinRAR"),
        ("Giorgiotani.Peazip", "PeaZip"), ("Microsoft.PowerToys", "PowerToys"),
        ("voidtools.Everything", "Everything"), ("ShareX.ShareX", "ShareX"),
        ("WinDirStat.WinDirStat", "WinDirStat"), ("AntibodySoftware.WizTree", "WizTree"),
        ("AnyDeskSoftwareGmbH.AnyDesk", "AnyDesk"), ("TeamViewer.TeamViewer", "TeamViewer"),
        ("CodeSector.TeraCopy", "TeraCopy"), ("RevoUninstaller.RevoUninstaller", "Revo Uninstaller")
    ],
    "Desenvolvimento e runtimes": [
        ("Microsoft.VisualStudioCode", "Visual Studio Code"), ("Notepad++.Notepad++", "Notepad++"),
        ("Git.Git", "Git"), ("Python.Python.3.12", "Python 3 (x64)"),
        ("OpenJS.NodeJS.LTS", "Node.js LTS"), ("TimKosse.FileZilla.Client", "FileZilla"),
        ("PuTTY.PuTTY", "PuTTY"), ("WinSCP.WinSCP", "WinSCP"),
        ("WinMerge.WinMerge", "WinMerge"), ("Microsoft.DotNet.DesktopRuntime.8", ".NET Desktop Runtime 8"),
        ("Microsoft.DotNet.DesktopRuntime.9", ".NET Desktop Runtime 9"),
        ("Microsoft.DotNet.AspNetCore.8", "ASP.NET Core Runtime 8"),
        ("EclipseAdoptium.Temurin.21.JRE", "Java Runtime Temurin 21"),
        ("EclipseAdoptium.Temurin.21.JDK", "JDK Temurin 21")
    ]
}


def is_admin():
    if os.name != "nt":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def log_event(action, status, started, code=None, message="", output=""):
    now = dt.datetime.now()
    rec = {
        "timestamp": now.isoformat(timespec="seconds"),
        "action": action,
        "status": status,
        "duration_seconds": round(time.perf_counter() - started, 2),
        "exit_code": code,
        "message": message
    }
    if output:
        rec["output_tail"] = output[-4000:]
    with (LOG_DIR / f"api_{now:%Y-%m-%d}.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def run_process(args, action, admin=False, timeout=3600):
    started = time.perf_counter()
    if admin and not is_admin():
        return {
            "success": False, "action": action, "exit_code": None,
            "message": "Esta operação exige privilégios de administrador.", "output": ""
        }
    try:
        p = subprocess.run(
            args, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
        out = ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        ok = p.returncode == 0
        msg = "Operação concluída." if ok else f"Operação retornou código {p.returncode}."
        rec = log_event(action, "success" if ok else "error", started, p.returncode, msg, out)
        return {
            "success": ok, "action": action, "exit_code": p.returncode,
            "message": msg, "output": out, "log": rec
        }
    except subprocess.TimeoutExpired:
        msg = f"Tempo limite excedido após {timeout} segundos."
        rec = log_event(action, "timeout", started, None, msg)
        return {"success": False, "action": action, "exit_code": None, "message": msg, "output": "", "log": rec}
    except Exception as e:
        rec = log_event(action, "error", started, None, str(e))
        return {"success": False, "action": action, "exit_code": None, "message": str(e), "output": "", "log": rec}


def ps(script_text, action, admin=False, timeout=3600):
    return run_process(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script_text],
        action, admin, timeout
    )


def open_target(target, action):
    started = time.perf_counter()
    try:
        if os.name == "nt":
            os.startfile(target)
        else:
            subprocess.Popen(["xdg-open", target])
        msg = f"{target} aberto."
        rec = log_event(action, "success", started, 0, msg)
        return {"success": True, "action": action, "exit_code": 0, "message": msg, "output": "", "log": rec}
    except Exception as e:
        rec = log_event(action, "error", started, None, str(e))
        return {"success": False, "action": action, "exit_code": None, "message": str(e), "output": "", "log": rec}


def clean_quick():
    if not is_admin():
        return {"success": False, "action": "Limpeza rápida", "message": "Execute o backend como Administrador.", "output": ""}
    started = time.perf_counter()
    try:
        p = subprocess.run(
            ["cmd", "/c", str(CLEANUP_SCRIPT)], capture_output=True, text=True,
            encoding="cp850", errors="replace", timeout=1800,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
        out = ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        ok = p.returncode == 0
        msg = "Limpeza rápida concluída." if ok else f"Limpeza finalizada com código {p.returncode}."
        rec = log_event("Limpeza rápida", "success" if ok else "error", started, p.returncode, msg, out)
        return {"success": ok, "action": "Limpeza rápida", "exit_code": p.returncode, "message": msg, "output": out, "log": rec}
    except Exception as e:
        return {"success": False, "action": "Limpeza rápida", "message": str(e), "output": ""}


def create_restore():
    return ps("Checkpoint-Computer -Description 'WinHood' -RestorePointType MODIFY_SETTINGS", "Criar ponto de restauração", True, 300)


def sfc():
    return run_process(["sfc", "/scannow"], "Verificar arquivos com SFC", True, 3600)


def dism():
    return run_process(["DISM", "/Online", "/Cleanup-Image", "/RestoreHealth"], "Reparar imagem com DISM", True, 3600)


def repair_all():
    a = dism()
    if not a["success"]:
        return {"success": False, "action": "Verificação do sistema", "message": "DISM não foi concluído; SFC não foi iniciado.", "output": a.get("output", "")}
    b = sfc()
    return {
        "success": b["success"], "action": "Verificação do sistema",
        "message": "DISM e SFC concluídos." if b["success"] else "DISM concluído, mas SFC retornou erro.",
        "output": (a.get("output", "") + "\n" + b.get("output", ""))[-8000:]
    }


def winget_available():
    return shutil.which("winget") is not None


def winget_install(pid, name):
    if not winget_available():
        return {"success": False, "action": f"Instalar {name}", "message": "Winget não foi encontrado no PATH.", "output": ""}
    return run_process(
        ["winget", "install", "--id", pid, "--exact", "--silent", "--accept-source-agreements", "--accept-package-agreements"],
        f"Instalar {name}", True, 1800
    )


def winget_upgrade():
    if not winget_available():
        return {"success": False, "action": "Atualizar todos os programas", "message": "Winget não foi encontrado no PATH.", "output": ""}
    return run_process(
        ["winget", "upgrade", "--all", "--silent", "--accept-source-agreements", "--accept-package-agreements"],
        "Atualizar todos os programas", True, 3600
    )


def performance():
    if not is_admin():
        return {"success": False, "action": "Combo de desempenho", "message": "Execute o backend como Administrador.", "output": ""}
    cmds = [
        ["schtasks", "/Change", "/TN", r"\Microsoft\Windows\TaskScheduler\Maintenance Configurator", "/Disable"],
        ["schtasks", "/Change", "/TN", r"\Microsoft\Windows\TaskScheduler\Regular Maintenance", "/Disable"],
        ["powercfg", "/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"],
        ["net", "stop", "SysMain", "/y"], ["sc", "config", "SysMain", "start=", "disabled"],
        ["reg", "add", r"HKCU\Control Panel\Desktop", "/v", "FontSmoothing", "/t", "REG_SZ", "/d", "2", "/f"],
        ["reg", "add", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced", "/v", "IconsOnly", "/t", "REG_DWORD", "/d", "0", "/f"],
        ["defrag", "C:", "/O"]
    ]
    outs = []
    for c in cmds:
        r = run_process(c, "Combo de desempenho", True, 900)
        outs.append(r.get("output", ""))
        if not r["success"] and c not in (cmds[3], cmds[4]):
            return {"success": False, "action": "Combo de desempenho", "message": "Uma das etapas falhou.", "output": "\n".join(outs)[-8000:]}
    return {"success": True, "action": "Combo de desempenho", "message": "Combo de desempenho concluído.", "output": "\n".join(outs)[-8000:]}


def bloatware():
    return ps(r"""Get-AppxPackage *candycrush*,*king.com*,*MicrosoftSolitaire*,*Xbox*,*BingNews*,*BingWeather*,*GetHelp*,*Getstarted*,*Messaging*,*WindowsFeedbackHub*,*YourPhone*,*People* | Remove-AppxPackage -ErrorAction SilentlyContinue""", "Remover bloatware", True, 1800)


def bios():
    r = ps(r"""
$bb=Get-CimInstance Win32_BaseBoard;$b=Get-CimInstance Win32_BIOS
[pscustomobject]@{manufacturer=$bb.Manufacturer;model=$bb.Product;bios=$b.SMBIOSBIOSVersion;release=$b.ReleaseDate}|ConvertTo-Json -Compress
""", "Verificar BIOS", False, 120)
    if r["success"]:
        try:
            r["data"] = json.loads(r["output"].splitlines()[-1])
            d = r["data"]
            r["message"] = f"BIOS {d.get('bios', 'desconhecida')} — {d.get('manufacturer', '')} {d.get('model', '')}".strip()
        except Exception:
            pass
    return r


def system_info():
    r = ps(r"""
$o=Get-CimInstance Win32_OperatingSystem;$c=Get-CimInstance Win32_Processor|Select -First 1;$cs=Get-CimInstance Win32_ComputerSystem;$g=Get-CimInstance Win32_VideoController|Select -First 1;$b=Get-CimInstance Win32_BIOS
[pscustomobject]@{computer=$env:COMPUTERNAME;user=$env:USERNAME;os=$o.Caption;version=$o.Version;build=$o.BuildNumber;architecture=$o.OSArchitecture;cpu=$c.Name;cores=$c.NumberOfCores;threads=$c.NumberOfLogicalProcessors;ram_gb=[math]::Round($cs.TotalPhysicalMemory/1GB,2);gpu=$g.Name;gpu_driver=$g.DriverVersion;manufacturer=$cs.Manufacturer;model=$cs.Model;bios=$b.SMBIOSBIOSVersion}|ConvertTo-Json -Compress
""", "Informações do sistema", False, 120)
    if r["success"]:
        try:
            r["data"] = json.loads(r["output"].splitlines()[-1])
        except Exception:
            pass
    return r


def hardware():
    r = ps(r"""
[pscustomobject]@{cpu=@(Get-CimInstance Win32_Processor|Select Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed);memory=@(Get-CimInstance Win32_PhysicalMemory|Select Manufacturer,Capacity,Speed,PartNumber);disks=@(Get-CimInstance Win32_DiskDrive|Select Model,InterfaceType,MediaType,Size);video=@(Get-CimInstance Win32_VideoController|Select Name,DriverVersion,AdapterRAM)}|ConvertTo-Json -Depth 5 -Compress
""", "Informações de hardware", False, 180)
    if r.get("success"):
        try:
            r["data"] = json.loads(r["output"].splitlines()[-1])
            r["message"] = "Inventário de hardware obtido."
        except Exception:
            pass
    return r


def connectivity():
    out = []
    ok = True
    for host in ("127.0.0.1", "1.1.1.1"):
        r = run_process(["ping", "-n", "2", host], f"Testar conectividade ({host})", False, 30)
        ok = ok and r["success"]
        out.append(f"{host}: {r['message']}\n{r.get('output', '')}")
    try:
        socket.gethostbyname("www.microsoft.com")
        out.append("DNS: resolução de www.microsoft.com OK")
    except Exception as e:
        ok = False
        out.append(f"DNS: falhou — {e}")
    return {"success": ok, "action": "Testar conectividade", "message": "Diagnóstico concluído.", "output": "\n".join(out)[-8000:]}


def network_reset():
    outs = []
    ok = True
    for c in (["ipconfig", "/flushdns"], ["ipconfig", "/release"], ["ipconfig", "/renew"], ["netsh", "winsock", "reset"], ["netsh", "int", "ip", "reset"]):
        r = run_process(c, "Redefinir rede", True, 180)
        ok = ok and r["success"]
        outs.append(r.get("output", ""))
    return {"success": ok, "action": "Redefinir rede", "message": "Reset de rede concluído. Reinicie o Windows se solicitado." if ok else "Uma ou mais etapas falharam.", "output": "\n".join(outs)[-8000:]}


def renew_ip():
    a = run_process(["ipconfig", "/release"], "Renovar endereço IP", True, 120)
    if not a["success"]:
        return a
    b = run_process(["ipconfig", "/renew"], "Renovar endereço IP", True, 180)
    b["output"] = a.get("output", "") + "\n" + b.get("output", "")
    return b


def technical_report():
    path = LOG_DIR / f"relatorio_{dt.datetime.now():%Y-%m-%d_%H%M%S}.txt"
    r = run_process(["systeminfo"], "Criar relatório técnico", False, 180)
    path.write_text(r.get("output", ""), encoding="utf-8")
    r["message"] = f"Relatório salvo em {path}"
    r["path"] = str(path)
    return r


def clean_old_logs():
    started = time.perf_counter()
    cut = time.time() - 30 * 86400
    n = 0
    for p in LOG_DIR.glob("*"):
        if p.is_file() and p.stat().st_mtime < cut:
            try:
                p.unlink()
                n += 1
            except OSError:
                pass
    msg = f"{n} log(s) antigo(s) removido(s)."
    rec = log_event("Limpar logs antigos", "success", started, 0, msg)
    return {"success": True, "action": "Limpar logs antigos", "exit_code": 0, "message": msg, "output": "", "log": rec}


def disks():
    r = ps(r"""
$d=@(Get-Disk|Select Number,FriendlyName,OperationalStatus,PartitionStyle,Size);$v=@(Get-Volume|Select DriveLetter,FileSystemLabel,FileSystem,HealthStatus,Size,SizeRemaining)
[pscustomobject]@{disks=$d;volumes=$v}|ConvertTo-Json -Depth 5 -Compress
""", "Listar discos e volumes", False, 180)
    if r["success"]:
        try:
            r["data"] = json.loads(r["output"].splitlines()[-1])
        except Exception:
            pass
    return r


def resource_usage():
    """Uso atual de CPU, RAM e disco C: para o painel ao vivo."""
    # Script isolado e robusto: números com ponto, JSON na última linha.
    script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$cpu = 0
$perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
if ($perf -and $null -ne $perf.PercentProcessorTime) {
  $cpu = [int]$perf.PercentProcessorTime
} else {
  $loads = @(Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage)
  if ($loads.Count -gt 0) {
    $avg = ($loads | Measure-Object -Average).Average
    if ($null -ne $avg) { $cpu = [int][math]::Round($avg) }
  }
}
$os = Get-CimInstance Win32_OperatingSystem
# TotalVisibleMemorySize / FreePhysicalMemory estão em KB
$totalGb = [math]::Round(($os.TotalVisibleMemorySize / 1024.0 / 1024.0), 1)
$freeGb = [math]::Round(($os.FreePhysicalMemory / 1024.0 / 1024.0), 1)
$usedGb = [math]::Round(($totalGb - $freeGb), 1)
if ($usedGb -lt 0) { $usedGb = 0 }
$ramPct = 0
if ($totalGb -gt 0) { $ramPct = [int][math]::Round(($usedGb / $totalGb) * 100) }
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$dTotal = 0.0; $dFree = 0.0
if ($disk -and $disk.Size) { $dTotal = [math]::Round(($disk.Size / 1GB), 1) }
if ($disk -and $disk.FreeSpace) { $dFree = [math]::Round(($disk.FreeSpace / 1GB), 1) }
$dUsed = [math]::Round(($dTotal - $dFree), 1)
if ($dUsed -lt 0) { $dUsed = 0 }
$dPct = 0
if ($dTotal -gt 0) { $dPct = [int][math]::Round(($dUsed / $dTotal) * 100) }
$obj = [ordered]@{
  success = $true
  cpu_percent = $cpu
  ram_used_gb = $usedGb
  ram_total_gb = $totalGb
  ram_percent = $ramPct
  disk_label = 'C:'
  disk_used_gb = $dUsed
  disk_free_gb = $dFree
  disk_total_gb = $dTotal
  disk_percent = $dPct
  message = 'Uso de recursos atualizado.'
}
$obj | ConvertTo-Json -Compress
"""
    r = ps(script, "Uso de recursos", False, 45)
    raw = (r.get("output") or "").strip()
    # Procura a última linha que pareça JSON
    for line in reversed(raw.splitlines() or [raw]):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                data["success"] = True
                data.setdefault("message", "Uso de recursos atualizado.")
                return data
            except Exception:
                continue
    return {
        "success": False,
        "message": r.get("message") or "Falha ao obter uso de recursos.",
        "output": raw[-2000:] if raw else "",
        "cpu_percent": 0,
        "ram_percent": 0,
        "disk_percent": 0,
        "ram_used_gb": 0,
        "ram_total_gb": 0,
        "disk_used_gb": 0,
        "disk_free_gb": 0,
        "disk_total_gb": 0,
        "disk_label": "C:",
    }


NOTES_FILE = BASE_DIR / "notes.txt"


def notes_read():
    try:
        text = NOTES_FILE.read_text(encoding="utf-8") if NOTES_FILE.exists() else ""
        return {
            "success": True,
            "text": text,
            "path": str(NOTES_FILE),
            "message": "Notas carregadas.",
        }
    except Exception as e:
        return {"success": False, "text": "", "path": str(NOTES_FILE), "message": str(e)}


def notes_write(text: str):
    try:
        NOTES_FILE.parent.mkdir(parents=True, exist_ok=True)
        NOTES_FILE.write_text(text if text is not None else "", encoding="utf-8")
        return {
            "success": True,
            "text": text if text is not None else "",
            "path": str(NOTES_FILE),
            "message": "Notas salvas.",
        }
    except Exception as e:
        return {"success": False, "text": text or "", "path": str(NOTES_FILE), "message": str(e)}


def diskpart_guide():
    commands = """list disk — lista discos
list volume — lista volumes
list partition — lista partições
select disk N — seleciona um disco
select volume N — seleciona um volume
detail disk — mostra detalhes do disco
detail volume — mostra detalhes do volume
rescan — procura discos novos
clean — REMOVE as partições do disco selecionado
format fs=ntfs quick — formata rapidamente
assign letter=X — atribui letra
extend — estende o volume
shrink desired=MB — reduz o volume
convert gpt — converte para GPT (disco deve estar vazio)
exit — sai do Diskpart"""
    return {"success": True, "action": "Guia de comandos Diskpart", "message": "Guia carregado. Comandos destrutivos exigem confirmação no próprio Diskpart.", "output": commands}


def diagnostico_completo():
    """Diagnóstico rápido: inventário + rede + discos + BIOS (sem SFC/DISM longos)."""
    parts = []
    ok = True
    data = {}

    sys = system_info()
    ok = ok and bool(sys.get("success"))
    parts.append("=== RESUMO DO SISTEMA ===\n" + (sys.get("output") or sys.get("message") or ""))
    if sys.get("data"):
        data["sistema"] = sys["data"]

    net = connectivity()
    ok = ok and bool(net.get("success"))
    parts.append("=== CONECTIVIDADE ===\n" + (net.get("output") or net.get("message") or ""))

    dsk = disks()
    ok = ok and bool(dsk.get("success"))
    parts.append("=== DISCOS E VOLUMES ===\n" + (dsk.get("output") or dsk.get("message") or ""))
    if dsk.get("data"):
        data["discos"] = dsk["data"]

    bio = bios()
    ok = ok and bool(bio.get("success"))
    parts.append("=== BIOS ===\n" + (bio.get("output") or bio.get("message") or ""))
    if bio.get("data"):
        data["bios"] = bio["data"]

    parts.append(
        f"=== STATUS ===\nAdministrador: {is_admin()}\nWinget: {winget_available()}\n"
        f"Backend: {APP_NAME} {VERSION}"
    )
    return {
        "success": ok,
        "action": "Diagnóstico completo",
        "message": "Diagnóstico concluído." if ok else "Diagnóstico concluído com alertas.",
        "output": "\n\n".join(parts)[-12000:],
        "data": data or None,
    }


def run_action(action):
    m = {
        "Limpeza rápida": clean_quick,
        "Limpeza avançada": lambda: run_process(["cleanmgr", "/verylowdisk"], "Limpeza avançada", True, 1800),
        "Limpeza do Windows Update": lambda: run_process(["DISM", "/Online", "/Cleanup-Image", "/StartComponentCleanup"], "Limpeza do Windows Update", True, 3600),
        "Criar ponto de restauração": create_restore, "Verificar arquivos com SFC": sfc,
        "Reparar imagem com DISM": dism, "Verificação do sistema": repair_all,
        "Diagnóstico completo": diagnostico_completo,
        "Atualizar todos os programas": winget_upgrade, "Atualização de programas": winget_upgrade,
        "Combo de desempenho": performance, "Otimização de desempenho": performance,
        "Otimização de SSD": lambda: run_process(["fsutil", "behavior", "set", "DisableDeleteNotify", "0"], "Otimização de SSD", True, 120),
        "Gerenciar inicialização": lambda: open_target("ms-settings:startupapps", "Gerenciar inicialização"),
        "Remover bloatware": bloatware,
        "Atualizar driver NVIDIA": lambda: winget_install("Nvidia.GeForceExperience", "Atualizar driver NVIDIA"),
        "Atualizar driver AMD": lambda: winget_install("AMD.AMDSoftwareAdrenalinEdition", "Atualizar driver AMD"),
        "Intel Driver Support Assistant": lambda: winget_install("Intel.IntelDriverSupportAssistant", "Intel Driver Support Assistant"),
        "Verificar BIOS": bios,
        "Abrir configurações de vídeo": lambda: open_target("ms-settings:display", "Abrir configurações de vídeo"),
        "Exibição avançada": lambda: open_target("ms-settings:display-advanced", "Exibição avançada"),
        "Detectar monitores": lambda: open_target("ms-settings:display", "Detectar monitores"),
        "Testar conectividade": connectivity,
        "Limpar cache DNS": lambda: run_process(["ipconfig", "/flushdns"], "Limpar cache DNS", True, 120),
        "Renovar endereço IP": renew_ip, "Redefinir rede": network_reset,
        "Resumo do sistema": system_info, "Informações de hardware": hardware,
        "Criar relatório técnico": technical_report,
        "Abrir MSInfo32": lambda: open_target("msinfo32.exe", "Abrir MSInfo32"),
        "Abrir pasta de backups": lambda: open_target(str(BACKUP_DIR), "Abrir pasta de backups"),
        "Consultar logs": lambda: open_target(str(LOG_DIR), "Consultar logs"),
        "Limpar logs antigos": clean_old_logs,
        "Abrir Gerenciamento de Disco": lambda: open_target("diskmgmt.msc", "Abrir Gerenciamento de Disco"),
        "Listar discos e volumes": disks, "Guia de comandos Diskpart": diskpart_guide,
        "Iniciar Diskpart": lambda: open_target("diskpart.exe", "Iniciar Diskpart")
    }
    return m.get(action, lambda: {"success": False, "action": action, "message": f"Ação não mapeada no backend: {action}", "output": ""})()


class Handler(BaseHTTPRequestHandler):
    # Aceita qualquer origem local (localhost / 127.0.0.1 em qualquer porta).
    # O proxy do Vite (same-origin) também funciona sem CORS.
    @staticmethod
    def _is_local_origin(origin: str) -> bool:
        if not origin:
            return False
        try:
            u = urllib.parse.urlparse(origin)
            host = (u.hostname or "").lower()
            return host in ("localhost", "127.0.0.1", "::1") and u.scheme in ("http", "https")
        except Exception:
            return False

    def _apply_cors(self):
        origin = self.headers.get("Origin", "")
        if self._is_local_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, X-Requested-With")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")

    def send_json(self, status, data):
        # Garante estrutura mínima e serializável.
        if not isinstance(data, dict):
            data = {"success": False, "message": str(data)}
        raw = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._apply_cors()
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        # Respostas HTTP 204 não devem ter corpo.
        if status != 204:
            self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._apply_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        try:
            if p.path == "/api/health":
                data = {
                    "ok": True,
                    "success": True,
                    "version": VERSION,
                    "admin": is_admin(),
                    "winget": winget_available(),
                    "message": "Backend operacional.",
                }
            elif p.path == "/api/system":
                data = system_info()
            elif p.path == "/api/hardware":
                data = hardware()
            elif p.path == "/api/bios":
                data = bios()
            elif p.path == "/api/disks":
                data = disks()
            elif p.path == "/api/resources":
                data = resource_usage()
            elif p.path == "/api/notes":
                data = notes_read()
            elif p.path == "/api/packages":
                cat = urllib.parse.parse_qs(p.query).get("category", [""])[0]
                pkgs = [{"id": i, "name": n} for i, n in CATEGORY_PACKAGES.get(cat, [])]
                data = {
                    "success": True,
                    "category": cat,
                    "packages": pkgs,
                    "message": f"{len(pkgs)} pacote(s) na categoria.",
                }
            else:
                self.send_json(404, {"success": False, "message": "Endpoint não encontrado."})
                return
            self.send_json(200, data)
        except Exception as e:
            self.send_json(500, {"success": False, "message": f"Erro interno no GET: {e}"})

    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > 1_000_000:
            self.send_json(413, {"success": False, "message": "Corpo da requisição muito grande."})
            return
        try:
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            body = json.loads(raw or "{}")
            if not isinstance(body, dict):
                body = {}
        except Exception:
            self.send_json(400, {"success": False, "message": "JSON inválido no corpo da requisição."})
            return

        try:
            if p.path == "/api/action":
                action = str(body.get("action", "")).strip()
                if not action:
                    self.send_json(400, {"success": False, "message": "Campo 'action' é obrigatório."})
                    return
                r = run_action(action)
                if not isinstance(r, dict):
                    r = {"success": False, "action": action, "message": "Resposta inválida do handler."}
                # 200 mesmo em falha de negócio: o frontend lê success/message.
                # Só 5xx para erros inesperados de infraestrutura.
                status = 200 if "success" in r else 500
                self.send_json(status, r)
            elif p.path == "/api/install":
                packages = body.get("packages", [])
                if not isinstance(packages, list):
                    self.send_json(400, {"success": False, "message": "Campo 'packages' deve ser uma lista."})
                    return
                results = [
                    winget_install(x["id"], x.get("name", x["id"]))
                    for x in packages[:30]
                    if isinstance(x, dict) and x.get("id")
                ]
                ok_count = sum(1 for x in results if x.get("success"))
                ok = bool(results) and ok_count == len(results)
                self.send_json(200 if ok else 207, {
                    "success": ok,
                    "message": f"{ok_count}/{len(results)} pacote(s) instalado(s) com sucesso.",
                    "results": results,
                })
            elif p.path == "/api/notes":
                text = body.get("text", "")
                if not isinstance(text, str):
                    text = str(text) if text is not None else ""
                if len(text) > 500_000:
                    self.send_json(413, {"success": False, "message": "Nota muito grande (limite 500 KB)."})
                    return
                self.send_json(200, notes_write(text))
            else:
                self.send_json(404, {"success": False, "message": "Endpoint não encontrado."})
        except Exception as e:
            self.send_json(500, {"success": False, "message": f"Erro interno no POST: {e}"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    host = "127.0.0.1"
    port = 8765
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"{APP_NAME} {VERSION}")
    print(f"API: http://{host}:{port}/api/health")
    print(f"Administrador: {is_admin()}")
    try:
        winget = winget_available()
    except Exception:
        winget = False
    print(f"Winget: {winget}")
    print("Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando...")
        server.server_close()
