import { useEffect, useMemo, useState } from "react";

/**
 * Preferência: caminho relativo /api (proxy do Vite → backend :8765).
 * Fallback absoluto caso o app seja aberto fora do dev server (file:// ou build sem proxy).
 */
const API_BASE =
  typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? "/api"
    : "http://127.0.0.1:8765/api";

const DEFAULT_TIMEOUT_MS = 120_000;

type ApiResult = {
  success: boolean;
  ok?: boolean;
  action?: string;
  message?: string;
  output?: string;
  path?: string;
  data?: any;
  version?: string;
  admin?: boolean;
  winget?: boolean;
  results?: Array<{ success: boolean; message?: string; action?: string }>;
};

type BackendHealth = {
  ok: boolean;
  success?: boolean;
  version?: string;
  admin?: boolean;
  winget?: boolean;
  message?: string;
};

class ApiError extends Error {
  status?: number;
  payload?: unknown;
  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) || "Resposta não-JSON do backend." };
  }
}

async function apiRequest<T = ApiResult>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await parseJsonSafe(response);
    // 207 Multi-Status (install parcial) é tratado como resposta válida.
    if (!response.ok && response.status !== 207) {
      throw new ApiError(
        data?.message ?? `Erro HTTP ${response.status} ao chamar ${path}.`,
        response.status,
        data,
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(`Tempo esgotado ao comunicar com o backend (${timeoutMs / 1000}s).`);
    }
    if (err instanceof TypeError) {
      // Falha de rede / CORS / backend offline.
      throw new ApiError(
        "Não foi possível conectar ao backend. Confirme que o servidor Python está em execução (porta 8765).",
      );
    }
    throw new ApiError(err instanceof Error ? err.message : "Falha desconhecida na comunicação.");
  } finally {
    window.clearTimeout(timer);
  }
}

async function apiGet<T = ApiResult>(path: string, timeoutMs = 15_000): Promise<T> {
  return apiRequest<T>(path, { method: "GET" }, timeoutMs);
}

async function apiAction(action: string): Promise<ApiResult> {
  // Rotinas longas (SFC/DISM/limpeza) podem passar de 2 min — timeout generoso.
  return apiRequest<ApiResult>(
    "/action",
    { method: "POST", body: JSON.stringify({ action }) },
    3_600_000,
  );
}

async function apiInstall(packages: Array<{ id: string; name: string }>): Promise<ApiResult> {
  return apiRequest<ApiResult>(
    "/install",
    { method: "POST", body: JSON.stringify({ packages }) },
    1_800_000,
  );
}

type IconName =
  | "grid"
  | "broom"
  | "shield"
  | "box"
  | "gauge"
  | "cpu"
  | "monitor"
  | "wifi"
  | "info"
  | "archive"
  | "disk"
  | "search"
  | "bell"
  | "sun"
  | "moon"
  | "play"
  | "check"
  | "clock"
  | "chevron"
  | "refresh"
  | "terminal"
  | "settings"
  | "warning"
  | "menu"
  | "close"
  | "note";

const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  broom: <><path d="m3 21 7.5-7.5" /><path d="m12 12 8-8" /><path d="m14 2 8 8" /><path d="M5 12c3 0 7 4 7 7-3 2-7 2-10 1 1-3 1-5 3-8Z" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8 9 5 9-5v8l-9 5-9-5Z" /><path d="M12 13v8" /></>,
  gauge: <><path d="M4 19a9 9 0 1 1 16 0" /><path d="m12 13 4-4" /><path d="M12 19v.01" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /><rect x="10" y="10" width="4" height="4" rx="1" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  archive: <><path d="M4 7v14h16V7M3 3h18v4H3zM9 11h6" /></>,
  disk: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v7c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12v7c0 1.7 4 3 9 3s9-1.3 9-3v-7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.8 6.8 0 0 0 21 12.8Z" />,
  play: <path d="m9 7 8 5-8 5Z" />,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  refresh: <><path d="M20 7h-5V2" /><path d="M19 15a8 8 0 1 1-1-9l2 1" /></>,
  terminal: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m6 9 3 3-3 3M12 15h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  warning: <><path d="M10.3 3.4 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6M8 9h2" /></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const navItems: { name: string; icon: IconName }[] = [
  { name: "Visão geral", icon: "grid" },
  { name: "Limpeza", icon: "broom" },
  { name: "Reparo do sistema", icon: "shield" },
  { name: "Instalar programas", icon: "box" },
  { name: "Desempenho", icon: "gauge" },
  { name: "Drivers e BIOS", icon: "cpu" },
  { name: "Monitor", icon: "monitor" },
  { name: "Rede", icon: "wifi" },
  { name: "Informações", icon: "info" },
  { name: "Backups e logs", icon: "archive" },
  { name: "Gerenciar discos", icon: "disk" },
  { name: "Bloco de notas", icon: "note" },
];

const actionCards: { title: string; text: string; icon: IconName; accent: string; action: string; risk?: boolean }[] = [
  { title: "Limpeza rápida", text: "Temporários, lixeira e caches", icon: "broom", accent: "blue", action: "Limpeza rápida" },
  { title: "Verificar sistema", text: "DISM e integridade do Windows", icon: "shield", accent: "green", action: "Verificação do sistema" },
  { title: "Otimizar desempenho", text: "Plano de energia e serviços", icon: "gauge", accent: "violet", action: "Otimização de desempenho" },
  { title: "Atualizar programas", text: "Pacotes e aplicativos via Winget", icon: "box", accent: "orange", action: "Atualização de programas" },
];

type ToolAction = {
  title: string;
  description: string;
  icon: IconName;
  meta: string;
  danger?: boolean;
};

type ToolModule = {
  title: string;
  eyebrow: string;
  description: string;
  icon: IconName;
  accent: string;
  status: string;
  stats: { label: string; value: string; detail: string }[];
  actions: ToolAction[];
  note: string;
};

