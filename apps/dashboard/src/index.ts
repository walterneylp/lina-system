import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DashboardAuthState, DashboardAuthStore } from "./auth/dashboard-auth-store";

const parseDotEnv = (): Record<string, string> => {
  if (!existsSync(".env")) {
    return {};
  }

  return readFileSync(".env", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
};

const fileEnv = parseDotEnv();
const readEnv = (key: string, fallback: string): string =>
  process.env[key] ?? fileEnv[key] ?? fallback;

const dashboardPort = Number.parseInt(readEnv("DASHBOARD_PORT", "3001"), 10);
const apiBaseUrl = readEnv("DASHBOARD_API_BASE", `http://localhost:${readEnv("APP_PORT", "3012")}`);
const dashboardAccessToken = readEnv("DASHBOARD_ACCESS_TOKEN", "");
const dashboardSupabaseUrl = readEnv("SUPABASE_URL", "");
const dashboardSupabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY", "");
const dashboardSessionValue = dashboardAccessToken
  ? createHash("sha256").update(dashboardAccessToken).digest("hex")
  : "";
const dashboardSessionCookieName = "lina_dashboard_session";
const dashboardAuthStore =
  dashboardSupabaseUrl && dashboardSupabaseServiceRoleKey
    ? new DashboardAuthStore({
        url: dashboardSupabaseUrl,
        serviceRoleKey: dashboardSupabaseServiceRoleKey,
      })
    : null;
const dashboardAuthMode = dashboardAuthStore
  ? "database"
  : dashboardAccessToken
    ? "token"
    : "open";

const sendJson = (response: ServerResponse, status: number, payload: unknown) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
};

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const parseCookies = (cookieHeader?: string): Record<string, string> =>
  (cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});

