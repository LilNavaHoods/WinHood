# Windows Optimizer — Frontend + Backend

## Arquitetura

- `src/` — React + TypeScript + Vite
- `backend/server.py` — API local Python
- `backend/cleanup_script.bat` — rotina de limpeza baseada no TXT original
- API: `http://127.0.0.1:8765`

O navegador nunca executa comandos do Windows diretamente. O fluxo agora é:

React → API local Python → Windows → resultado/log → React

## Como executar

### 1. Backend

Use `start-backend-admin.bat`.

A janela de UAC será exibida porque SFC, DISM, rede, Winget, limpeza e outras rotinas podem exigir administrador.

O backend informa no console:
- URL da API
- se está em modo Administrador
- se Winget está disponível

### 2. Frontend

No projeto:

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

## Funções conectadas

### Limpeza
- Limpeza rápida — reutiliza a rotina de limpeza do TXT original.
- Limpeza avançada — CleanMgr.
- Limpeza do Windows Update — DISM StartComponentCleanup.

### Reparo
- Ponto de restauração.
- SFC.
- DISM.
- SFC + DISM.

### Winget
- Catálogo por categoria.
- Seleção individual de pacotes.
- Atualização de todos os programas.
- NVIDIA/AMD/Intel conforme IDs presentes no TXT.

### Desempenho
- Combo de desempenho.
- TRIM.
- Inicialização.
- Bloatware.

### Rede
- Teste de conectividade.
- Flush DNS.
- Renovação de IP.
- Reset de Winsock/TCP-IP.

### Informações
- Inventário real de Windows, CPU, RAM, GPU e BIOS.
- Informações de hardware.
- Relatório técnico.
- MSInfo32.

### Armazenamento
- Gerenciamento de Disco.
- Lista de discos/volumes via PowerShell.
- Guia DiskPart.
- Inicialização do DiskPart.

### Logs
As execuções da API são registradas em:

`C:\ProgramData\WindowsOptimizer\logs`

Os registros da API usam JSONL com timestamp, ação, status, duração e código de saída.

## Observação

O backend foi feito com a biblioteca padrão do Python, portanto não precisa de FastAPI/Flask para funcionar.