const toolModules: Record<string, ToolModule> = {
  "Limpeza": {
    title: "Limpeza de arquivos",
    eyebrow: "Armazenamento",
    description: "Remova arquivos desnecessários, caches e resíduos do Windows com segurança.",
    icon: "broom",
    accent: "blue",
    status: "2,4 GB podem ser liberados",
    stats: [
      { label: "Arquivos temporários", value: "1,2 GB", detail: "Prontos para remoção" },
      { label: "Cache de aplicativos", value: "846 MB", detail: "12 aplicativos" },
      { label: "Lixeira", value: "354 MB", detail: "Última limpeza hoje" },
    ],
    actions: [
      { title: "Limpeza rápida", description: "Temporários do usuário, lixeira e miniaturas.", icon: "broom", meta: "Recomendado · 2–4 min" },
      { title: "Limpeza avançada", description: "Caches de navegadores, logs e resíduos de aplicativos.", icon: "settings", meta: "Completo · 5–10 min" },
      { title: "Limpeza do Windows Update", description: "Limpa componentes antigos utilizando DISM.", icon: "refresh", meta: "Administrador · 10–20 min", danger: true },
    ],
    note: "Arquivos pessoais e documentos não são incluídos nas rotinas de limpeza.",
  },
  "Reparo do sistema": {
    title: "Reparo do sistema",
    eyebrow: "Integridade do Windows",
    description: "Diagnostique arquivos corrompidos e restaure componentes essenciais do sistema.",
    icon: "shield",
    accent: "green",
    status: "Proteção do sistema ativa",
    stats: [
      { label: "Integridade", value: "Excelente", detail: "Sem erros críticos" },
      { label: "Última verificação", value: "12 jun", detail: "SFC concluído" },
      { label: "Restauração", value: "Ativa", detail: "Último ponto há 1 dia" },
    ],
    actions: [
      { title: "Criar ponto de restauração", description: "Salva o estado atual antes de qualquer alteração.", icon: "archive", meta: "Recomendado · 1–2 min" },
      { title: "Verificar arquivos com SFC", description: "Localiza e repara arquivos protegidos do Windows.", icon: "search", meta: "sfc /scannow · 10–30 min" },
      { title: "Reparar imagem com DISM", description: "Restaura a imagem e os componentes do sistema.", icon: "shield", meta: "DISM RestoreHealth · 15–40 min", danger: true },
    ],
    note: "Mantenha o computador conectado à energia durante verificações demoradas.",
  },
  "Instalar programas": {
    title: "Instalar programas",
    eyebrow: "Catálogo Winget",
    description: "Instale aplicativos homologados de forma rápida, silenciosa e centralizada.",
    icon: "box",
    accent: "violet",
    status: "Winget disponível",
    stats: [
      { label: "Aplicativos", value: "64", detail: "Disponíveis no catálogo" },
      { label: "Atualizações", value: "7", detail: "Pacotes desatualizados" },
      { label: "Instalados hoje", value: "3", detail: "Sem falhas" },
    ],
    actions: [
      { title: "Navegadores e comunicação", description: "Chrome, Firefox, Edge, Teams, Zoom e Discord.", icon: "wifi", meta: "12 aplicativos" },
      { title: "Utilitários de suporte", description: "AnyDesk, TeamViewer, 7-Zip, Revo e TeraCopy.", icon: "settings", meta: "12 aplicativos" },
      { title: "Desenvolvimento e runtimes", description: "VS Code, Git, Python, Node.js, .NET e Java.", icon: "terminal", meta: "14 aplicativos" },
      { title: "Atualizar todos os programas", description: "Executa a atualização de todos os pacotes Winget.", icon: "refresh", meta: "7 atualizações · 15–25 min", danger: true },
    ],
    note: "Os pacotes são obtidos diretamente dos repositórios oficiais do Winget.",
  },
  "Desempenho": {
    title: "Ajustes de desempenho",
    eyebrow: "Otimização",
    description: "Ajuste energia, serviços, armazenamento e inicialização para melhorar a resposta do PC.",
    icon: "gauge",
    accent: "orange",
    status: "Desempenho equilibrado",
    stats: [
      { label: "Tempo de inicialização", value: "18s", detail: "3s mais rápido" },
      { label: "Plano de energia", value: "Balanceado", detail: "Padrão do Windows" },
      { label: "Apps na inicialização", value: "8", detail: "3 de alto impacto" },
    ],
    actions: [
      { title: "Combo de desempenho", description: "Energia, manutenção, SysMain e efeitos visuais.", icon: "gauge", meta: "5 otimizações · 10–20 min", danger: true },
      { title: "Otimização de SSD", description: "Habilita TRIM e ajusta a desfragmentação agendada.", icon: "disk", meta: "SSD detectado · 2 min" },
      { title: "Gerenciar inicialização", description: "Revise os programas iniciados junto com o Windows.", icon: "settings", meta: "8 aplicativos ativos" },
      { title: "Remover bloatware", description: "Remove aplicativos promocionais e componentes opcionais.", icon: "box", meta: "Requer confirmação", danger: true },
    ],
    note: "Um backup das configurações atuais é criado antes do combo de desempenho.",
  },
  "Drivers e BIOS": {
    title: "Drivers e BIOS",
    eyebrow: "Hardware",
    description: "Acesse atualizações oficiais para vídeo, chipset e firmware do fabricante.",
    icon: "cpu",
    accent: "violet",
    status: "Drivers funcionando normalmente",
    stats: [
      { label: "Dispositivos", value: "23", detail: "Todos reconhecidos" },
      { label: "Driver gráfico", value: "Atual", detail: "Versão 31.0.15" },
      { label: "BIOS", value: "1.24.0", detail: "Verificar fabricante" },
    ],
    actions: [
      { title: "Atualizar driver NVIDIA", description: "Abre o instalador oficial NVIDIA App.", icon: "monitor", meta: "NVIDIA · Site oficial" },
      { title: "Atualizar driver AMD", description: "Instala o AMD Software: Adrenalin Edition.", icon: "monitor", meta: "AMD · Site oficial" },
      { title: "Intel Driver Support Assistant", description: "Detecta e atualiza componentes Intel.", icon: "cpu", meta: "Intel DSA · Winget" },
      { title: "Verificar BIOS", description: "Abre as informações e o suporte do fabricante.", icon: "info", meta: "Procedimento avançado", danger: true },
    ],
    note: "Atualizações de BIOS exigem energia contínua e não devem ser interrompidas.",
  },
  "Monitor": {
    title: "Monitor e resolução",
    eyebrow: "Exibição",
    description: "Gerencie resolução, escala, frequência e organização das telas conectadas.",
    icon: "monitor",
    accent: "blue",
    status: "1 monitor conectado",
    stats: [
      { label: "Resolução", value: "1920 × 1080", detail: "Recomendada" },
      { label: "Frequência", value: "60 Hz", detail: "Modo atual" },
      { label: "Escala", value: "100%", detail: "Padrão do sistema" },
    ],
    actions: [
      { title: "Abrir configurações de vídeo", description: "Resolução, escala e orientação do monitor.", icon: "monitor", meta: "Configurações do Windows" },
      { title: "Exibição avançada", description: "Taxa de atualização e propriedades do adaptador.", icon: "settings", meta: "60 Hz selecionado" },
      { title: "Detectar monitores", description: "Procura telas adicionais conectadas ao computador.", icon: "search", meta: "Detecção de hardware" },
    ],
    note: "Use sempre a resolução marcada como recomendada para melhor nitidez.",
  },
  "Rede": {
    title: "Ferramentas de rede",
    eyebrow: "Conectividade",
    description: "Diagnostique a conexão e restaure configurações de internet do Windows.",
    icon: "wifi",
    accent: "green",
    status: "Conectado à internet",
    stats: [
      { label: "Conexão", value: "Ethernet", detail: "Rede privada" },
      { label: "Endereço IPv4", value: "192.168.1.104", detail: "DHCP ativo" },
      { label: "Gateway", value: "192.168.1.1", detail: "12 ms de resposta" },
    ],
    actions: [
      { title: "Testar conectividade", description: "Verifica gateway, DNS e acesso à internet.", icon: "wifi", meta: "Diagnóstico · 30s" },
      { title: "Limpar cache DNS", description: "Remove registros DNS armazenados localmente.", icon: "broom", meta: "ipconfig /flushdns" },
      { title: "Renovar endereço IP", description: "Libera e solicita um novo endereço ao roteador.", icon: "refresh", meta: "Pode interromper a conexão" },
      { title: "Redefinir rede", description: "Restaura Winsock, TCP/IP e adaptadores de rede.", icon: "settings", meta: "Requer reinicialização", danger: true },
    ],
    note: "A redefinição completa pode remover redes Wi-Fi e senhas salvas.",
  },
  "Informações": {
    title: "Informações do computador",
    eyebrow: "Inventário",
    description: "Consulte as principais informações de hardware, Windows e identificação da estação.",
    icon: "info",
    accent: "blue",
    status: "Inventário atualizado agora",
    stats: [
      { label: "Windows", value: "11 Pro", detail: "Build 22631" },
      { label: "Processador", value: "Intel Core i7", detail: "12ª geração" },
      { label: "Memória", value: "16 GB", detail: "DDR4 · 3200 MHz" },
    ],
    actions: [
      { title: "Resumo do sistema", description: "Modelo, serial, Windows, CPU, memória e arquitetura.", icon: "info", meta: "Relatório instantâneo" },
      { title: "Informações de hardware", description: "Placa-mãe, BIOS, discos, vídeo e dispositivos.", icon: "cpu", meta: "Consulta WMI" },
      { title: "Criar relatório técnico", description: "Gera um resumo pronto para anexar ao chamado.", icon: "archive", meta: "Formato texto" },
      { title: "Abrir MSInfo32", description: "Inicia a ferramenta de informações do Windows.", icon: "terminal", meta: "Ferramenta nativa" },
    ],
    note: "O relatório técnico não inclui senhas, documentos ou dados pessoais.",
  },
  "Backups e logs": {
    title: "Backups e logs",
    eyebrow: "Recuperação e auditoria",
    description: "Acompanhe operações realizadas e proteja configurações antes das alterações.",
    icon: "archive",
    accent: "violet",
    status: "Backup automático ativo",
    stats: [
      { label: "Pontos de restauração", value: "4", detail: "Mais recente há 1 dia" },
      { label: "Arquivos de log", value: "18", detail: "Últimos 30 dias" },
      { label: "Espaço utilizado", value: "1,8 GB", detail: "Retenção automática" },
    ],
    actions: [
      { title: "Criar ponto de restauração", description: "Registra um estado seguro das configurações atuais.", icon: "archive", meta: "Proteção do sistema" },
      { title: "Abrir pasta de backups", description: "Acessa os arquivos exportados pelo otimizador.", icon: "box", meta: "C:\\ProgramData\\WindowsOptimizer" },
      { title: "Consultar logs", description: "Visualize o histórico detalhado das operações.", icon: "terminal", meta: "18 arquivos disponíveis" },
      { title: "Limpar logs antigos", description: "Remove registros com mais de 30 dias.", icon: "broom", meta: "12 arquivos · 8 MB", danger: true },
    ],
    note: "Logs são armazenados localmente e ajudam no diagnóstico de eventuais falhas.",
  },
  "Gerenciar discos": {
    title: "Gerenciar discos",
    eyebrow: "Armazenamento avançado",
    description: "Inspecione volumes e acesse ferramentas administrativas de particionamento com orientações claras de risco.",
    icon: "disk",
    accent: "orange",
    status: "2 discos detectados",
    stats: [
      { label: "Disco do sistema", value: "SSD 512 GB", detail: "71% utilizado" },
      { label: "Disco secundário", value: "HDD 1 TB", detail: "43% utilizado" },
      { label: "Volumes", value: "3", detail: "Todos íntegros" },
    ],
    actions: [
      {
        title: "Abrir Gerenciamento de Disco",
        description: "Abre a interface gráfica do Windows (diskmgmt.msc) para criar, formatar ou alterar letras de partição com visualização dos discos.",
        icon: "disk",
        meta: "diskmgmt.msc · Seguro · Recomendado",
      },
      {
        title: "Listar discos e volumes",
        description: "Consulta somente leitura: lista discos físicos e volumes com status, estilo de partição e sistema de arquivos — não altera nada.",
        icon: "search",
        meta: "Somente leitura · Sem risco",
      },
      {
        title: "Guia de comandos Diskpart",
        description: "Exibe cada comando do Diskpart com explicação, nível de risco e exemplo (list, select, clean, format, etc.).",
        icon: "terminal",
        meta: "Referência · Sem execução",
      },
      {
        title: "Iniciar Diskpart",
        description: "Abre o console interativo diskpart.exe. Comandos digitados ali podem apagar partições se usados incorretamente.",
        icon: "warning",
        meta: "Alto risco · Administrador",
        danger: true,
      },
    ],
    note: "Atenção: operações do Diskpart podem apagar dados permanentemente. Confirme sempre o disco com list disk antes de clean ou format.",
  },
};