const buildSessionCookie = (value: string, maxAgeSeconds?: number): string => {
  const parts = [
    `${dashboardSessionCookieName}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];

  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }

  return parts.join("; ");
};

const clearSessionCookie = (): string => buildSessionCookie("", 0);

const isTokenAuthenticated = (request: IncomingMessage): boolean => {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[dashboardSessionCookieName] === dashboardSessionValue;
};

const loginHtml = (options?: {
  errorMessage?: string;
  authState?: DashboardAuthState | null;
  infoMessage?: string;
}): string => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LiNa Dashboard Login</title>
    <style>
      :root {
        --bg: #07111f;
        --panel: rgba(11, 19, 34, 0.9);
        --line: rgba(117, 138, 173, 0.22);
        --text: #edf4ff;
        --muted: #8da2c5;
        --accent: #ffb54d;
        --bad: #ff7b7b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(255, 181, 77, 0.12), transparent 24%),
          linear-gradient(160deg, #07111f 0%, #0a1628 55%, #09101a 100%);
        color: var(--text);
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      .layout {
        width: min(980px, calc(100% - 24px));
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 18px;
      }
      .card {
        padding: 28px;
        border-radius: 24px;
        background: var(--panel);
        border: 1px solid var(--line);
      }
      h1 {
        margin: 0 0 12px;
        font-family: "Space Grotesk", sans-serif;
        letter-spacing: -0.04em;
      }
      p { color: var(--muted); line-height: 1.6; }
      form { display: grid; gap: 12px; margin-top: 18px; }
      input, button {
        min-height: 48px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--text);
        padding: 0 14px;
      }
      button {
        border: 0;
        cursor: pointer;
        background: linear-gradient(135deg, var(--accent), #ff8b5d);
        color: #111;
        font-weight: 800;
      }
      .error {
        margin-top: 10px;
        color: var(--bad);
        font-size: 0.92rem;
      }
      .muted {
        color: var(--muted);
        font-size: 0.9rem;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        color: var(--muted);
        font-size: 0.82rem;
      }
      .success {
        color: #9fe2c5;
      }
      @media (max-width: 860px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="layout">
      <section class="card">
        <h1>LiNa Dashboard</h1>
        <p>Autenticação do painel operacional. O acesso agora é persistido no banco, com senha protegida por hash e sessão dedicada.</p>
        ${
          dashboardAuthMode === "database"
            ? `
              <div class="badge">Usuários cadastrados: ${String(options?.authState?.usersCount || 0)}</div>
              <form method="POST" action="/login">
                <input type="text" name="username" placeholder="Usuário" autocomplete="username" required />
                <input type="password" name="password" placeholder="Senha" autocomplete="current-password" required />
                <button type="submit">Entrar</button>
              </form>
              <p class="muted">O acesso inicial de administrador ${
                options?.authState?.allowAdminBootstrap ? '<span class="success">está habilitado</span>' : "está desabilitado"
              }.</p>
            `
            : `
              <form method="POST" action="/login">
                <input type="password" name="token" placeholder="Access token" required />
                <button type="submit">Entrar</button>
              </form>
            `
        }
        ${options?.errorMessage ? `<div class="error">${options.errorMessage}</div>` : ""}
      </section>
      <section class="card">
        <h1>Bootstrap Admin</h1>
        <p>Cadastre o primeiro administrador diretamente desta tela. Depois, você poderá reativar ou desativar esse fluxo na área de configurações do dashboard.</p>
        ${
          dashboardAuthMode === "database" && options?.authState?.allowAdminBootstrap
            ? `
              <form method="POST" action="/bootstrap-admin">
                <input type="text" name="username" placeholder="Usuário admin" autocomplete="username" required />
                <input type="password" name="password" placeholder="Senha" autocomplete="new-password" required />
                <input type="password" name="confirmPassword" placeholder="Confirmar senha" autocomplete="new-password" required />
                <button type="submit">Cadastrar primeiro admin</button>
              </form>
            `
            : `
              <p class="muted">O cadastro inicial está indisponível agora. Se já houver um admin ativo, reative esse fluxo na seção <strong>Configurações</strong> do dashboard.</p>
            `
        }
        ${options?.infoMessage ? `<div class="muted">${options.infoMessage}</div>` : ""}
      </section>
    </main>
  </body>
</html>`;

type DashboardRequestAuthContext = {
  mode: "database" | "token" | "open";
  isAuthenticated: boolean;
  currentUser: {
    id: string;
    username: string;
    role: string;
  } | null;
  authState: DashboardAuthState | null;
  authError?: string | null;
};

const getRequestAuthContext = async (
  request: IncomingMessage
): Promise<DashboardRequestAuthContext> => {
  if (dashboardAuthMode === "open") {
    return {
      mode: "open",
      isAuthenticated: true,
      currentUser: null,
      authState: null,
    };
  }

  if (dashboardAuthMode === "token") {
    return {
      mode: "token",
      isAuthenticated: isTokenAuthenticated(request),
      currentUser: isTokenAuthenticated(request)
        ? {
            id: "legacy-token",
            username: "legacy-admin",
            role: "admin",
          }
        : null,
      authState: null,
    };
  }

  try {
    const authState = await dashboardAuthStore!.getAuthState();
    const token = parseCookies(request.headers.cookie)[dashboardSessionCookieName];
    const currentUser = await dashboardAuthStore!.getUserFromSession(token);

    return {
      mode: "database",
      isAuthenticated: Boolean(currentUser),
      currentUser: currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
          }
        : null,
      authState,
      authError: null,
    };
  } catch (error) {
    return {
      mode: "database",
      isAuthenticated: false,
      currentUser: null,
      authState: null,
      authError:
        error instanceof Error
          ? `Auth schema do dashboard ainda não está pronta: ${error.message}. Aplique a migration 003_dashboard_auth.sql.`
          : "Auth schema do dashboard ainda não está pronta. Aplique a migration 003_dashboard_auth.sql.",
    };
  }
};

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LiNa Control Room</title>
    <style>
      :root {
        --bg: #08111f;
        --bg-soft: #111d31;
        --panel: rgba(11, 19, 34, 0.88);
        --panel-strong: #0c1627;
        --line: rgba(117, 138, 173, 0.22);
        --text: #edf4ff;
        --muted: #8da2c5;
        --accent: #ffb54d;
        --accent-soft: rgba(255, 181, 77, 0.18);
        --good: #54d2a7;
        --warn: #ffd36e;
        --bad: #ff7b7b;
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
        --radius: 24px;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(255, 181, 77, 0.12), transparent 24%),
          radial-gradient(circle at bottom right, rgba(84, 210, 167, 0.12), transparent 20%),
          linear-gradient(160deg, #07111f 0%, #0a1628 55%, #09101a 100%);
      }

      .shell {
        width: min(1440px, calc(100% - 32px));
        margin: 20px auto 40px;
      }

      .hero {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 18px;
        margin-bottom: 18px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      .hero-main {
        padding: 28px;
        position: relative;
        overflow: hidden;
      }

      .hero-main::after {
        content: "";
        position: absolute;
        inset: auto -10% -45% 40%;
        height: 240px;
        background: radial-gradient(circle, rgba(255,181,77,0.28), transparent 60%);
        pointer-events: none;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .pulse {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--good);
        box-shadow: 0 0 0 0 rgba(84, 210, 167, 0.6);
        animation: pulse 1.8s infinite;
      }

      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(84, 210, 167, 0.6); }
        70% { box-shadow: 0 0 0 16px rgba(84, 210, 167, 0); }
        100% { box-shadow: 0 0 0 0 rgba(84, 210, 167, 0); }
      }

      h1 {
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
        font-size: clamp(2.4rem, 4vw, 4.8rem);
        line-height: 0.96;
        letter-spacing: -0.05em;
        margin: 18px 0 14px;
        max-width: 10ch;
      }

      .hero-copy {
        color: var(--muted);
        max-width: 60ch;
        font-size: 1rem;
        line-height: 1.65;
      }

      .hero-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 22px;
      }

      .metric {
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.05);
      }

      .metric-label {
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .metric-value {
        margin-top: 10px;
        font-size: 1.8rem;
        font-weight: 700;
      }

      .metric-note {
        margin-top: 8px;
        color: var(--muted);
        font-size: 0.78rem;
      }

      .hero-side {
        padding: 22px;
        display: grid;
        gap: 14px;
      }

      .status-stack {
        display: grid;
        gap: 10px;
      }

      .status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
      }

      .status-row strong {
        display: block;
        font-size: 0.95rem;
      }

      .status-row span {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.82rem;
      }

      .badge {
        padding: 8px 10px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .badge.ok { background: rgba(84, 210, 167, 0.14); color: var(--good); }
      .badge.warn { background: rgba(255, 211, 110, 0.14); color: var(--warn); }
      .badge.bad { background: rgba(255, 123, 123, 0.14); color: var(--bad); }
      .badge.neutral { background: rgba(141, 162, 197, 0.14); color: var(--muted); }

      .toolbar {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
        flex-wrap: wrap;
      }

      .toolbar button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), #ff8b5d);
        color: #111;
        font-weight: 800;
        padding: 12px 18px;
        cursor: pointer;
      }

      .toolbar-group {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      .toolbar small {
        color: var(--muted);
      }

      .view-nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }

      .view-tab {
        appearance: none;
        min-height: 42px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--muted);
        cursor: pointer;
        font-weight: 700;
      }

      .view-tab.active {
        background: linear-gradient(135deg, var(--accent), #ff8b5d);
        color: #111;
        border-color: transparent;
      }

      .workspace.is-overview {
        display: none;
      }

      [data-view-panel] {
        display: none;
      }

      [data-view-panel].active {
        display: block;
      }

      .user-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--muted);
        font-size: 0.86rem;
      }

      .control,
      .task-form input,
      .task-form select,
      .composer-form textarea {
        min-height: 44px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--text);
        padding: 10px 14px;
      }

      .control::placeholder,
      .task-form input::placeholder {
        color: var(--muted);
      }

      .toolbar label,
      .task-form label,
      .composer-form label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 0.82rem;
      }

      .task-form {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto auto;
        gap: 12px;
        margin-bottom: 18px;
      }

      .task-form button,
      .composer-form button,
      .task-action {
        appearance: none;
        border: 0;
        cursor: pointer;
        min-height: 44px;
        border-radius: 14px;
        padding: 10px 14px;
        font-weight: 700;
      }

      .task-form button {
        background: rgba(84, 210, 167, 0.16);
        color: var(--good);
      }

      .composer-form {
        display: grid;
        gap: 12px;
        margin-bottom: 18px;
      }

      .composer-form textarea {
        min-height: 112px;
        resize: vertical;
        font-family: inherit;
      }

      .composer-grid {
        display: grid;
        grid-template-columns: 1fr minmax(180px, 220px) auto;
        gap: 12px;
        align-items: end;
      }

      .composer-form button {
        background: linear-gradient(135deg, var(--accent), #ff8b5d);
        color: #111;
        font-weight: 800;
      }

      .composer-result {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
      }

      .task-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
      }

      .task-action {
        background: rgba(255,255,255,0.05);
        color: var(--text);
      }

      .task-action[data-status="running"] { color: var(--warn); }
      .task-action[data-status="completed"] { color: var(--good); }
      .task-action[data-status="failed"] { color: var(--bad); }

      .section-tools {
        display: flex;
        gap: 12px;
        margin-bottom: 14px;
        flex-wrap: wrap;
      }

      .section-tools .control {
        min-width: 170px;
      }

      .content-grid {
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: 18px;
      }

      .section {
        padding: 22px;
      }

      .section h2 {
        margin: 0 0 6px;
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
        letter-spacing: -0.03em;
      }

      .section-head {
        margin-bottom: 18px;
      }

      .section-head p {
        margin: 0;
        color: var(--muted);
      }

      .feed {
        display: grid;
        gap: 10px;
      }

      .feed-item {
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.025);
      }

      .feed-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: space-between;
        margin-bottom: 10px;
        color: var(--muted);
        font-size: 0.78rem;
      }

      .feed-title {
        font-weight: 700;
        margin-bottom: 8px;
      }

      .feed-body {
        color: #dbe6f7;
        white-space: pre-wrap;
        line-height: 1.55;
        word-break: break-word;
      }

      .feed-submeta {
        margin-top: 10px;
        color: var(--muted);
        font-size: 0.8rem;
      }

      .provider-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .provider-card {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
      }

      .provider-card h3 {
        margin: 0 0 10px;
        font-size: 1rem;
      }

      .provider-card p {
        margin: 0;
        color: var(--muted);
        font-size: 0.88rem;
      }

      .empty {
        padding: 18px;
        border-radius: 16px;
        border: 1px dashed rgba(255,255,255,0.1);
        color: var(--muted);
      }

      @media (max-width: 1100px) {
        .hero,
        .content-grid {
          grid-template-columns: 1fr;
        }

        .hero-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100% - 20px, 1440px);
          margin-top: 10px;
        }

        .hero-main,
        .hero-side,
        .section {
          padding: 18px;
        }

        .hero-grid,
        .provider-grid {
          grid-template-columns: 1fr;
        }

        .toolbar {
          flex-direction: column;
          align-items: stretch;
        }

        .view-nav {
          flex-direction: column;
        }

        .task-form {
          grid-template-columns: 1fr;
        }

        .composer-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <article class="panel hero-main">
          <div class="eyebrow"><span class="pulse"></span> LiNa Control Room</div>
          <h1>Operational visibility for the live agent runtime.</h1>
          <p class="hero-copy">
            Dashboard de observabilidade para acompanhar saúde do sistema, providers,
            Telegram, Supabase, mensagens recentes e atividade operacional da LiNa.
          </p>
          <div class="hero-grid">
            <div class="metric">
              <div class="metric-label">Status Geral</div>
              <div class="metric-value" id="metric-health">...</div>
              <div class="metric-note" id="metric-persistence">Persistência n/a</div>
            </div>
            <div class="metric">
              <div class="metric-label">Mensagens</div>
              <div class="metric-value" id="metric-messages">0</div>
              <div class="metric-note" id="metric-telegram-messages">Telegram 0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Tarefas</div>
              <div class="metric-value" id="metric-tasks">0</div>
              <div class="metric-note" id="metric-pending-tasks">Pendentes 0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Providers Ativos</div>
              <div class="metric-value" id="metric-providers">0</div>
              <div class="metric-note" id="metric-default-provider">Default n/a</div>
            </div>
            <div class="metric">
              <div class="metric-label">Chats Telegram</div>
              <div class="metric-value" id="metric-telegram-chats">0</div>
              <div class="metric-note" id="metric-telegram-users">Usuários 0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Execuções</div>
              <div class="metric-value" id="metric-executions">0</div>
              <div class="metric-note" id="metric-execution-success">Sucesso n/a</div>
            </div>
            <div class="metric">
              <div class="metric-label">Falhas</div>
              <div class="metric-value" id="metric-failures">0</div>
              <div class="metric-note" id="metric-running-tasks">Running 0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Atividade</div>
              <div class="metric-value" id="metric-last-activity">n/a</div>
              <div class="metric-note" id="metric-last-source">Sem origem recente</div>
            </div>
          </div>
        </article>
        <aside class="panel hero-side">
          <div class="section-head">
            <h2>Runtime</h2>
            <p>Estado do backend, persistência e Telegram em tempo real.</p>
          </div>
          <div class="status-stack" id="status-stack"></div>
        </aside>
      </section>

      <nav class="view-nav" id="view-nav">
        <button class="view-tab active" data-view="overview" type="button">Visão Geral</button>
        <button class="view-tab" data-view="infra" type="button">Infra</button>
        <button class="view-tab" data-view="composer" type="button">Composer</button>
        <button class="view-tab" data-view="tasks" type="button">Tarefas</button>
        <button class="view-tab" data-view="messages" type="button">Mensagens</button>
        <button class="view-tab" data-view="telegram" type="button">Telegram</button>
        <button class="view-tab" data-view="executions" type="button">Execuções</button>
        <button class="view-tab" data-view="logs" type="button">Logs</button>
        <button class="view-tab" data-view="settings" type="button">Configurações</button>
      </nav>

      <section class="workspace is-overview" id="workspace">
        <div class="toolbar">
          <div class="toolbar-group">
            <button id="refresh-button" type="button">Atualizar Agora</button>
            <label>
              Filtrar mensagens
              <input id="message-filter" class="control" type="text" placeholder="role, conteúdo, data..." />
            </label>
            <label>
              Filtrar logs
              <input id="log-filter" class="control" type="text" placeholder="level, mensagem..." />
            </label>
          </div>
          <div class="toolbar-group">
            <div class="user-pill" id="current-user-pill">Sem sessão identificada</div>
            <small id="last-updated">Aguardando primeira carga...</small>
            <button id="logout-button" type="button">Sair</button>
          </div>
        </div>

        <section class="content-grid">
        <article class="panel section" data-view-panel="composer">
          <div class="section-head">
            <h2>Composer</h2>
            <p>Dispare execuções do orquestrador diretamente pelo painel.</p>
          </div>
          <form class="composer-form" id="composer-form">
            <label>
              Prompt
              <textarea id="composer-text" placeholder="Ex: resuma o status atual da LiNa em 3 linhas" required></textarea>
            </label>
            <div class="composer-grid">
              <label>
                Vincular à tarefa
                <select id="composer-task">
                  <option value="">Sem tarefa</option>
                </select>
              </label>
              <div></div>
              <button type="submit">Executar</button>
            </div>
          </form>
          <div class="composer-result" id="composer-result">Nenhuma execução disparada nesta sessão do painel.</div>
        </article>

        <article class="panel section" data-view-panel="infra">
          <div class="section-head">
            <h2>Providers</h2>
            <p>Capacidade atual dos modelos e estado operacional.</p>
          </div>
          <div class="provider-grid" id="providers-grid"></div>
        </article>

        <article class="panel section" data-view-panel="tasks">
          <div class="section-head">
            <h2>Tarefas</h2>
            <p>Tarefas persistidas pela LiNa.</p>
          </div>
          <form class="task-form" id="task-form">
            <label>
              Nova tarefa
              <input id="task-title" type="text" placeholder="Ex: validar skill router" required />
            </label>
            <label>
              Responsável
              <input id="task-agent" type="text" placeholder="Ex: orchestrator" />
            </label>
            <label>
              Status
              <select id="task-status">
                <option value="pending">pending</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <button type="submit">Criar</button>
          </form>
          <div class="section-tools">
            <label>
              Status
              <select id="task-filter-status" class="control">
                <option value="">Todos</option>
                <option value="pending">pending</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <label>
              Texto
              <input id="task-filter-query" class="control" type="text" placeholder="Título ou agente..." />
            </label>
          </div>
          <div class="feed" id="tasks-feed"></div>
        </article>

        <article class="panel section" data-view-panel="messages">
          <div class="section-head">
            <h2>Mensagens Recentes</h2>
            <p>Histórico operacional da conversa persistida.</p>
          </div>
          <div class="section-tools">
            <label>
              Role
              <select id="message-filter-role" class="control">
                <option value="">Todos</option>
                <option value="system">system</option>
                <option value="user">user</option>
                <option value="assistant">assistant</option>
                <option value="tool">tool</option>
              </select>
            </label>
          </div>
          <div class="feed" id="messages-feed"></div>
        </article>

        <article class="panel section" data-view-panel="telegram">
          <div class="section-head">
            <h2>Telegram</h2>
            <p>Resumo por origem quando os metadados de mensagem estiverem disponíveis.</p>
          </div>
          <div class="feed" id="telegram-feed"></div>
        </article>

        <article class="panel section" data-view-panel="logs">
          <div class="section-head">
            <h2>Logs do Sistema</h2>
            <p>Eventos recentes do runtime para depuração e monitoramento.</p>
          </div>
          <div class="section-tools">
            <label>
              Level
              <select id="log-filter-level" class="control">
                <option value="">Todos</option>
                <option value="info">info</option>
                <option value="error">error</option>
              </select>
            </label>
          </div>
          <div class="feed" id="logs-feed"></div>
        </article>

        <article class="panel section" data-view-panel="executions">
          <div class="section-head">
            <h2>Execuções</h2>
            <p>Histórico recente do orquestrador com status, provider e resumo.</p>
          </div>
          <div class="section-tools">
            <label>
              Status
              <select id="execution-filter-status" class="control">
                <option value="">Todos</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
                <option value="running">running</option>
              </select>
            </label>
            <label>
              Provider
              <select id="execution-filter-provider" class="control">
                <option value="">Todos</option>
              </select>
            </label>
          </div>
          <div class="feed" id="executions-feed"></div>
        </article>

        <article class="panel section" data-view-panel="settings">
          <div class="section-head">
            <h2>Configurações</h2>
            <p>Controle de autenticação do dashboard e estado do bootstrap do primeiro admin.</p>
          </div>
          <div class="task-actions">
            <button class="task-action" id="bootstrap-toggle-button" type="button">Alternar bootstrap</button>
          </div>
          <div class="feed" id="settings-feed"></div>
        </article>
        </section>
      </section>
    </main>

    <script>
      const endpoints = {
        health: "/api/health",
        status: "/api/status",
        providers: "/api/providers",
        messages: "/api/memory/messages",
        tasks: "/api/tasks",
        executions: "/api/executions?limit=30",
        logs: "/api/logs?limit=30",
        authState: "/dashboard/auth/state",
        authBootstrapToggle: "/dashboard/auth/bootstrap-toggle",
      };

      const dashboardState = {
        health: null,
        status: null,
        providers: {},
        messages: [],
        tasks: [],
        executions: [],
        logs: [],
        auth: null,
        activeView: "overview",
      };

      const badgeClass = (value) => {
        if (value === true || value === "ok" || value === "supabase" || value === "configured") return "ok";
        if (value === false || value === "degraded" || value === "not-configured") return "bad";
        return "neutral";
      };

      const safeText = (value) => {
        if (value === null || value === undefined || value === "") return "n/a";
        return String(value);
      };

      const escapeHtml = (value) =>
        safeText(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const formatTime = (value) => {
        if (!value) return "Sem data";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? safeText(value) : date.toLocaleString("pt-BR");
      };

      const renderEmpty = (container, label) => {
        container.innerHTML = '<div class="empty">' + label + "</div>";
      };

      const renderStatus = (health, status) => {
        const stack = document.getElementById("status-stack");
        const items = [
          {
            label: "API",
            description: "Saúde geral do backend LiNa",
            value: health?.status || "desconhecido",
          },
          {
            label: "Persistência",
            description: safeText(status?.persistence?.provider || health?.persistence?.provider),
            value: status?.persistence?.connected ?? health?.persistence?.connected,
          },
          {
            label: "Telegram",
            description: safeText(status?.telegram?.identity?.username || "bot sem identidade"),
            value: status?.telegram?.pollingEnabled ?? false,
          },
          {
            label: "Ambiente",
            description: safeText(status?.environment),
            value: safeText(status?.defaultProvider),
          },
        ];

        stack.innerHTML = items.map((item) => {
          const badgeValue = typeof item.value === "boolean" ? (item.value ? "ativo" : "inativo") : safeText(item.value);
          return \`
            <div class="status-row">
              <div>
                <strong>\${item.label}</strong>
                <span>\${escapeHtml(item.description)}</span>
              </div>
              <div class="badge \${badgeClass(item.value)}">\${escapeHtml(badgeValue)}</div>
            </div>
          \`;
        }).join("");
      };

      const renderProviders = (providers) => {
        const grid = document.getElementById("providers-grid");
        const entries = Object.entries(providers || {});

        if (!entries.length) {
          renderEmpty(grid, "Nenhum provider disponível.");
          return;
        }

        grid.innerHTML = entries.map(([name, provider]) => {
          const state = provider?.configured ? "configured" : "not-configured";
          const model = provider?.model || provider?.details || "sem modelo";
          return \`
            <article class="provider-card">
              <div class="feed-meta">
                <strong>\${escapeHtml(name)}</strong>
                <span class="badge \${badgeClass(state)}">\${provider?.configured ? "ativo" : "off"}</span>
              </div>
              <h3>\${escapeHtml(model)}</h3>
              <p>\${escapeHtml(provider?.details || "Provider carregado sem detalhe adicional.")}</p>
            </article>
          \`;
        }).join("");
      };

      const getTaskFilters = () => ({
        status: document.getElementById("task-filter-status").value.trim(),
        query: document.getElementById("task-filter-query").value.trim().toLowerCase(),
      });

      const getMessageFilters = () => ({
        query: document.getElementById("message-filter").value.trim().toLowerCase(),
        role: document.getElementById("message-filter-role").value.trim(),
      });

      const getLogFilters = () => ({
        query: document.getElementById("log-filter").value.trim().toLowerCase(),
        level: document.getElementById("log-filter-level").value.trim(),
      });

      const getExecutionFilters = () => ({
        status: document.getElementById("execution-filter-status").value.trim(),
        provider: document.getElementById("execution-filter-provider").value.trim(),
      });

      const computeOperationalSummary = (messages, tasks, executions, providers, status, health) => {
        const telegramMessages = (messages || []).filter((message) => message.metadata?.source === "telegram");
        const uniqueChats = new Set(
          telegramMessages.map((message) => message.metadata?.chatId).filter(Boolean)
        );
        const uniqueUsers = new Set(
          telegramMessages.map((message) => message.metadata?.userId).filter(Boolean)
        );
        const pendingTasks = (tasks || []).filter((task) => task.status === "pending").length;
        const runningTasks = (tasks || []).filter((task) => task.status === "running").length;
        const failedExecutions = (executions || []).filter((execution) => execution.status === "failed").length;
        const completedExecutions = (executions || []).filter((execution) => execution.status === "completed").length;
        const activeProviders = Object.values(providers || {}).filter((item) => item?.configured).length;
        const lastMessage = [...(messages || [])]
          .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0];
        const executionSuccessRate = executions?.length
          ? Math.round((completedExecutions / executions.length) * 100)
          : null;

        return {
          telegramMessages: telegramMessages.length,
          uniqueChats: uniqueChats.size,
          uniqueUsers: uniqueUsers.size,
          pendingTasks,
          runningTasks,
          failedExecutions,
          completedExecutions,
          activeProviders,
          defaultProvider: status?.defaultProvider || health?.defaultProvider || "n/a",
          persistenceProvider: status?.persistence?.provider || health?.persistence?.provider || "n/a",
          lastActivityAt: lastMessage?.createdAt || null,
          lastActivitySource:
            lastMessage?.metadata?.source ||
            lastMessage?.role ||
            "sem origem recente",
          executionSuccessRate,
        };
      };

      const renderTasks = (tasks) => {
        const feed = document.getElementById("tasks-feed");
        const filters = getTaskFilters();
        const filteredTasks = (tasks || []).filter((task) => {
          const statusMatch = !filters.status || task.status === filters.status;
          const queryMatch =
            !filters.query ||
            safeText(task.title).toLowerCase().includes(filters.query) ||
            safeText(task.assignedAgent).toLowerCase().includes(filters.query);
          return statusMatch && queryMatch;
        });

        if (!filteredTasks.length) {
          renderEmpty(feed, "Nenhuma tarefa registrada.");
          return;
        }

        feed.innerHTML = filteredTasks.slice(0, 12).map((task) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${badgeClass(task.status === "completed" ? "ok" : task.status === "failed" ? "degraded" : "configured")}">\${escapeHtml(task.status)}</span>
              <span>\${formatTime(task.createdAt)}</span>
            </div>
            <div class="feed-title">\${escapeHtml(task.title)}</div>
            <div class="feed-body">Agente: \${escapeHtml(task.assignedAgent)}</div>
            <div class="task-actions">
              <button class="task-action" data-task-id="\${escapeHtml(task.id)}" data-status="pending" type="button">pending</button>
              <button class="task-action" data-task-id="\${escapeHtml(task.id)}" data-status="running" type="button">running</button>
              <button class="task-action" data-task-id="\${escapeHtml(task.id)}" data-status="completed" type="button">completed</button>
              <button class="task-action" data-task-id="\${escapeHtml(task.id)}" data-status="failed" type="button">failed</button>
            </div>
          </article>
        \`).join("");
      };

      const renderTaskOptions = (tasks) => {
        const select = document.getElementById("composer-task");
        const currentValue = select.value;
        const options = ['<option value="">Sem tarefa</option>'].concat(
          (tasks || []).map((task) => \`<option value="\${escapeHtml(task.id)}">\${escapeHtml(task.title)} (\${escapeHtml(task.status)})</option>\`)
        );
        select.innerHTML = options.join("");
        select.value = currentValue;
      };

      const renderMessages = (messages) => {
        const feed = document.getElementById("messages-feed");
        const filters = getMessageFilters();
        const filteredMessages = (messages || []).filter((message) => {
          const roleMatch = !filters.role || message.role === filters.role;
          const queryMatch =
            !filters.query ||
            safeText(message.content).toLowerCase().includes(filters.query) ||
            safeText(message.role).toLowerCase().includes(filters.query);
          return roleMatch && queryMatch;
        });

        if (!filteredMessages.length) {
          renderEmpty(feed, "Nenhuma mensagem persistida.");
          return;
        }

        feed.innerHTML = filteredMessages.slice(-12).reverse().map((message) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge neutral">\${escapeHtml(message.role)}</span>
              <span>\${formatTime(message.createdAt)}</span>
            </div>
            <div class="feed-body">\${escapeHtml(message.content)}</div>
            <div class="feed-submeta">
              \${escapeHtml(message.metadata?.source || "origem n/a")} ·
              \${escapeHtml(message.metadata?.messageType || "tipo n/a")} ·
              \${escapeHtml(message.metadata?.firstName || message.metadata?.username || message.metadata?.chatId || "sem remetente")}
            </div>
          </article>
        \`).join("");
      };

      const renderTelegramView = (messages) => {
        const feed = document.getElementById("telegram-feed");
        const telegramMessages = (messages || []).filter((message) => message.metadata?.source === "telegram");

        if (!telegramMessages.length) {
          renderEmpty(feed, "Nenhum metadado de Telegram disponível ainda. Aplique a migration nova para começar a preencher essa visão.");
          return;
        }

        const grouped = new Map();

        for (const message of telegramMessages) {
          const metadata = message.metadata || {};
          const key = metadata.chatId || metadata.userId || message.id;
          const current = grouped.get(key) || {
            chatId: metadata.chatId,
            chatType: metadata.chatType,
            username: metadata.username,
            firstName: metadata.firstName,
            userId: metadata.userId,
            count: 0,
            lastMessageAt: message.createdAt,
            lastPreview: message.content,
          };

          current.count += 1;
          current.lastMessageAt = message.createdAt;
          current.lastPreview = message.content;
          grouped.set(key, current);
        }

        const cards = Array.from(grouped.values())
          .sort((left, right) => String(right.lastMessageAt).localeCompare(String(left.lastMessageAt)))
          .slice(0, 12);

        feed.innerHTML = cards.map((item) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge neutral">\${escapeHtml(item.chatType || "telegram")}</span>
              <span>\${formatTime(item.lastMessageAt)}</span>
            </div>
            <div class="feed-title">\${escapeHtml(item.firstName || item.username || item.chatId || "origem desconhecida")}</div>
            <div class="feed-body">chatId: \${escapeHtml(item.chatId)} | userId: \${escapeHtml(item.userId)} | mensagens: \${escapeHtml(item.count)}</div>
            <div class="feed-body">\${escapeHtml(item.lastPreview)}</div>
          </article>
        \`).join("");
      };

      const renderLogs = (logs) => {
        const feed = document.getElementById("logs-feed");
        const filters = getLogFilters();
        const filteredLogs = (logs || []).filter((log) => {
          const levelMatch = !filters.level || log.level === filters.level;
          const queryMatch =
            !filters.query ||
            safeText(log.message).toLowerCase().includes(filters.query) ||
            safeText(log.level).toLowerCase().includes(filters.query);
          return levelMatch && queryMatch;
        });

        if (!filteredLogs.length) {
          renderEmpty(feed, "Nenhum log recente.");
          return;
        }

        feed.innerHTML = filteredLogs.map((log) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${badgeClass(log.level === "error" ? "degraded" : log.level === "info" ? "ok" : "configured")}">\${escapeHtml(log.level)}</span>
              <span>\${formatTime(log.createdAt)}</span>
            </div>
            <div class="feed-body">\${escapeHtml(log.message)}</div>
          </article>
        \`).join("");
      };

      const renderExecutions = (executions) => {
        const feed = document.getElementById("executions-feed");
        const filters = getExecutionFilters();

        const filteredExecutions = (executions || []).filter((execution) => {
          const statusMatch = !filters.status || execution.status === filters.status;
          const providerMatch = !filters.provider || execution.provider === filters.provider;
          return statusMatch && providerMatch;
        });

        if (!filteredExecutions.length) {
          renderEmpty(feed, "Nenhuma execução registrada.");
          return;
        }

        feed.innerHTML = filteredExecutions.map((execution) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${badgeClass(execution.status === "completed" ? "ok" : execution.status === "failed" ? "degraded" : "configured")}">\${escapeHtml(execution.status)}</span>
              <span>\${formatTime(execution.createdAt)}</span>
            </div>
            <div class="feed-title">Provider: \${escapeHtml(execution.provider)}</div>
            <div class="feed-body">\${escapeHtml(execution.resultSummary)}</div>
          </article>
        \`).join("");
      };

      const renderSettings = (authPayload) => {
        const feed = document.getElementById("settings-feed");
        const pill = document.getElementById("current-user-pill");
        const toggleButton = document.getElementById("bootstrap-toggle-button");

        if (!authPayload) {
          pill.textContent = "Sessão sem contexto";
          toggleButton.disabled = true;
          renderEmpty(feed, "Autenticação do dashboard indisponível.");
          return;
        }

        const currentUser = authPayload.currentUser;
        const authState = authPayload.authState;
        const users = authPayload.users || [];

        pill.textContent = currentUser
          ? safeText(currentUser.username) + " · " + safeText(currentUser.role)
          : "Sessão sem usuário";

        if (authPayload.mode !== "database") {
          toggleButton.disabled = true;
          renderEmpty(feed, "O dashboard está em modo legado de token. O gerenciamento de usuários no banco só aparece no modo database.");
          return;
        }

        toggleButton.disabled = false;
        toggleButton.textContent = authState?.allowAdminBootstrap
          ? "Desabilitar bootstrap admin"
          : "Habilitar bootstrap admin";

        const userCards = users.length
          ? users.map((user) => \`
              <article class="feed-item">
                <div class="feed-meta">
                  <span class="badge \${user.isActive ? "ok" : "bad"}">\${user.isActive ? "ativo" : "inativo"}</span>
                  <span>\${formatTime(user.createdAt)}</span>
                </div>
                <div class="feed-title">\${escapeHtml(user.username)}</div>
                <div class="feed-body">role: \${escapeHtml(user.role)} | último login: \${escapeHtml(user.lastLoginAt ? formatTime(user.lastLoginAt) : "nunca")}</div>
              </article>
            \`).join("")
          : '<div class="empty">Nenhum usuário cadastrado ainda.</div>';

        feed.innerHTML = [
          \`<article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${authState?.allowAdminBootstrap ? "warn" : "neutral"}">\${authState?.allowAdminBootstrap ? "bootstrap on" : "bootstrap off"}</span>
              <span>Usuários: \${escapeHtml(authState?.usersCount || 0)}</span>
            </div>
            <div class="feed-body">Se o bootstrap estiver habilitado, a tela de login mostrará o formulário para cadastrar um administrador inicial.</div>
          </article>\`,
          userCards,
        ].join("");
      };

      const renderExecutionOptions = (executions) => {
        const select = document.getElementById("execution-filter-provider");
        const currentValue = select.value;
        const providers = Array.from(
          new Set((executions || []).map((execution) => execution.provider).filter(Boolean))
        ).sort((left, right) => String(left).localeCompare(String(right)));

        select.innerHTML = ['<option value="">Todos</option>']
          .concat(providers.map((provider) => \`<option value="\${escapeHtml(provider)}">\${escapeHtml(provider)}</option>\`))
          .join("");
        select.value = currentValue;
      };

      const updateMetrics = (health, status, providers, messages, tasks, executions) => {
        const summary = computeOperationalSummary(messages, tasks, executions, providers, status, health);
        document.getElementById("metric-health").textContent = safeText(health?.status || "n/a");
        document.getElementById("metric-messages").textContent = safeText(messages?.length || 0);
        document.getElementById("metric-tasks").textContent = safeText(tasks?.length || 0);
        document.getElementById("metric-providers").textContent = safeText(summary.activeProviders);
        document.getElementById("metric-persistence").textContent = "Persistência " + safeText(summary.persistenceProvider);
        document.getElementById("metric-telegram-messages").textContent = "Telegram " + safeText(summary.telegramMessages);
        document.getElementById("metric-pending-tasks").textContent = "Pendentes " + safeText(summary.pendingTasks);
        document.getElementById("metric-default-provider").textContent = "Default " + safeText(summary.defaultProvider);
        document.getElementById("metric-telegram-chats").textContent = safeText(summary.uniqueChats);
        document.getElementById("metric-telegram-users").textContent = "Usuários " + safeText(summary.uniqueUsers);
        document.getElementById("metric-executions").textContent = safeText(executions?.length || 0);
        document.getElementById("metric-execution-success").textContent =
          summary.executionSuccessRate === null ? "Sucesso n/a" : "Sucesso " + safeText(summary.executionSuccessRate) + "%";
        document.getElementById("metric-failures").textContent = safeText(summary.failedExecutions);
        document.getElementById("metric-running-tasks").textContent = "Running " + safeText(summary.runningTasks);
        document.getElementById("metric-last-activity").textContent = summary.lastActivityAt ? formatTime(summary.lastActivityAt) : "n/a";
        document.getElementById("metric-last-source").textContent = safeText(summary.lastActivitySource);
      };

      const applyViewState = () => {
        const activeView = dashboardState.activeView || "overview";
        const workspace = document.getElementById("workspace");
        const tabs = document.querySelectorAll(".view-tab");
        const panels = document.querySelectorAll("[data-view-panel]");

        workspace.classList.toggle("is-overview", activeView === "overview");
        tabs.forEach((tab) => {
          tab.classList.toggle("active", tab.dataset.view === activeView);
        });
        panels.forEach((panel) => {
          panel.classList.toggle("active", panel.dataset.viewPanel === activeView);
        });
      };

      const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Falha ao carregar " + url + ": " + response.status);
        }
        return response.json();
      };

      const sendJson = async (url, method, payload) => {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Falha na operação " + method + " " + url + ": " + response.status);
        }

        return response.json();
      };

      const rerenderFeeds = () => {
        renderTasks(dashboardState.tasks);
        renderExecutions(dashboardState.executions);
        renderMessages(dashboardState.messages);
        renderTelegramView(dashboardState.messages);
        renderLogs(dashboardState.logs);
        renderSettings(dashboardState.auth);
        applyViewState();
      };

      const refresh = async () => {
        try {
          const [health, status, providers, messages, tasks, executions, logs, auth] = await Promise.all([
            fetchJson(endpoints.health),
            fetchJson(endpoints.status),
            fetchJson(endpoints.providers),
            fetchJson(endpoints.messages),
            fetchJson(endpoints.tasks),
            fetchJson(endpoints.executions),
            fetchJson(endpoints.logs),
            fetchJson(endpoints.authState),
          ]);

          dashboardState.health = health;
          dashboardState.status = status;
          dashboardState.providers = providers;
          dashboardState.messages = messages;
          dashboardState.tasks = tasks;
          dashboardState.executions = executions;
          dashboardState.logs = logs;
          dashboardState.auth = auth;

          renderStatus(health, status);
          renderProviders(providers);
          renderTaskOptions(tasks);
          renderExecutionOptions(executions);
          rerenderFeeds();
          updateMetrics(health, status, providers, messages, tasks, executions);
          document.getElementById("last-updated").textContent = "Atualizado em " + new Date().toLocaleString("pt-BR");
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao atualizar";
        }
      };

      document.getElementById("refresh-button").addEventListener("click", refresh);
      document.getElementById("logout-button").addEventListener("click", async () => {
        await fetch("/logout", { method: "POST" });
        window.location.reload();
      });
      document.getElementById("bootstrap-toggle-button").addEventListener("click", async () => {
        if (!dashboardState.auth?.authState) {
          return;
        }

        try {
          await sendJson(endpoints.authBootstrapToggle, "POST", {
            enabled: !dashboardState.auth.authState.allowAdminBootstrap,
          });
          await refresh();
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao alterar bootstrap";
        }
      });
      document.getElementById("task-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const titleInput = document.getElementById("task-title");
        const agentInput = document.getElementById("task-agent");
        const statusInput = document.getElementById("task-status");
        const title = titleInput.value.trim();

        if (!title) {
          return;
        }

        try {
          await sendJson(endpoints.tasks, "POST", {
            title,
            assignedAgent: agentInput.value.trim() || null,
            status: statusInput.value,
          });

          titleInput.value = "";
          agentInput.value = "";
          statusInput.value = "pending";
          await refresh();
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao criar tarefa";
        }
      });

      document.getElementById("tasks-feed").addEventListener("click", async (event) => {
        const button = event.target.closest(".task-action");

        if (!button) {
          return;
        }

        const taskId = button.dataset.taskId;
        const status = button.dataset.status;

        if (!taskId || !status) {
          return;
        }

        try {
          await sendJson(\`/api/tasks/\${taskId}\`, "PATCH", { status });
          await refresh();
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao atualizar tarefa";
        }
      });

      document.getElementById("composer-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const textArea = document.getElementById("composer-text");
        const taskSelect = document.getElementById("composer-task");
        const resultBox = document.getElementById("composer-result");
        const text = textArea.value.trim();

        if (!text) {
          return;
        }

        resultBox.textContent = "Executando...";

        try {
          const result = await sendJson("/api/orchestrator/run", "POST", {
            text,
            taskId: taskSelect.value || null,
          });

          resultBox.innerHTML = [
            "<strong>Resposta</strong>",
            "",
            escapeHtml(result.answer),
            "",
            "Provider: " + escapeHtml(result.provider),
            "Iterations: " + escapeHtml(result.iterations),
            "Execution ID: " + escapeHtml(result.executionId),
          ].join("<br />");

          await refresh();
        } catch (error) {
          resultBox.textContent = error instanceof Error ? error.message : "Falha na execução";
        }
      });

      [
        "task-filter-status",
        "task-filter-query",
        "message-filter",
        "message-filter-role",
        "log-filter",
        "log-filter-level",
        "execution-filter-status",
        "execution-filter-provider",
      ].forEach((id) => {
        document.getElementById(id).addEventListener("input", rerenderFeeds);
        document.getElementById(id).addEventListener("change", rerenderFeeds);
      });

      document.getElementById("view-nav").addEventListener("click", (event) => {
        const button = event.target.closest(".view-tab");
        if (!button) {
          return;
        }

        dashboardState.activeView = button.dataset.view || "overview";
        applyViewState();
      });

      applyViewState();
      refresh();
      setInterval(refresh, 15000);
    </script>
  </body>
</html>`;

const proxyRequest = async (
  path: string,
  method: string,
  body?: Uint8Array
): Promise<Response> => {
  const targetUrl = new URL(path.replace(/^\/api/, ""), apiBaseUrl);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const safeBody = body ? Uint8Array.from(body) : undefined;

  return fetch(targetUrl, {
    method,
    headers,
    body: safeBody ? new Blob([safeBody], { type: "application/json" }) : undefined,
  });
};

const server = createServer(async (request, response) => {
  try {
    const url = request.url || "/";
    const authContext = await getRequestAuthContext(request);

    if (url === "/login" && request.method === "POST") {
      const payload = new URLSearchParams((await readBody(request)).toString("utf8"));
      if (dashboardAuthMode === "database") {
        try {
          const username = payload.get("username") || "";
          const password = payload.get("password") || "";
          const session = await dashboardAuthStore!.authenticate(username, password);
          response.writeHead(302, {
            Location: "/",
            "Set-Cookie": buildSessionCookie(session.token, 60 * 60 * 24 * 7),
          });
          response.end();
          return;
        } catch (error) {
          const authState = await dashboardAuthStore!.getAuthState().catch(() => null);
          response.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
          response.end(
            loginHtml({
              errorMessage: error instanceof Error ? error.message : "Falha ao autenticar.",
              authState,
            })
          );
          return;
        }
      }

      const token = payload.get("token") || "";
      if (!dashboardAccessToken || token === dashboardAccessToken) {
        response.writeHead(302, {
          Location: "/",
          "Set-Cookie": buildSessionCookie(dashboardSessionValue, 60 * 60 * 24 * 7),
        });
        response.end();
        return;
      }

      response.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      response.end(loginHtml({ errorMessage: "Token inválido." }));
      return;
    }

    if (url === "/bootstrap-admin" && request.method === "POST") {
      if (dashboardAuthMode !== "database") {
        sendJson(response, 404, { error: "Bootstrap admin is only available with database auth." });
        return;
      }

      const payload = new URLSearchParams((await readBody(request)).toString("utf8"));
      const username = payload.get("username") || "";
      const password = payload.get("password") || "";
      const confirmPassword = payload.get("confirmPassword") || "";

      if (password !== confirmPassword) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          loginHtml({
            errorMessage: "A confirmação de senha não confere.",
            authState: await dashboardAuthStore!.getAuthState().catch(() => null),
          })
        );
        return;
      }

      try {
        const session = await dashboardAuthStore!.bootstrapAdmin(username, password);
        response.writeHead(302, {
          Location: "/",
          "Set-Cookie": buildSessionCookie(session.token, 60 * 60 * 24 * 7),
        });
        response.end();
        return;
      } catch (error) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          loginHtml({
            errorMessage: error instanceof Error ? error.message : "Falha ao cadastrar administrador inicial.",
            authState: await dashboardAuthStore!.getAuthState().catch(() => null),
          })
        );
        return;
      }
    }

    if (url === "/dashboard/auth/state" && request.method === "GET") {
      if (authContext.authError) {
        sendJson(response, 503, { error: authContext.authError });
        return;
      }

      if (!authContext.isAuthenticated) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      if (dashboardAuthMode !== "database") {
        sendJson(response, 200, {
          mode: dashboardAuthMode,
          currentUser: authContext.currentUser,
          authState: authContext.authState,
          users: [],
        });
        return;
      }

      sendJson(response, 200, {
        mode: dashboardAuthMode,
        currentUser: authContext.currentUser,
        authState: await dashboardAuthStore!.getAuthState(),
        users: await dashboardAuthStore!.listUsers(),
      });
      return;
    }

    if (url === "/dashboard/auth/bootstrap-toggle" && request.method === "POST") {
      if (!authContext.isAuthenticated || dashboardAuthMode !== "database") {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const rawBody = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
        enabled?: boolean;
      };
      await dashboardAuthStore!.setAllowAdminBootstrap(Boolean(rawBody.enabled));
      sendJson(response, 200, {
        ok: true,
        authState: await dashboardAuthStore!.getAuthState(),
      });
      return;
    }

    if (url === "/logout" && request.method === "POST") {
      if (dashboardAuthMode === "database") {
        const token = parseCookies(request.headers.cookie)[dashboardSessionCookieName];
        await dashboardAuthStore!.revokeSession(token);
      }

      response.writeHead(204, {
        "Set-Cookie": clearSessionCookie(),
      });
      response.end();
      return;
    }

    if (!authContext.isAuthenticated) {
      if (url.startsWith("/api/")) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      response.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        loginHtml({
          authState: authContext.authState,
          infoMessage: authContext.authError || undefined,
        })
      );
      return;
    }

    if (url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (url.startsWith("/api/")) {
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : new Uint8Array(await readBody(request));
      const proxied = await proxyRequest(url, request.method || "GET", body);

      response.writeHead(proxied.status, {
        "Content-Type": proxied.headers.get("content-type") || "application/json",
      });
      response.end(Buffer.from(await proxied.arrayBuffer()));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard server error";
    sendJson(response, 500, { error: message });
  }
});

server.listen(dashboardPort, () => {
  console.log(`[LiNa][dashboard] listening on http://localhost:${dashboardPort}`);
  console.log(`[LiNa][dashboard] proxying API requests to ${apiBaseUrl}`);
});
