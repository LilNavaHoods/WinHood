# 🪟 WinHood

**Painel de otimização e manutenção para Windows 10 e Windows 11**

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?style=flat-square&logo=windows&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?style=flat-square&logo=react&logoColor=black)
![Python](https://img.shields.io/badge/Backend-Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Admin](https://img.shields.io/badge/Requer-Administrador-red?style=flat-square)
![Status](https://img.shields.io/badge/Status-v5.0%20(Em%20Empacotamento)-brightgreen?style=flat-square)

> 🚧 **Atenção:** O WinHood está atualmente em processo de empacotamento para se tornar um **arquivo executável único (.exe)**. Durante essa fase de transição para a versão 5.0, a estrutura está sendo adaptada para que, no futuro, não seja mais necessário instalar dependências manuais (como Python ou Node.js).

---

### 📋 O que é?

O **WinHood** é uma central de suporte local para Windows: interface moderna em React e backend Python que executa as rotinas do sistema com privilégios de administrador.

Ele centraliza limpeza, reparo, instalação de programas (Winget), desempenho, rede, inventário e armazenamento em um painel fácil de usar. Ideal para preparar máquinas **pós-formatação** ou para a **manutenção periódica** do computador.

O navegador **nunca** executa comandos do Windows diretamente. O fluxo é:

`React (painel) → API local Python → Windows → resultado/log → React`

---

### 🗺️ Roadmap e funcionalidades

#### ✅ Funcionalidades atuais

- [x] **Interface gráfica (React 19 + Vite + TypeScript + Tailwind CSS)** com suporte a tema claro/escuro e verificação de status do backend em tempo real.
- [x] **Backend local em Python** utilizando apenas bibliotecas padrão (sem FastAPI ou Flask), com rotas HTTP REST em porta dedicada (`8765`).
- [x] **Comunicação robusta** — suporte a proxy do Vite (`/api`), CORS local, tratamento de timeouts, controle de cancelamento (`AbortController`), erros de rede vs HTTP e saída expandível nos avisos (toasts).
- [x] **Limpeza:**
  - **Rápida:** Script batch original para limpeza profunda de diretórios temporários (`Temp`, `%TEMP%`, `Prefetch`, cache do IE/Edge, relatórios de erros, etc.).
  - **Avançada:** Limpeza de arquivos do sistema via `CleanMgr`.
  - **Windows Update:** Otimização e limpeza do repositório de componentes via `DISM /StartComponentCleanup`.
- [x] **Reparo do sistema:**
  - Criação de **Ponto de Restauração** do sistema.
  - Verificação e reparo de integridade via **SFC** (`sfc /scannow`).
  - Imagem do sistema via **DISM** (`CheckHealth`, `ScanHealth` e `RestoreHealth`).
  - Execução combinada de diagnósticos e reparos completos.
- [x] **Instalação de programas (Winget):**
  - Catálogo amplo organizado por categorias (Navegadores, Comunicação, Utilitários, Desenvolvimento e Runtimes).
  - Seleção individual ou em lote.
  - Atualização geral de todos os pacotes instalados via Winget em um único clique.
- [x] **Otimização de desempenho:**
  - Alternância do plano de energia para **Alto Desempenho** ou **Desempenho Máximo**.
  - Gerenciamento e desativação do serviço **SysMain** (Superfetch).
  - Ajuste de efeitos visuais para melhor desempenho.
  - Execução de otimização de armazenamento / TRIM em SSDs.
  - Remoção/desinstalação de bloatware do Windows.
- [x] **Drivers e vídeo:**
  - Atalhos de diagnóstico para drivers NVIDIA, AMD e Intel.
  - Consulta rápida a informações de BIOS.
- [x] **Rede:**
  - Teste de conectividade e latência.
  - Limpeza de cache de DNS (`ipconfig /flushdns`).
  - Liberação e renovação de IP (`release` / `renew`).
  - Reset da pilha de protocolos de rede (`Winsock` e `TCP/IP`).
- [x] **Diagnóstico e inventário:**
  - Leitura detalhada de hardware e sistema (Windows, CPU, RAM, GPU, placa-mãe, BIOS).
  - Geração de relatório técnico detalhado e abertura direta do **MSInfo32**.
- [x] **Armazenamento:**
  - Atalho e abertura do Gerenciamento de Disco (`diskmgmt.msc`).
  - Listagem de discos e volumes do sistema.
  - Guia ilustrativo de comandos do **DiskPart** com opção de lançamento em nova janela.
- [x] **Registro de logs:** Salvamento de logs de ações em formato `JSONL` (`winhood_log.jsonl`) contendo timestamp, comando, status, duração e código de saída.

#### 🚀 Planejado para o futuro

- [ ] Maior biblioteca de aplicativos e serviços no catálogo Winget
- [ ] Download de ISOs oficiais do Windows e ferramentas de suporte
- [ ] Menu de segurança (Defender, Firewall e políticas)
- [ ] Preparo de pendrives bootáveis
- [ ] Progresso em tempo real (SSE/WebSocket) para rotinas longas (SFC/DISM)
- [x] **Empacotamento em executável único para distribuição** *(Em andamento para a versão 5.0)*

---

### 🏗️ Arquitetura

| Camada | Tecnologia | Função |
|--------|------------|--------|
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS | Interface gráfica e envio de requisições |
| **Backend** | Python (`http.server`) | API REST local para execução de comandos do sistema |
| **Limpeza** | `backend/cleanup_script.bat` | Script batch para remoção de arquivos temporários e cache |
| **Execução Admin** | Scripts `.bat` e `.ps1` na raiz | Inicialização automática da API Python com elevação de privilégios |
| **API** | `http://127.0.0.1:8765` | Endpoints REST (`/api/health`, `/api/action`, `/api/install`, etc.) |

#### 📡 Comunicação frontend ↔ backend

- Em desenvolvimento, o Vite faz **proxy** de `/api/*` para `http://127.0.0.1:8765` (evitando bloqueios de CORS no navegador).
- O backend aplica cabeçalhos CORS liberando requisições vindas de origens `localhost` e `127.0.0.1` em qualquer porta.
- A camada de API no React conta com timeouts ajustáveis, suporte a `AbortController` para cancelamento de requisições, tratamento seguro de JSON e diferenciação transparente entre falhas de conexão de rede e erros HTTP.
- O endpoint `/api/health` retorna a versão, status de privilégios de Administrador (`admin`) e presença do `winget`.
- Falhas de execução de negócios retornam HTTP 200 com payload `{ success: false, ... }` (operações com erro parcial usam código HTTP `207 Multi-Status`).

---

### 📦 Programas disponíveis para instalação (Winget)

Organizados por categoria no painel:

- **Navegadores e comunicação:** Google Chrome, Mozilla Firefox, Microsoft Edge, Brave, Opera, Vivaldi, Discord, Telegram, Zoom, Microsoft Teams, Mozilla Thunderbird, Slack.
- **Utilitários de suporte:** 7-Zip, WinRAR, PeaZip, Microsoft PowerToys, Everything, ShareX, WinDirStat, WizTree, AnyDesk, TeamViewer, TeraCopy, Revo Uninstaller.
- **Desenvolvimento e runtimes:** Visual Studio Code, Notepad++, Git, Python 3, Node.js LTS, FileZilla, PuTTY, WinSCP, WinMerge, Microsoft .NET Desktop Runtime, Eclipse Temurin JDK.

---

### 🚀 Como executar em modo de desenvolvimento

#### Pré-requisitos

- **Windows 10** ou **Windows 11**
- **Python 3.10+**
- **Node.js 18+** e **pnpm** (ou `npm`)

#### 1. Iniciar o Backend (Privilégios de Administrador)

Execute o arquivo script de inicialização como **Administrador**:

```cmd
:: Via arquivo BATCH na raiz do projeto
start-backend-admin.bat
```

*Ou via PowerShell:*

```powershell
.\start-backend-admin.ps1
```

O servidor da API iniciará escutando na porta `8765`.

#### 2. Iniciar o Frontend

Em um terminal separado:

```bash
# Instalar dependências
npm install

# Iniciar o servidor de desenvolvimento Vite
npm run dev
```

Acesse o painel no navegador no endereço informado pelo Vite (geralmente `http://localhost:5173`).

---

### ⚠️ Avisos e cuidados

- **Ponto de Restauração:** Crie sempre um Ponto de Restauração do Windows antes de aplicar otimizações profundas.
- **Bateria e energia:** A desativação do **SysMain** e a ativação do plano **Alto Desempenho / Desempenho Máximo** podem impactar o consumo de energia em notebooks.
- **DiskPart:** Operações de disco e partição via DiskPart podem ser destrutivas e exigem atenção na escolha do disco/volume correto.
- **Limpeza de componentes:** A limpeza do repositório do Windows Update (`DISM /StartComponentCleanup`) pode remover a capacidade de desinstalar atualizações antigas.

#### 🛡️ Windows 11 — Controle de Aplicativos Inteligentes

Em alguns sistemas com o **Smart App Control** ativado, o Windows pode bloquear a execução de scripts batch ou chamadas do Winget.

1. Abra a **Segurança do Windows**
2. Vá em **Controle de aplicativos e navegador**
3. Clique em **Configurações de Controle de Aplicativos Inteligentes**
4. Selecione **Desativado**

---

### 📁 Estrutura do projeto

```text
WinHood/
├── .figma/                     → Artefatos e configurações de integração Figma
├── backend/
│   ├── cleanup_script.bat      → Script Batch de limpeza profunda de temporários
│   └── server.py               → API REST em Python (porta 8765) com rotas de sistema
├── src/
│   ├── App.tsx                 → Componente principal do painel e integração da API
│   ├── index.css               → Configurações globais do Tailwind CSS
│   ├── main.tsx                → Ponto de entrada da aplicação React
│   └── vite-env.d.ts           → Tipagens do ambiente Vite
├── AGENTS.md                   → Diretrizes e especificações técnicas do projeto
├── README-BACKEND.md           → Documentação técnica detalhada dos endpoints da API
├── start-backend-admin.bat     → Launcher em batch com elevação de privilégios de Admin
├── start-backend-admin.ps1     → Launcher em PowerShell com elevação de privilégios de Admin
├── index.html                  → Estrutura HTML inicial
├── package.json                → Dependências do projeto e scripts Frontend
├── tsconfig.json               → Configurações do TypeScript
├── vite.config.ts              → Configuração do Vite (dev server e proxy /api → :8765)
└── README.md                   → Documentação principal do projeto
```