const activities = [
  { name: "Limpeza rápida", detail: "Temporários e cache", time: "Hoje, 10:42", status: "Concluído", icon: "broom" as IconName, color: "blue" },
  { name: "Ponto de restauração", detail: "Antes da otimização", time: "Ontem, 16:18", status: "Concluído", icon: "archive" as IconName, color: "violet" },
  { name: "Verificação SFC", detail: "Integridade do sistema", time: "12 jun, 09:05", status: "Concluído", icon: "shield" as IconName, color: "green" },
];

export default function App() {
  const [active, setActive] = useState("Visão geral");
  const [subpanel, setSubpanel] = useState<ToolAction | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = window.localStorage.getItem("windows-optimizer-theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [backendReady, setBackendReady] = useState(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [systemInfo, setSystemInfo] = useState<Record<string, any> | null>(null);
  const [resultPanel, setResultPanel] = useState<{
    action: string;
    success: boolean;
    message: string;
    output?: string;
    data?: any;
    path?: string;
  } | null>(null);
  const [resources, setResources] = useState<{
    cpu_percent: number;
    ram_percent: number;
    disk_percent: number;
    ram_used_gb: number;
    ram_total_gb: number;
    disk_used_gb: number;
    disk_free_gb: number;
    disk_total_gb: number;
    disk_label: string;
  } | null>(null);

  const visibleActions = useMemo(
    () => actionCards.filter((item) => `${item.title} ${item.text}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  type SearchHit = {
    kind: "module" | "action" | "quick";
    module: string;
    title: string;
    description: string;
    icon: IconName;
    actionTitle?: string;
  };

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as SearchHit[];
    const hits: SearchHit[] = [];

    for (const nav of navItems) {
      if (nav.name === "Visão geral") continue;
      const mod = toolModules[nav.name];
      if (!mod) {
        const extraBlob = `${nav.name} bloco de notas anotações notes`.toLowerCase();
        if (nav.name === "Bloco de notas" && extraBlob.includes(q)) {
          hits.push({
            kind: "module",
            module: nav.name,
            title: nav.name,
            description: "Anotações rápidas salvas neste navegador.",
            icon: nav.icon,
          });
        }
        continue;
      }
      const moduleBlob = `${nav.name} ${mod.title} ${mod.description} ${mod.eyebrow}`.toLowerCase();
      if (moduleBlob.includes(q)) {
        hits.push({
          kind: "module",
          module: nav.name,
          title: nav.name,
          description: mod.description,
          icon: nav.icon,
        });
      }
      for (const act of mod.actions) {
        const actBlob = `${act.title} ${act.description} ${act.meta} ${nav.name}`.toLowerCase();
        if (actBlob.includes(q)) {
          hits.push({
            kind: "action",
            module: nav.name,
            title: act.title,
            description: act.description,
            icon: act.icon,
            actionTitle: act.title,
          });
        }
      }
    }

    for (const card of actionCards) {
      if (`${card.title} ${card.text}`.toLowerCase().includes(q)) {
        hits.push({
          kind: "quick",
          module: "Visão geral",
          title: card.title,
          description: card.text,
          icon: card.icon,
          actionTitle: card.action,
        });
      }
    }

    // Evita duplicatas pelo título + módulo
    const seen = new Set<string>();
    return hits.filter((h) => {
      const key = `${h.module}::${h.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }, [query]);

  function openSearchHit(hit: SearchHit) {
    setQuery("");
    if (hit.kind === "quick" && hit.actionTitle) {
      setActive("Visão geral");
      setSubpanel(null);
      setModalAction(hit.actionTitle);
      return;
    }
    setActive(hit.module);
    if (hit.kind === "action" && hit.actionTitle) {
      const mod = toolModules[hit.module];
      const act = mod?.actions.find((a) => a.title === hit.actionTitle) ?? null;
      setSubpanel(act);
    } else {
      setSubpanel(null);
    }
    setSidebarOpen(false);
  }

  useEffect(() => {
    window.localStorage.setItem("windows-optimizer-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;
    let systemLoaded = false;

    async function loadBackend() {
      try {
        const health = await apiGet<BackendHealth>("/health", 8_000);
        if (cancelled) return;
        const ready = Boolean(health?.ok ?? health?.success);
        setBackendReady(ready);
        setBackendHealth(health);
        // Inventário só na primeira conexão bem-sucedida (evita spam de WMI).
        if (ready && !systemLoaded) {
          try {
            const result = await apiGet<ApiResult>("/system", 20_000);
            if (!cancelled && result?.data) {
              setSystemInfo(result.data);
              systemLoaded = true;
            }
          } catch {
            // Painel permanece utilizável sem inventário.
          }
        }
      } catch {
        if (!cancelled) {
          setBackendReady(false);
          setBackendHealth(null);
        }
      }
    }
    loadBackend();
    const timer = window.setInterval(loadBackend, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadResources() {
      try {
        const data = await apiGet<{
          success?: boolean;
          cpu_percent?: number;
          ram_percent?: number;
          disk_percent?: number;
          ram_used_gb?: number;
          ram_total_gb?: number;
          disk_used_gb?: number;
          disk_free_gb?: number;
          disk_total_gb?: number;
          disk_label?: string;
        }>("/resources", 12_000);
        if (cancelled || !data) return;
        setResources({
          cpu_percent: Math.max(0, Math.min(100, Number(data.cpu_percent) || 0)),
          ram_percent: Math.max(0, Math.min(100, Number(data.ram_percent) || 0)),
          disk_percent: Math.max(0, Math.min(100, Number(data.disk_percent) || 0)),
          ram_used_gb: Number(data.ram_used_gb) || 0,
          ram_total_gb: Number(data.ram_total_gb) || 0,
          disk_used_gb: Number(data.disk_used_gb) || 0,
          disk_free_gb: Number(data.disk_free_gb) || 0,
          disk_total_gb: Number(data.disk_total_gb) || 0,
          disk_label: data.disk_label || "C:",
        });
      } catch {
        // Mantém último valor conhecido.
      }
    }
    loadResources();
    const timer = window.setInterval(loadResources, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function showToast(text: string, ok = true, ms = 7000) {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), ms);
  }

  async function runAction(action: string) {
    setModalAction(null);
    setRunning(action);
    setResultPanel(null);
    try {
      const result = await apiAction(action);
      const msg = result.message ?? (result.success ? "concluída com sucesso." : "falhou.");
      const hasDetail = Boolean(result.output || result.data || result.path);
      // Painel persistente para consultas e saídas longas; toast curto só para status simples.
      setResultPanel({
        action,
        success: Boolean(result.success),
        message: msg,
        output: result.output,
        data: result.data,
        path: result.path,
      });
      if (!hasDetail) {
        showToast(`${action}: ${msg}`, Boolean(result.success), 6_000);
      }
      // Atualiza inventário do dashboard quando a consulta for de sistema.
      if (result.success && result.data && (action === "Resumo do sistema" || action === "Informações do sistema")) {
        setSystemInfo(result.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao comunicar com o backend.";
      setResultPanel({
        action,
        success: false,
        message,
      });
      showToast(message, false, 8_000);
    } finally {
      setRunning(null);
    }
  }

  function selectNav(name: string) {
    setActive(name);
    setSubpanel(null);
    setSidebarOpen(false);
    if (name !== "Visão geral") {
      showToast(`Módulo “${name}” selecionado.`, true, 2500);
    }
  }

  return (
    <div className={`min-h-screen bg-[#f4f6fa] text-[#192233] transition-colors ${darkMode ? "dark-theme" : ""}`}>
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#10182b] text-white transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-white/8 px-6">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#0878f9] shadow-[0_6px_18px_rgba(8,120,249,.3)]">
            <Icon name="settings" size={20} />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">WinHood</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Central de suporte · v5.0</p>
          </div>
          <button className="ml-auto text-slate-400 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><Icon name="close" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">Ferramentas</p>
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.name}
                onClick={() => selectNav(item.name)}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-left text-[12px] font-medium transition ${active === item.name ? "bg-[#0878f9] text-white shadow-[0_4px_14px_rgba(8,120,249,.22)]" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
              >
                <span className={active === item.name ? "text-white" : "text-slate-500 group-hover:text-slate-300"}><Icon name={item.icon} size={17} /></span>
                {item.name}
              </button>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/8 p-4">
          <div className="rounded-xl bg-white/[.045] p-3.5">
            <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-300">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
              {backendReady ? "Backend conectado" : "Backend desconectado"}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500"><span>Versão instalada</span><span className="text-slate-300">v5.0</span></div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar navegação" />}

      <main className="min-h-screen lg:ml-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center border-b border-[#e3e7ee] bg-white/95 px-5 backdrop-blur md:px-8">
          <button className="mr-3 text-slate-500 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">Painel de controle</h1>
            <p className="mt-0.5 hidden text-[10px] text-slate-400 sm:block">Gerencie e otimize esta estação Windows</p>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="relative hidden md:block">
              <label className="flex h-9 w-56 items-center gap-2 rounded-lg border border-[#e2e6ed] bg-[#f8f9fb] px-3 text-slate-400 xl:w-72">
                <Icon name="search" size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400"
                  placeholder="Buscar ferramenta..."
                  aria-label="Buscar ferramenta"
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Limpar busca"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </label>
              {query.trim() && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[min(420px,90vw)] overflow-hidden rounded-xl border border-[#e1e5ec] bg-white shadow-[0_16px_40px_rgba(15,23,42,.16)]">
                  <div className="border-b border-[#edf0f4] px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-400">
                      {searchHits.length ? `${searchHits.length} resultado(s)` : "Nenhum resultado"}
                    </p>
                  </div>
                  {searchHits.length > 0 ? (
                    <ul className="max-h-80 overflow-y-auto py-1">
                      {searchHits.map((hit) => (
                        <li key={`${hit.kind}-${hit.module}-${hit.title}`}>
                          <button
                            type="button"
                            onClick={() => openSearchHit(hit)}
                            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-[#f3f7fd]"
                          >
                            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf3ff] text-[#0878f9]">
                              <Icon name={hit.icon} size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-semibold text-[#172136]">{hit.title}</span>
                              <span className="mt-0.5 block truncate text-[9px] text-slate-400">
                                {hit.kind === "module" ? "Módulo" : hit.kind === "quick" ? "Ação rápida" : `Em ${hit.module}`}
                                {" · "}
                                {hit.description}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-4 text-[11px] text-slate-400">
                      Tente termos como “SFC”, “DNS”, “Winget” ou “limpeza”.
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setDarkMode((current) => !current)}
              className="flex h-9 items-center gap-2 rounded-lg border border-[#e2e6ed] px-2.5 text-slate-500 transition hover:bg-slate-50"
              aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
              title={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
            >
              <Icon name={darkMode ? "sun" : "moon"} size={16} />
              <span className="hidden text-[9px] font-semibold xl:inline">{darkMode ? "Modo claro" : "Modo escuro"}</span>
            </button>
            <div className="ml-1 hidden items-center gap-2.5 border-l border-slate-200 pl-3 sm:flex">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf3ff] text-[10px] font-bold text-[#0878f9]">AD</div>
              <div className="leading-tight"><p className="text-[11px] font-semibold">Administrador</p><p className="text-[9px] text-slate-400">Acesso completo</p></div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1320px] px-5 py-7 md:px-8 md:py-8">
          {active === "Visão geral" ? <>
          <section className="mb-7">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#0878f9]">Estação de trabalho</p>
              <h2 className="text-[23px] font-semibold tracking-[-.03em] text-[#121b2c]">Olá, Administrador</h2>
              <p className="mt-1 text-[12px] text-slate-500">{systemInfo?.computer ? `${systemInfo.computer} · ${systemInfo.os ?? "Windows"}` : "Gerencie e otimize esta estação Windows com o WinHood."}</p>
            </div>
          </section>

          <section className="mb-6 grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
            <div className="overflow-hidden rounded-[14px] border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
              <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4">
                <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Icon name="shield" size={16} /></span><h3 className="text-[12px] font-semibold">Status do sistema</h3></div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Tudo certo</span>
              </div>
              <div className="grid gap-px bg-[#edf0f4] sm:grid-cols-3">
                <StatusMetric
                  label="Backend"
                  value={backendReady ? "Conectado" : "Offline"}
                  sub={
                    backendReady
                      ? [
                          backendHealth?.version,
                          backendHealth?.admin ? "Admin" : "sem Admin",
                          backendHealth?.winget ? "Winget OK" : "sem Winget",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Inicie o backend Python (porta 8765)"
                  }
                  icon="check"
                  color={backendReady ? "green" : "orange"}
                />
                <StatusMetric label="Última limpeza" value="Hoje, 10:42" sub="2,4 GB liberados" icon="broom" color="blue" />
                <StatusMetric label="Ponto de restauração" value="Há 1 dia" sub="Proteção ativa" icon="archive" color="violet" />
              </div>
            </div>

            <div className="rounded-[14px] border border-[#e1e5ec] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.02)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold">Uso de recursos</h3>
                <span className="text-[9px] text-slate-400">
                  {backendReady ? "Atualização automática" : "Aguardando backend"}
                </span>
              </div>
              <div className="space-y-4">
                <ResourceBar
                  name="Processador"
                  value={resources?.cpu_percent ?? 0}
                  detail={resources ? `${resources.cpu_percent}% em uso` : "—"}
                  color="#0878f9"
                />
                <ResourceBar
                  name="Memória"
                  value={resources?.ram_percent ?? 0}
                  detail={
                    resources
                      ? `${String(resources.ram_used_gb).replace(".", ",")} / ${String(resources.ram_total_gb).replace(".", ",")} GB`
                      : "—"
                  }
                  color="#7c5cff"
                />
                <ResourceBar
                  name={`Disco local (${resources?.disk_label ?? "C:"})`}
                  value={resources?.disk_percent ?? 0}
                  detail={
                    resources
                      ? `${String(resources.disk_free_gb).replace(".", ",")} GB livres de ${String(resources.disk_total_gb).replace(".", ",")} GB`
                      : "—"
                  }
                  color="#f39b24"
                />
              </div>
            </div>
          </section>

          <section className="mb-6">
            <div className="mb-3.5 flex items-center justify-between">
              <div><h3 className="text-[13px] font-semibold">Ações rápidas</h3><p className="mt-0.5 text-[10px] text-slate-400">Rotinas mais utilizadas pela equipe de suporte</p></div>
              <button className="flex items-center gap-1 text-[10px] font-semibold text-[#0878f9]" onClick={() => showToast("Todas as ferramentas estão disponíveis no menu lateral.")}>Ver todas <Icon name="chevron" size={12} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visibleActions.map((item) => (
                <button key={item.title} onClick={() => setModalAction(item.action)} className="action-card group rounded-[13px] border border-[#e1e5ec] bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,.02)] transition hover:-translate-y-0.5 hover:border-[#cdd8e8] hover:shadow-[0_8px_25px_rgba(31,45,72,.07)]">
                  <div className="mb-5 flex items-start justify-between">
                    <span className={`icon-box ${item.accent}`}><Icon name={item.icon} size={19} /></span>
                    <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0878f9]"><Icon name="chevron" size={16} /></span>
                  </div>
                  <p className="text-[12px] font-semibold">{item.title}</p><p className="mt-1 text-[10px] text-slate-400">{item.text}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
            <div className="rounded-[14px] border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
              <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4"><h3 className="text-[12px] font-semibold">Atividades recentes</h3><button className="text-[10px] font-medium text-slate-400 hover:text-[#0878f9]">Abrir histórico</button></div>
              <div className="divide-y divide-[#edf0f4] px-5">
                {activities.map((item) => (
                  <div key={item.name} className="flex items-center gap-3 py-3.5">
                    <span className={`icon-box small ${item.color}`}><Icon name={item.icon} size={15} /></span>
                    <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold">{item.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{item.detail}</p></div>
                    <p className="hidden text-[9px] text-slate-400 sm:block">{item.time}</p>
                    <span className="ml-2 flex items-center gap-1.5 text-[9px] font-medium text-emerald-600"><Icon name="check" size={12} /> {item.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] bg-[#142039] p-5 text-white shadow-[0_8px_30px_rgba(15,24,43,.15)]">
              <div className="mb-5 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-[#6cb4ff]"><Icon name="monitor" size={17} /></span><div><h3 className="text-[11px] font-semibold">Este computador</h3><p className="text-[9px] text-slate-400">Informações do dispositivo</p></div></div>
              <dl className="space-y-3 text-[10px]">
                <DeviceRow label="Dispositivo" value="DESKTOP-SUPORTE" />
                <DeviceRow label="Sistema" value="Windows 11 Pro" />
                <DeviceRow label="Processador" value="Intel Core i7-12700" />
                <DeviceRow label="Memória" value="16 GB DDR4" />
                <DeviceRow label="Endereço IP" value="192.168.1.104" />
              </dl>
              <button onClick={() => selectNav("Informações")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[.06] py-2.5 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10"><Icon name="info" size={13} /> Ver informações completas</button>
            </div>
          </section>
          </> : active === "Bloco de notas" ? (
            <NotesPanel />
          ) : subpanel && toolModules[active] ? (
            <ToolSubpanel
              key={`${active}-${subpanel.title}`}
              module={toolModules[active]}
              action={subpanel}
              onBack={() => setSubpanel(null)}
              onRun={(action) => setModalAction(action)}
            />
          ) : toolModules[active] ? (
            <ToolPanel key={active} module={toolModules[active]} onOpen={setSubpanel} />
          ) : null}
        </div>
      </main>

      {modalAction && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#07101f]/60 p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[410px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf3ff] text-[#0878f9]"><Icon name="terminal" /></span>
              <button onClick={() => setModalAction(null)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar"><Icon name="close" size={18} /></button>
            </div>
            <h3 className="text-[17px] font-semibold tracking-tight">Executar {modalAction.toLowerCase()}?</h3>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">A rotina será executada com privilégios de administrador. Um log será criado automaticamente e, quando necessário, as configurações atuais serão salvas.</p>
            <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-[10px] leading-4 text-amber-800"><span className="shrink-0"><Icon name="warning" size={15} /></span>Salve seus arquivos abertos antes de continuar. Algumas operações podem reiniciar serviços do Windows.</div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalAction(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => runAction(modalAction)} className="flex items-center gap-2 rounded-lg bg-[#0878f9] px-4 py-2.5 text-[10px] font-semibold text-white hover:bg-[#006be6]"><Icon name="play" size={13} /> Confirmar e executar</button>
            </div>
          </div>
        </div>
      )}

      {running && (
        <div className="fixed bottom-5 right-5 z-50 flex w-[310px] items-center gap-3 rounded-xl bg-[#142039] p-4 text-white shadow-2xl">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#55a8ff]" />
          <div>
            <p className="text-[11px] font-semibold">Executando rotina</p>
            <p className="mt-0.5 text-[9px] text-slate-400">{running} em andamento...</p>
            <p className="mt-1 text-[8px] text-slate-500">Aguarde — algumas rotinas podem levar vários minutos.</p>
          </div>
        </div>
      )}

      {toast && !running && !resultPanel && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-[380px] items-start gap-3 rounded-xl bg-[#142039] p-4 text-white shadow-2xl">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              toast.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
            }`}
          >
            <Icon name={toast.ok ? "check" : "warning"} size={15} />
          </span>
          <p className="text-[10px] font-medium leading-relaxed">{toast.text}</p>
        </div>
      )}

      {resultPanel && !running && (
        <ResultPanel result={resultPanel} onClose={() => setResultPanel(null)} />
      )}
    </div>
  );
}

const DATA_LABELS: Record<string, string> = {
  computer: "Computador",
  user: "Usuário",
  os: "Sistema operacional",
  version: "Versão",
  build: "Build",
  architecture: "Arquitetura",
  cpu: "Processador",
  cores: "Núcleos",
  threads: "Threads",
  ram_gb: "Memória RAM (GB)",
  gpu: "Placa de vídeo",
  gpu_driver: "Driver de vídeo",
  manufacturer: "Fabricante",
  model: "Modelo",
  bios: "BIOS / UEFI",
  release: "Data de release",
};

function formatDataValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return Object.entries(item as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v ?? "—"}`)
            .join(" · ");
        }
        return String(item);
      })
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${v ?? "—"}`)
      .join(" · ");
  }
  return String(value);
}

function ResultPanel({
  result,
  onClose,
}: {
  result: {
    action: string;
    success: boolean;
    message: string;
    output?: string;
    data?: any;
    path?: string;
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const diskpartCommands: Array<{
    command: string;
    title: string;
    description: string;
    risk: string;
    example: string;
  }> = Array.isArray(result.data?.commands) ? result.data.commands : [];
  const isDiskpartGuide = diskpartCommands.length > 0;
  const diskInventory =
    result.data && (Array.isArray(result.data.disks) || Array.isArray(result.data.volumes))
      ? {
          disks: Array.isArray(result.data.disks) ? result.data.disks : [],
          volumes: Array.isArray(result.data.volumes) ? result.data.volumes : [],
        }
      : null;

  const dataEntries =
    result.data && typeof result.data === "object" && !Array.isArray(result.data) && !isDiskpartGuide && !diskInventory
      ? Object.entries(result.data as Record<string, unknown>).filter(([k]) => k !== "commands")
      : [];

  const textToCopy = [
    result.action,
    result.message,
    result.path ? `Arquivo: ${result.path}` : "",
    isDiskpartGuide
      ? diskpartCommands
          .map((c) => `${c.command} — ${c.title}\n${c.description}\nExemplo: ${c.example}`)
          .join("\n\n")
      : dataEntries.length
        ? dataEntries.map(([k, v]) => `${DATA_LABELS[k] ?? k}: ${formatDataValue(v)}`).join("\n")
        : "",
    result.output ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const riskStyle = (risk: string) => {
    if (risk === "danger") return "bg-rose-50 text-rose-700 border-rose-200";
    if (risk === "caution") return "bg-amber-50 text-amber-800 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };
  const riskLabel = (risk: string) => {
    if (risk === "danger") return "Destrutivo";
    if (risk === "caution") return "Atenção";
    return "Seguro";
  };

  return (
    <div className="result-panel fixed inset-x-3 bottom-3 z-50 mx-auto flex max-h-[min(78vh,720px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,.22)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:left-auto">
      <div className="result-panel__header flex items-start gap-3 px-5 py-4">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            result.success ? "result-panel__badge-ok" : "result-panel__badge-err"
          }`}
        >
          <Icon name={result.success ? "check" : "warning"} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="result-panel__eyebrow text-[9px] font-bold uppercase tracking-[.14em]">Resultado da operação</p>
          <h3 className="result-panel__title mt-0.5 truncate text-[15px] font-semibold tracking-tight">{result.action}</h3>
          <p className={`result-panel__message mt-1 text-[11px] leading-5 ${result.success ? "" : "result-panel__message--error"}`}>
            {result.message}
          </p>
          {result.path && (
            <p className="result-panel__path mt-1 truncate font-mono text-[9px]" title={result.path}>
              {result.path}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={copyAll} className="result-panel__btn">
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="result-panel__icon-btn grid h-8 w-8 place-items-center rounded-lg"
            aria-label="Fechar resultado"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      <div className="result-panel__body min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isDiskpartGuide && (
          <div className="mb-4 space-y-3">
            {result.data?.warning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-900">
                <strong className="font-semibold">Atenção: </strong>
                {String(result.data.warning)}
              </div>
            )}
            <div className="result-panel__card overflow-hidden rounded-xl">
              <div className="result-panel__card-head flex items-center justify-between px-4 py-2.5">
                <p className="text-[10px] font-semibold">{String(result.data?.guide_title ?? "Comandos Diskpart")}</p>
                <span className="result-panel__meta text-[8px] font-medium uppercase tracking-wide">
                  {diskpartCommands.length} comandos
                </span>
              </div>
              <div className="divide-y divide-[#edf0f4]">
                {diskpartCommands.map((cmd) => (
                  <div key={cmd.command} className="px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <code className="rounded bg-[#0f172a] px-2 py-0.5 font-mono text-[10px] text-[#7dd3fc]">
                        {cmd.command}
                      </code>
                      <span className={`rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${riskStyle(cmd.risk)}`}>
                        {riskLabel(cmd.risk)}
                      </span>
                    </div>
                    <p className="result-panel__value text-[12px] font-semibold leading-5">{cmd.title}</p>
                    <p className="result-panel__label mt-1 text-[11px] leading-5">{cmd.description}</p>
                    <p className="result-panel__meta mt-1.5 font-mono text-[10px]">
                      Exemplo: {cmd.example}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {diskInventory && (
          <div className="mb-4 space-y-3">
            {diskInventory.disks.length > 0 && (
              <div className="result-panel__card overflow-hidden rounded-xl">
                <div className="result-panel__card-head px-4 py-2.5">
                  <p className="text-[10px] font-semibold">Discos físicos ({diskInventory.disks.length})</p>
                </div>
                <div className="divide-y divide-[#edf0f4]">
                  {diskInventory.disks.map((disk: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-2 gap-2 px-4 py-2.5 text-[11px] sm:grid-cols-4">
                      <div>
                        <p className="result-panel__label text-[9px]">Número</p>
                        <p className="result-panel__value font-semibold">{disk.Number ?? disk.number ?? "—"}</p>
                      </div>
                      <div>
                        <p className="result-panel__label text-[9px]">Nome</p>
                        <p className="result-panel__value font-semibold">{disk.FriendlyName ?? disk.friendlyName ?? "—"}</p>
                      </div>
                      <div>
                        <p className="result-panel__label text-[9px]">Status</p>
                        <p className="result-panel__value font-semibold">{disk.OperationalStatus ?? disk.operationalStatus ?? "—"}</p>
                      </div>
                      <div>
                        <p className="result-panel__label text-[9px]">Estilo</p>
                        <p className="result-panel__value font-semibold">{disk.PartitionStyle ?? disk.partitionStyle ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diskInventory.volumes.length > 0 && (
              <div className="result-panel__card overflow-hidden rounded-xl">
                <div className="result-panel__card-head px-4 py-2.5">
                  <p className="text-[10px] font-semibold">Volumes ({diskInventory.volumes.length})</p>
                </div>
                <div className="divide-y divide-[#edf0f4]">
                  {diskInventory.volumes.map((vol: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-2 gap-2 px-4 py-2.5 text-[11px] sm:grid-cols-4">
                      <div>
                        <p className="result-panel__label text-[9px]">Letra</p>
                        <p className="result-panel__value font-semibold">{vol.DriveLetter ?? vol.driveLetter ?? "—"}</p>
                      </div>
                      <div>
                        <p className="result-panel__label text-[9px]">Rótulo</p>
                        <p className="result-panel__value font-semibold">{vol.FileSystemLabel ?? vol.fileSystemLabel ?? "—"}</p>
                      </div>
                      <div>
                        <p className="result-panel__label text-[9px]">Sistema</p>
                        <p className="result-panel__value font-semibold">{vol.FileSystem ?? vol.fileSystem ?? "—"}</p>
                      </div>
                      <div>
                        <p className="result-panel__label text-[9px]">Saúde</p>
                        <p className="result-panel__value font-semibold">{vol.HealthStatus ?? vol.healthStatus ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {dataEntries.length > 0 && (
          <div className="result-panel__card mb-4 overflow-hidden rounded-xl">
            <div className="result-panel__card-head px-4 py-2.5">
              <p className="text-[10px] font-semibold">Dados consultados</p>
            </div>
            <dl>
              {dataEntries.map(([key, value]) => (
                <div key={key} className="result-panel__row grid grid-cols-[minmax(110px,34%)_1fr] gap-3 px-4 py-2.5">
                  <dt className="result-panel__label text-[10px] font-medium">{DATA_LABELS[key] ?? key}</dt>
                  <dd className="result-panel__value whitespace-pre-wrap break-words text-[11px] font-medium leading-5">
                    {formatDataValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {result.output && !isDiskpartGuide ? (
          <div className="result-panel__output overflow-hidden rounded-xl">
            <div className="result-panel__output-head flex items-center justify-between px-4 py-2.5">
              <p className="text-[10px] font-semibold">Saída completa</p>
              <span className="result-panel__meta text-[8px] font-medium uppercase tracking-wide">
                {result.output.length.toLocaleString("pt-BR")} caracteres
              </span>
            </div>
            <pre className="result-panel__pre max-h-[min(42vh,360px)] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[10px] leading-5">
              {result.output}
            </pre>
          </div>
        ) : (
          !dataEntries.length && !isDiskpartGuide && !diskInventory && (
            <p className="result-panel__empty rounded-xl px-4 py-6 text-center text-[11px]">
              Esta operação não retornou saída textual adicional.
            </p>
          )
        )}
      </div>

      <div className="result-panel__footer flex items-center justify-between gap-3 px-5 py-3">
        <p className="result-panel__hint text-[9px]">O painel permanece aberto até você fechar.</p>
        <button type="button" onClick={onClose} className="result-panel__primary">
          Fechar
        </button>
      </div>
    </div>
  );
}

function NotesPanel() {
  const [text, setText] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notesPath, setNotesPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ success?: boolean; text?: string; path?: string; message?: string }>("/notes", 10_000);
        if (cancelled) return;
        setText(typeof data.text === "string" ? data.text : "");
        setNotesPath(data.path ?? null);
        setLoadError(null);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Não foi possível carregar as notas do backend.");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !dirty) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await apiRequest<{ success?: boolean; path?: string; message?: string }>(
          "/notes",
          { method: "POST", body: JSON.stringify({ text }) },
          15_000,
        );
        setNotesPath(result.path ?? notesPath);
        setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setDirty(false);
        setLoadError(null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Falha ao salvar notas.");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [text, dirty, ready, notesPath]);

  function clearNotes() {
    setText("");
    setDirty(true);
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <section className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-[#e1e5ec] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.02)] md:flex-row md:items-center md:p-7">
        <div className="flex items-start gap-4">
          <span className="icon-box blue !h-11 !w-11 shrink-0">
            <Icon name="note" size={21} />
          </span>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#0878f9]">Recurso local</p>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-.03em] text-[#172136]">Bloco de notas</h2>
            <p className="mt-1.5 max-w-[560px] text-[10px] leading-5 text-slate-500">
              Anote observações do atendimento, serial ou checklist. O texto é gravado em arquivo no PC pelo backend — funciona no navegador e no futuro .exe.
            </p>
            {notesPath && (
              <p className="mt-1 font-mono text-[9px] text-[#0878f9]" title={notesPath}>
                {notesPath}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyNotes}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:border-[#a9c9f1] hover:text-[#0878f9]"
          >
            Copiar
          </button>
          <button
            type="button"
            onClick={clearNotes}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:border-rose-200 hover:text-rose-600"
          >
            Limpar
          </button>
        </div>
      </section>

      {loadError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-800">
          {loadError} Confirme que o backend WinHood está em execução.
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
        <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-3">
          <p className="text-[11px] font-semibold text-[#172136]">Anotações</p>
          <p className="text-[9px] text-slate-400">
            {!ready ? "Carregando…" : dirty ? "Salvando…" : savedAt ? `Salvo às ${savedAt}` : "Pronto"}
            {" · "}
            {text.length.toLocaleString("pt-BR")} caracteres
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          placeholder={"Escreva aqui suas anotações…\n\nExemplos:\n• Serial / patrimônio\n• Problema relatado\n• Passos já executados\n• Próxima ação"}
          className="min-h-[min(58vh,520px)] w-full resize-y bg-transparent px-5 py-4 text-[13px] leading-6 text-[#172136] outline-none placeholder:text-slate-400"
          spellCheck
        />
      </section>
    </div>
  );
}

function StatusMetric({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: IconName; color: string }) {
  return <div className="flex items-center gap-3 bg-white px-5 py-[18px]"><span className={`icon-box small ${color}`}><Icon name={icon} size={15} /></span><div><p className="text-[9px] text-slate-400">{label}</p><p className="mt-0.5 text-[11px] font-semibold">{value}</p><p className="mt-0.5 text-[8px] text-slate-400">{sub}</p></div></div>;
}

function ResourceBar({ name, value, detail, color }: { name: string; value: number; detail: string; color: string }) {
  return <div><div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-medium text-slate-600">{name}</span><span className="text-[9px] text-slate-400">{detail}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} /></div></div>;
}

function DeviceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-white/[.06] pb-2.5 last:border-0"><dt className="text-slate-400">{label}</dt><dd className="font-medium text-slate-200">{value}</dd></div>;
}

function ToolPanel({ module, onOpen }: { module: ToolModule; onOpen: (action: ToolAction) => void }) {
  const [selectedAction, setSelectedAction] = useState(module.actions[0]?.title ?? "");

  return (
    <div>
      <section className="relative mb-5 overflow-hidden rounded-2xl bg-[#142039] px-6 py-7 text-white md:px-8 md:py-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#0878f9]/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className={`icon-box ${module.accent} mt-0.5 !h-11 !w-11 shrink-0`}><Icon name={module.icon} size={21} /></span>
            <div>
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[.18em] text-[#65adff]">{module.eyebrow}</p>
              <h2 className="text-[23px] font-semibold tracking-[-.03em]">{module.title}</h2>
              <p className="mt-2 max-w-[590px] text-[11px] leading-5 text-slate-400">{module.description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-3 text-[10px] text-slate-300">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
            {module.status}
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        {module.stats.map((stat, index) => (
          <div key={stat.label} className="rounded-[13px] border border-[#e1e5ec] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.02)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[9px] font-medium text-slate-400">{stat.label}</p>
              <span className={`h-1.5 w-1.5 rounded-full ${index === 2 ? "bg-violet-400" : index === 1 ? "bg-emerald-400" : "bg-[#0878f9]"}`} />
            </div>
            <p className="text-[17px] font-semibold tracking-tight text-[#182236]">{stat.value}</p>
            <p className="mt-1 text-[9px] text-slate-400">{stat.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
        <div className="rounded-[14px] border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
          <div className="border-b border-[#edf0f4] px-5 py-4">
            <h3 className="text-[12px] font-semibold">Ferramentas disponíveis</h3>
            <p className="mt-0.5 text-[9px] text-slate-400">Selecione uma rotina para visualizar os detalhes</p>
          </div>
          <div className="divide-y divide-[#edf0f4] px-3 py-1.5">
            {module.actions.map((action) => (
              <button
                key={action.title}
                onClick={() => setSelectedAction(action.title)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition ${selectedAction === action.title ? "bg-[#f3f7fd]" : "hover:bg-slate-50"}`}
              >
                <span className={`icon-box small ${action.danger ? "orange" : module.accent}`}><Icon name={action.icon} size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[#1b2639]">{action.title}</p>
                    {action.danger && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-amber-700">Atenção</span>}
                  </div>
                  <p className="mt-1 truncate text-[9px] text-slate-400">{action.description}</p>
                </div>
                <span className="hidden text-[8px] text-slate-400 sm:block">{action.meta}</span>
                <span className={`text-slate-300 transition group-hover:translate-x-0.5 ${selectedAction === action.title ? "text-[#0878f9]" : ""}`}><Icon name="chevron" size={15} /></span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[14px] border border-[#e1e5ec] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.02)]">
            {(() => {
              const selected = module.actions.find((action) => action.title === selectedAction) ?? module.actions[0];
              return <>
                <div className="mb-4 flex items-center gap-3">
                  <span className={`icon-box ${selected.danger ? "orange" : module.accent}`}><Icon name={selected.icon} size={18} /></span>
                  <div><p className="text-[9px] text-slate-400">Ação selecionada</p><h3 className="mt-0.5 text-[12px] font-semibold">{selected.title}</h3></div>
                </div>
                <p className="text-[10px] leading-[1.7] text-slate-500">{selected.description}</p>
                <div className="my-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[9px] text-slate-500"><Icon name="clock" size={13} /><span>{selected.meta}</span></div>
                {selected.danger && <div className="mb-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-[9px] leading-4 text-amber-800"><span className="shrink-0"><Icon name="warning" size={14} /></span>Esta ação altera configurações do sistema e exige privilégios administrativos.</div>}
                <button onClick={() => onOpen(selected)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0878f9] py-2.5 text-[10px] font-semibold text-white shadow-[0_5px_15px_rgba(8,120,249,.18)] hover:bg-[#006be6]">Abrir painel <Icon name="chevron" size={13} /></button>
              </>;
            })()}
          </div>

          <div className="flex gap-3 rounded-[13px] border border-[#dde5ef] bg-[#f8fbff] p-4">
            <span className="mt-0.5 shrink-0 text-[#0878f9]"><Icon name="info" size={16} /></span>
            <div><p className="text-[10px] font-semibold text-[#27364d]">Informação importante</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{module.note}</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}

const moduleOptions: Record<string, string[]> = {
  "Limpeza de arquivos": ["Analisar antes de remover", "Incluir todos os usuários", "Criar log detalhado", "Fechar aplicativos em uso"],
  "Reparo do sistema": ["Criar ponto de restauração", "Verificar componentes online", "Registrar resultados no log", "Reiniciar se necessário"],
  "Instalar programas": ["Aceitar termos dos pacotes", "Instalação silenciosa", "Criar atalho no menu Iniciar", "Atualizar fontes do Winget"],
  "Ajustes de desempenho": ["Salvar configurações atuais", "Aplicar ao usuário atual", "Otimizar plano de energia", "Reiniciar serviços afetados"],
  "Drivers e BIOS": ["Criar ponto de restauração", "Verificar compatibilidade", "Baixar somente fontes oficiais", "Manter instalador local"],
  "Monitor e resolução": ["Aplicar ao monitor principal", "Manter proporção recomendada", "Detectar alterações de hardware", "Reverter após 15 segundos"],
  "Ferramentas de rede": ["Salvar configuração atual", "Liberar cache local", "Renovar parâmetros DHCP", "Executar teste ao concluir"],
  "Informações do computador": ["Incluir dados do Windows", "Incluir hardware e drivers", "Ocultar identificadores sensíveis", "Salvar relatório em texto"],
  "Backups e logs": ["Adicionar data ao arquivo", "Compactar resultado", "Manter últimos 30 dias", "Validar arquivo ao concluir"],
  "Gerenciar discos": ["Modo somente leitura", "Listar volumes ocultos", "Exibir identificadores físicos", "Registrar comandos executados"],
};

const actionCommands: Record<string, string> = {
  "Limpeza rápida": "cleanmgr /verylowdisk",
  "Limpeza avançada": "cleanmgr /sageset:1 && cleanmgr /sagerun:1",
  "Limpeza do Windows Update": "DISM /Online /Cleanup-Image /StartComponentCleanup",
  "Criar ponto de restauração": "Checkpoint-Computer -RestorePointType MODIFY_SETTINGS",
  "Verificar arquivos com SFC": "sfc /scannow",
  "Reparar imagem com DISM": "DISM /Online /Cleanup-Image /RestoreHealth",
  "Atualizar todos os programas": "winget upgrade --all",
  "Otimização de SSD": "fsutil behavior set DisableDeleteNotify 0",
  "Gerenciar inicialização": "start ms-settings:startupapps",
  "Abrir configurações de vídeo": "start ms-settings:display",
  "Exibição avançada": "start ms-settings:display-advanced",
  "Limpar cache DNS": "ipconfig /flushdns",
  "Renovar endereço IP": "ipconfig /release && ipconfig /renew",
  "Redefinir rede": "netsh winsock reset && netsh int ip reset",
  "Abrir MSInfo32": "msinfo32",
  "Abrir Gerenciamento de Disco": "diskmgmt.msc",
  "Listar discos e volumes": "diskpart /s list-volumes.txt",
  "Iniciar Diskpart": "diskpart",
};

function ToolSubpanel({
  module,
  action,
  onBack,
  onRun,
}: {
  module: ToolModule;
  action: ToolAction;
  onBack: () => void;
  onRun: (action: string) => void;
}) {
  const options = moduleOptions[module.title] ?? ["Criar log detalhado", "Validar antes de executar", "Exibir resultado ao concluir"];
  const [enabled, setEnabled] = useState(() => options.map((_, index) => index !== options.length - 1));
  const [mode, setMode] = useState<"recommended" | "custom">("recommended");
  const [expandedLog, setExpandedLog] = useState(false);
  const [packages, setPackages] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [installingPackages, setInstallingPackages] = useState(false);
  const [packageMessage, setPackageMessage] = useState<string | null>(null);
  const command = actionCommands[action.title] ?? `${module.eyebrow.toLowerCase()} :: ${action.title.toLowerCase()}`;

  const isPackageCategory = module.title === "Instalar programas" && action.title !== "Atualizar todos os programas";
  const isDiskModule = module.title === "Gerenciar discos";

  const diskActionHelp: Record<string, { what: string; does: string; risk: string; tip: string }> = {
    "Abrir Gerenciamento de Disco": {
      what: "Ferramenta gráfica nativa do Windows",
      does: "Abre diskmgmt.msc para visualizar discos, criar/excluir volumes, alterar letras e formatar com interface visual.",
      risk: "Baixo se você apenas visualizar. Médio ao formatar ou excluir volumes.",
      tip: "Prefira esta opção se não estiver familiarizado com linha de comando.",
    },
    "Listar discos e volumes": {
      what: "Consulta segura via PowerShell/WMI",
      does: "Lê e exibe discos físicos e volumes atuais no painel de resultado, sem modificar o armazenamento.",
      risk: "Nenhum — operação somente leitura.",
      tip: "Use antes de qualquer alteração para identificar o número do disco e a letra do volume corretos.",
    },
    "Guia de comandos Diskpart": {
      what: "Referência educativa dos comandos Diskpart",
      does: "Mostra cada comando com título, explicação, nível de risco (seguro / atenção / destrutivo) e exemplo pronto.",
      risk: "Nenhum — não executa comandos no disco.",
      tip: "Consulte o guia antes de abrir o console Diskpart interativo.",
    },
    "Iniciar Diskpart": {
      what: "Console interativo diskpart.exe",
      does: "Abre o prompt do Diskpart. A partir daí, os comandos que você digitar atuam no disco selecionado.",
      risk: "Alto — clean, format e convert podem apagar dados de forma permanente.",
      tip: "Sempre rode list disk e select disk N com cuidado. Confirme o número do disco duas vezes.",
    },
  };
  const diskHelp = isDiskModule ? diskActionHelp[action.title] : null;

  useEffect(() => {
    if (!isPackageCategory) {
      setPackages([]);
      setSelectedPackages([]);
      return;
    }
    apiGet<{ packages: Array<{ id: string; name: string }> }>(`/packages?category=${encodeURIComponent(action.title)}`)
      .then((result) => {
        setPackages(result.packages);
        setSelectedPackages(result.packages.slice(0, 3).map((item) => item.id));
      })
      .catch(() => {
        setPackages([]);
        setSelectedPackages([]);
      });
  }, [action.title, isPackageCategory]);

  async function installSelectedPackages() {
    const selected = packages.filter((item) => selectedPackages.includes(item.id));
    if (!selected.length) {
      setPackageMessage("Selecione pelo menos um pacote.");
      return;
    }
    setInstallingPackages(true);
    try {
      const result = await apiInstall(selected);
      const ok = result.results?.filter((item) => item.success).length ?? 0;
      setPackageMessage(`${ok}/${selected.length} pacote(s) instalado(s) com sucesso.`);
    } catch (error) {
      setPackageMessage(error instanceof Error ? error.message : "Falha ao instalar pacotes.");
    } finally {
      setInstallingPackages(false);
    }
  }

  function toggleOption(index: number) {
    setMode("custom");
    setEnabled((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value));
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-[9px] font-medium text-slate-400">
        <button onClick={onBack} className="transition hover:text-[#0878f9]">{module.title}</button>
        <Icon name="chevron" size={11} />
        <span className="text-slate-700">{action.title}</span>
      </div>

      <section className="mb-5 flex flex-col justify-between gap-5 rounded-2xl border border-[#e1e5ec] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.02)] md:flex-row md:items-center md:p-7">
        <div className="flex items-start gap-4">
          <button onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[#a9c9f1] hover:text-[#0878f9]" aria-label="Voltar">
            <span className="rotate-180"><Icon name="chevron" size={16} /></span>
          </button>
          <span className={`icon-box ${action.danger ? "orange" : module.accent} !h-11 !w-11 shrink-0`}><Icon name={action.icon} size={21} /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#0878f9]">Painel da funcionalidade</p>
              {action.danger && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-amber-700">Ação avançada</span>}
            </div>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-.03em] text-[#172136]">{action.title}</h2>
            <p className="mt-1.5 max-w-[630px] text-[10px] leading-5 text-slate-500">{action.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-[#f4f8fd] px-4 py-3 text-[9px] font-medium text-slate-500">
          <Icon name="clock" size={14} /><span>{action.meta}</span>
        </div>
      </section>

      {diskHelp && (
        <section className="mb-5 overflow-hidden rounded-2xl border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
          <div className="border-b border-[#edf0f4] px-5 py-3">
            <p className="text-[11px] font-semibold text-[#172136]">O que esta função faz</p>
            <p className="mt-0.5 text-[9px] text-slate-400">Leia antes de executar — explicação objetiva do comportamento e do risco.</p>
          </div>
          <div className="grid gap-0 sm:grid-cols-2">
            <div className="border-b border-[#edf0f4] px-5 py-4 sm:border-b-0 sm:border-r">
              <p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">O que é</p>
              <p className="mt-1.5 text-[12px] font-semibold leading-5 text-[#172136]">{diskHelp.what}</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">{diskHelp.does}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">Risco</p>
              <p className={`mt-1.5 text-[12px] font-semibold leading-5 ${action.danger ? "text-rose-700" : "text-emerald-700"}`}>
                {diskHelp.risk}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">
                <span className="font-semibold text-[#172136]">Dica: </span>
                {diskHelp.tip}
              </p>
            </div>
          </div>
          {action.title === "Guia de comandos Diskpart" && (
            <div className="border-t border-[#edf0f4] bg-[#f8fafc] px-5 py-3 text-[10px] leading-5 text-slate-600">
              Ao executar, o painel de resultado listará cada comando com etiqueta <strong>Seguro</strong>, <strong>Atenção</strong> ou <strong>Destrutivo</strong>, além de exemplo de uso.
            </div>
          )}
          {action.title === "Iniciar Diskpart" && (
            <div className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-[10px] leading-5 text-rose-800">
              O WinHood apenas abre o console. Qualquer comando digitado no Diskpart é de sua responsabilidade. Nunca use <code className="rounded bg-rose-100 px-1">clean</code> no disco do sistema sem certeza absoluta.
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-4">
          {isPackageCategory && (
            <div className="rounded-[14px] border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
              <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4">
                <div><h3 className="text-[12px] font-semibold">Pacotes disponíveis</h3><p className="mt-0.5 text-[9px] text-slate-400">Selecione os aplicativos e instale somente o que precisar.</p></div>
                <button onClick={() => setSelectedPackages(packages.map((item) => item.id))} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[8px] font-semibold text-slate-500 hover:text-[#0878f9]">Selecionar todos</button>
              </div>
              <div className="grid gap-2 p-5 sm:grid-cols-2">
                {packages.map((item) => {
                  const checked = selectedPackages.includes(item.id);
                  return <button key={item.id} onClick={() => setSelectedPackages((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-[#cfe2fa] bg-[#f7fbff]" : "border-slate-200 bg-white"}`}>
                    <span className={`grid h-5 w-5 place-items-center rounded border text-white ${checked ? "border-[#0878f9] bg-[#0878f9]" : "border-slate-300"}`}>{checked && <Icon name="check" size={12} />}</span>
                    <span className="text-[9px] font-medium text-[#263650]">{item.name}</span>
                  </button>;
                })}
              </div>
              <div className="flex items-center justify-between border-t border-[#edf0f4] px-5 py-4">
                <span className="text-[9px] text-slate-400">{selectedPackages.length} selecionado(s)</span>
                <button disabled={installingPackages} onClick={installSelectedPackages} className="rounded-lg bg-[#0878f9] px-4 py-2.5 text-[9px] font-semibold text-white disabled:opacity-50">{installingPackages ? "Instalando..." : "Instalar selecionados"}</button>
              </div>
              {packageMessage && <p className="px-5 pb-4 text-[9px] font-medium text-slate-500">{packageMessage}</p>}
            </div>
          )}

          <div className="rounded-[14px] border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
            <div className="border-b border-[#edf0f4] px-5 py-4">
              <h3 className="text-[12px] font-semibold">Configuração da rotina</h3>
              <p className="mt-0.5 text-[9px] text-slate-400">Defina como a ferramenta deve ser executada</p>
            </div>
            <div className="p-5">
              <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-[#f5f7fa] p-1">
                <button onClick={() => { setMode("recommended"); setEnabled(options.map((_, index) => index !== options.length - 1)); }} className={`rounded-lg px-3 py-2.5 text-[9px] font-semibold transition ${mode === "recommended" ? "bg-white text-[#0878f9] shadow-sm" : "text-slate-400"}`}>Configuração recomendada</button>
                <button onClick={() => setMode("custom")} className={`rounded-lg px-3 py-2.5 text-[9px] font-semibold transition ${mode === "custom" ? "bg-white text-[#0878f9] shadow-sm" : "text-slate-400"}`}>Personalizar</button>
              </div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[9px] font-semibold text-slate-600">Configurações individuais</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setMode("custom"); setEnabled(options.map(() => true)); }}
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[8px] font-semibold text-slate-500 transition hover:border-[#b7d3f5] hover:text-[#0878f9]"
                  >
                    Selecionar todas
                  </button>
                  <button
                    onClick={() => { setMode("custom"); setEnabled(options.map(() => false)); }}
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[8px] font-semibold text-slate-500 transition hover:border-[#b7d3f5] hover:text-[#0878f9]"
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option, index) => (
                  <button key={option} onClick={() => toggleOption(index)} className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${enabled[index] ? "border-[#cfe2fa] bg-[#f7fbff]" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${enabled[index] ? "bg-[#0878f9]" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${enabled[index] ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                    <span className={`text-[9px] font-medium ${enabled[index] ? "text-[#263650]" : "text-slate-400"}`}>{option}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#e1e5ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]">
            <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4">
              <div><h3 className="text-[12px] font-semibold">Etapas da execução</h3><p className="mt-0.5 text-[9px] text-slate-400">Fluxo previsto para esta funcionalidade</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-semibold text-slate-500">4 etapas</span>
            </div>
            <div className="grid gap-0 p-5 sm:grid-cols-4">
              {["Preparar ambiente", "Analisar sistema", "Aplicar alterações", "Validar resultado"].map((step, index) => (
                <div key={step} className="relative flex gap-3 pb-4 last:pb-0 sm:block sm:pb-0 sm:pr-3">
                  {index < 3 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-slate-200 sm:left-7 sm:top-[13px] sm:h-px sm:w-[calc(100%-28px)]" />}
                  <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${index === 0 ? "bg-[#0878f9] text-white" : "border border-slate-200 bg-white text-slate-400"}`}>{index + 1}</span>
                  <div className="sm:mt-2"><p className="text-[9px] font-semibold text-slate-600">{step}</p><p className="mt-1 text-[8px] leading-4 text-slate-400">{index === 0 ? "Checagem de permissões" : index === 1 ? "Identificação do escopo" : index === 2 ? action.title : "Relatório e log"}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-[#26344d] bg-[#111b2e] text-white shadow-[0_8px_25px_rgba(15,24,43,.12)]">
            <button onClick={() => setExpandedLog(!expandedLog)} className="flex w-full items-center justify-between px-5 py-4 text-left">
              <span className="flex items-center gap-2 text-[10px] font-semibold"><Icon name="terminal" size={15} /> Prévia técnica</span>
              <span className={`text-slate-500 transition ${expandedLog ? "rotate-90" : ""}`}><Icon name="chevron" size={13} /></span>
            </button>
            {expandedLog && <div className="border-t border-white/[.06] px-5 py-4 font-mono text-[9px] leading-5 text-slate-400"><p className="text-emerald-400">$ Executar como administrador</p><p className="break-all text-[#7dbbff]">{command}</p><p>Destino do log: C:\ProgramData\WindowsOptimizer\logs</p><p>Modo: {mode === "recommended" ? "recomendado" : "personalizado"}</p></div>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[14px] border border-[#e1e5ec] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.02)]">
            <h3 className="text-[12px] font-semibold">Resumo da operação</h3>
            <div className="mt-4 space-y-3">
              <SummaryRow icon="shield" label="Permissão" value="Administrador" />
              <SummaryRow icon="clock" label="Duração estimada" value={action.meta.split("·").pop()?.trim() ?? "Variável"} />
              <SummaryRow icon="archive" label="Registro" value="Log automático" />
              <SummaryRow icon="check" label="Opções ativas" value={`${enabled.filter(Boolean).length} de ${options.length}`} />
            </div>
            {action.danger && <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-[9px] leading-4 text-amber-800"><span className="shrink-0"><Icon name="warning" size={14} /></span>Revise as opções antes de continuar. Esta operação pode alterar configurações do Windows.</div>}
            <button onClick={() => onRun(action.title)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0878f9] py-3 text-[10px] font-semibold text-white shadow-[0_5px_15px_rgba(8,120,249,.2)] hover:bg-[#006be6]"><Icon name="play" size={14} />Executar agora</button>
            <button onClick={onBack} className="mt-2 w-full rounded-lg py-2.5 text-[9px] font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600">Cancelar e voltar</button>
          </div>

          <div className="rounded-[14px] border border-[#dde5ef] bg-[#f8fbff] p-4">
            <div className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-[#0878f9]"><Icon name="info" size={16} /></span>
              <div><p className="text-[10px] font-semibold text-[#27364d]">Antes de executar</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{module.note}</p></div>
            </div>
            <div className="mt-3 space-y-2 border-t border-[#e4ebf4] pt-3">
              {["Salve os arquivos abertos", "Mantenha o computador ligado", "Não interrompa a operação"].map((item) => <div key={item} className="flex items-center gap-2 text-[8px] text-slate-500"><span className="text-emerald-500"><Icon name="check" size={11} /></span>{item}</div>)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return <div className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-400"><Icon name={icon} size={13} /></span><div className="min-w-0 flex-1"><p className="text-[8px] text-slate-400">{label}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-slate-600">{value}</p></div></div>;
}
