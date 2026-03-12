import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DashboardAuthState, DashboardAuthStore } from "./auth/dashboard-auth-store";
import { DashboardPermissionSet, DashboardRole, getDashboardPermissions, normalizeDashboardRole } from "./auth/dashboard-rbac";

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
const dashboardVersion = JSON.parse(readFileSync("package.json", "utf8")).version || "0.1.0";

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
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08); margin:20px 0;" />
        <h1 style="font-size:1.5rem;">Trocar Senha</h1>
        <p>Se você já tem acesso, pode trocar a senha por aqui usando a senha atual.</p>
        ${
          dashboardAuthMode === "database"
            ? `
              <form method="POST" action="/change-password">
                <input type="text" name="username" placeholder="Usuário" autocomplete="username" required />
                <input type="password" name="currentPassword" placeholder="Senha atual" autocomplete="current-password" required />
                <input type="password" name="newPassword" placeholder="Nova senha" autocomplete="new-password" required />
                <input type="password" name="confirmPassword" placeholder="Confirmar nova senha" autocomplete="new-password" required />
                <button type="submit">Trocar senha</button>
              </form>
            `
            : `<p class="muted">A troca de senha pela tela de login está disponível apenas no modo com banco.</p>`
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
    role: DashboardRole;
    permissions: DashboardPermissionSet;
  } | null;
  authState: DashboardAuthState | null;
  authError?: string | null;
};

const hasPermission = (
  authContext: DashboardRequestAuthContext,
  permission: keyof DashboardPermissionSet
): boolean => Boolean(authContext.currentUser?.permissions?.[permission]);

const requirePermission = (
  response: ServerResponse,
  authContext: DashboardRequestAuthContext,
  permission: keyof DashboardPermissionSet
): boolean => {
  if (hasPermission(authContext, permission)) {
    return true;
  }

  sendJson(response, 403, { error: "Forbidden" });
  return false;
};

const logDashboardAudit = async (
  message: string,
  level = "info"
): Promise<void> => {
  if (dashboardAuthMode !== "database" || !dashboardAuthStore) {
    return;
  }

  await dashboardAuthStore.appendSystemLog(level, `[dashboard-audit] ${message}`);
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
            permissions: getDashboardPermissions("admin"),
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
            permissions: currentUser.permissions,
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

      body[data-theme="light"] {
        --bg: #eef3fb;
        --bg-soft: #dfe7f4;
        --panel: rgba(255, 255, 255, 0.9);
        --panel-strong: #ffffff;
        --line: rgba(72, 91, 124, 0.16);
        --text: #102036;
        --muted: #5f7394;
        --accent: #ef9b28;
        --accent-soft: rgba(239, 155, 40, 0.16);
        --good: #188c65;
        --warn: #b27a00;
        --bad: #c75454;
        --shadow: 0 24px 60px rgba(31, 50, 84, 0.12);
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

      body[data-theme="light"] {
        background:
          radial-gradient(circle at top left, rgba(239, 155, 40, 0.14), transparent 22%),
          radial-gradient(circle at bottom right, rgba(24, 140, 101, 0.1), transparent 18%),
          linear-gradient(160deg, #eff5fd 0%, #e8f0fa 56%, #dde6f3 100%);
      }

      .shell {
        width: min(1580px, calc(100% - 20px));
        margin: 10px auto;
        min-height: calc(100vh - 20px);
        display: grid;
        grid-template-columns: 228px minmax(0, 1fr);
        gap: 14px;
      }

      .sidebar {
        position: sticky;
        top: 10px;
        align-self: start;
        min-height: calc(100vh - 20px);
        padding: 18px 14px;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 14px;
      }

      .sidebar-brand h1 {
        margin: 10px 0 0;
        max-width: none;
        font-size: clamp(1.5rem, 1.8vw, 2rem);
      }

      .sidebar-copy {
        display: none;
      }

      .sidebar-nav {
        display: grid;
        gap: 2px;
      }

      .sidebar-footer {
        display: grid;
        gap: 10px;
      }

      .main-shell {
        min-width: 0;
      }

      .topbar {
        position: sticky;
        top: 10px;
        z-index: 10;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        margin-bottom: 14px;
        padding: 12px 16px;
      }

      .topbar-left,
      .topbar-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .topbar-title {
        display: grid;
        gap: 0;
      }

      .topbar-title strong {
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
        letter-spacing: -0.04em;
        font-size: 1.18rem;
      }

      .topbar-title span {
        display: none;
      }

      .workspace {
        min-width: 0;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      .hero {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 18px;
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

      .topbar button,
      .toolbar button {
        appearance: none;
        border: 0;
        border-radius: 12px;
        background: rgba(255,255,255,0.05);
        color: var(--text);
        font-weight: 700;
        padding: 10px 14px;
        cursor: pointer;
      }

      .topbar small,
      .toolbar small {
        color: var(--muted);
      }

      .view-tab {
        appearance: none;
        width: 100%;
        min-height: 46px;
        padding: 0 10px 0 12px;
        border-radius: 0;
        border: 0;
        border-left: 2px solid transparent;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        font-weight: 600;
        display: grid;
        grid-template-columns: 26px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        text-align: left;
      }

      .view-tab.active {
        background: rgba(255,255,255,0.02);
        color: var(--text);
        border-left-color: var(--accent);
      }

      .nav-icon {
        width: 22px;
        height: 22px;
        display: inline-grid;
        place-items: center;
        border-radius: 0;
        background: transparent;
      }

      .view-tab.active .nav-icon {
        background: transparent;
      }

      .nav-icon svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .nav-copy {
        display: grid;
        gap: 0;
      }

      .nav-copy strong {
        font-size: 0.92rem;
        font-weight: 600;
      }

      .nav-copy span {
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

      .subtools {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 18px;
        flex-wrap: wrap;
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

      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-bottom: 18px;
      }

      .settings-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
        gap: 18px;
        align-items: start;
      }

      .settings-stack,
      .settings-rail,
      .settings-block {
        display: grid;
        gap: 18px;
      }

      .settings-hero {
        padding: 20px 22px;
        border-radius: 22px;
        background:
          radial-gradient(circle at top left, rgba(255,181,77,0.15), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.08);
      }

      .settings-hero h3 {
        margin: 0 0 8px;
        font-size: 1.05rem;
      }

      .settings-hero p {
        display: none;
      }

      .settings-metrics {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 16px;
      }

      .settings-metric {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--text);
        font-size: 0.82rem;
      }

      .settings-section-title {
        margin: 0;
        font-size: 0.78rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .settings-card {
        padding: 18px;
        border-radius: 18px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
      }

      .settings-card h3 {
        margin: 0 0 8px;
        font-size: 1rem;
      }

      .settings-card p {
        display: none;
      }

      .settings-form {
        display: grid;
        gap: 12px;
      }

      .settings-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 14px;
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

      .page-stack {
        display: block;
      }

      .section {
        padding: 24px;
      }

      .page-panel {
        width: 100%;
      }

      .section h2 {
        margin: 0 0 6px;
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
        letter-spacing: -0.03em;
      }

      .section-head {
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .section-head p {
        display: none;
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

      .execution-grid {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }

      .execution-row {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }

      .execution-label {
        color: var(--muted);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .execution-value {
        color: var(--text);
        font-size: 0.84rem;
        word-break: break-word;
      }

      .artifact-layout {
        display: grid;
        grid-template-columns: minmax(260px, 0.48fr) minmax(0, 1.52fr);
        gap: 18px;
      }

      .artifact-stack {
        display: grid;
        gap: 18px;
      }

      .artifact-editor {
        min-width: 0;
      }

      .artifact-list {
        display: grid;
        gap: 10px;
      }

      .artifact-item {
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.025);
        cursor: pointer;
      }

      .artifact-item.active {
        border-color: rgba(255,181,77,0.42);
        background: rgba(255,181,77,0.08);
      }

      .artifact-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .artifact-chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--muted);
        font-size: 0.74rem;
      }

      .artifact-editor textarea {
        min-height: 520px;
        width: 100%;
        resize: vertical;
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.84rem;
        line-height: 1.6;
      }

      .artifact-structured-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .artifact-structured-grid .artifact-full {
        grid-column: 1 / -1;
      }

      .artifact-inline-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .artifact-inline-note {
        margin: 0;
        color: var(--muted);
        font-size: 0.82rem;
      }

      .artifact-diff {
        min-height: 180px;
        max-height: 360px;
        overflow: auto;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(8,12,18,0.78);
        padding: 14px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.8rem;
        line-height: 1.55;
        white-space: pre-wrap;
      }

      .artifact-diff-line {
        display: block;
      }

      .artifact-diff-line.add {
        color: #9ef0b0;
      }

      .artifact-diff-line.remove {
        color: #ffb2b2;
      }

      .artifact-diff-line.context {
        color: rgba(255,255,255,0.72);
      }

      .artifact-toolbar {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 14px;
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

      .version-pill {
        display: inline-flex;
        align-items: center;
        min-height: 42px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--muted);
        font-size: 0.84rem;
      }

      .theme-toggle {
        min-width: 126px;
        background: rgba(255,255,255,0.05) !important;
        color: var(--text) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
      }

      .empty {
        padding: 18px;
        border-radius: 16px;
        border: 1px dashed rgba(255,255,255,0.1);
        color: var(--muted);
      }

      @media (max-width: 1180px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          min-height: auto;
          grid-template-rows: auto auto auto auto;
        }
      }

      @media (max-width: 1100px) {
        .hero {
          grid-template-columns: 1fr;
        }

        .hero-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .settings-grid {
          grid-template-columns: 1fr;
        }

        .settings-layout {
          grid-template-columns: 1fr;
        }

        .artifact-layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100% - 16px, 1500px);
          margin: 8px auto;
        }

        .sidebar,
        .topbar,
        .hero-main,
        .hero-side,
        .section {
          padding: 18px;
        }

        .hero-grid,
        .provider-grid {
          grid-template-columns: 1fr;
        }

        .topbar,
        .subtools {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .topbar-left,
        .topbar-right {
          align-items: stretch;
        }

        .view-tab {
          min-height: 50px;
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
      <aside class="panel sidebar">
        <div class="sidebar-brand">
          <div class="eyebrow"><span class="pulse"></span> LiNa Control Room</div>
          <h1>LiNa Ops</h1>
        </div>
        <nav class="sidebar-nav" id="view-nav">
          <button class="view-tab active" data-view="overview" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-5h6v5"/></svg></span>
            <span class="nav-copy"><strong>Visão Geral</strong><span>Resumo executivo e saúde da operação</span></span>
          </button>
          <button class="view-tab" data-view="infra" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/></svg></span>
            <span class="nav-copy"><strong>Infra</strong><span>Providers, persistência e runtime</span></span>
          </button>
          <button class="view-tab" data-view="composer" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M7 16V4l10 6-10 6Z"/></svg></span>
            <span class="nav-copy"><strong>Composer</strong><span>Execução manual do orquestrador</span></span>
          </button>
          <button class="view-tab" data-view="tasks" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m4 6 1.5 1.5L7.5 5"/><path d="m4 12 1.5 1.5L7.5 11"/><path d="m4 18 1.5 1.5L7.5 17"/></svg></span>
            <span class="nav-copy"><strong>Tarefas</strong><span>Criação, filtro e atualização de status</span></span>
          </button>
          <button class="view-tab" data-view="messages" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/></svg></span>
            <span class="nav-copy"><strong>Mensagens</strong><span>Histórico operacional persistido</span></span>
          </button>
          <button class="view-tab" data-view="telegram" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="m21 4-8.5 16-3.3-6.2L3 11l18-7Z"/><path d="m9.2 13.8 4.3-4.3"/></svg></span>
            <span class="nav-copy"><strong>Telegram</strong><span>Chats, origem e atividade do bot</span></span>
          </button>
          <button class="view-tab" data-view="executions" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/></svg></span>
            <span class="nav-copy"><strong>Execuções</strong><span>Timeline do orquestrador e providers</span></span>
          </button>
          <button class="view-tab" data-view="logs" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M7 4h10l3 3v13H4V4h3Z"/><path d="M8 11h8"/><path d="M8 15h8"/></svg></span>
            <span class="nav-copy"><strong>Logs</strong><span>Eventos recentes para depuração</span></span>
          </button>
          <button class="view-tab" data-view="artifacts" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4"/><path d="M12 11v10"/></svg></span>
            <span class="nav-copy"><strong>Artifacts</strong><span>Catálogo, acesso e edição dos manifests</span></span>
          </button>
          <button class="view-tab" data-view="settings" type="button">
            <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8l-.1.1a2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0l-.1-.1a2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8l.1-.1a2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0l.1.1a2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-.2a1 1 0 0 0-.9.6Z"/></svg></span>
            <span class="nav-copy"><strong>Configurações</strong><span>Auth, bootstrap e ajustes do painel</span></span>
          </button>
        </nav>
        <div class="sidebar-footer">
          <div class="version-pill">versão ${dashboardVersion}</div>
        </div>
      </aside>

      <section class="main-shell">
        <header class="panel topbar">
          <div class="topbar-left">
            <div class="topbar-title">
              <strong id="topbar-section-title">Visão Geral</strong>
              <span id="topbar-section-subtitle">Dashboard operacional</span>
            </div>
          </div>
          <div class="topbar-right">
            <div class="user-pill" id="current-user-pill">Sem sessão identificada</div>
            <small id="last-updated">Aguardando primeira carga...</small>
            <div class="version-pill">v${dashboardVersion}</div>
            <button id="theme-toggle-button" class="theme-toggle" type="button">Tema claro</button>
            <button id="refresh-button" type="button">Atualizar Agora</button>
            <button id="logout-button" type="button">Sair</button>
          </div>
        </header>

        <section class="workspace" id="workspace">
          <section class="page-stack">
        <article class="page-panel" data-view-panel="overview">
          <section class="panel section">
            <div class="section-head">
              <h2>Visão Geral</h2>
            </div>
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
          </section>
          <section class="hero" style="margin-top:14px;">
            <aside class="panel hero-side" style="grid-column: 1 / -1;">
              <div class="section-head">
                <h2>Runtime</h2>
              </div>
              <div class="status-stack" id="status-stack"></div>
            </aside>
          </section>
        </article>

        <article class="panel section page-panel" data-view-panel="composer">
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

        <article class="panel section page-panel" data-view-panel="infra">
          <div class="section-head">
            <h2>Providers</h2>
            <p>Capacidade atual dos modelos e estado operacional.</p>
          </div>
          <div class="provider-grid" id="providers-grid"></div>
        </article>

        <article class="panel section page-panel" data-view-panel="tasks">
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

        <article class="panel section page-panel" data-view-panel="messages">
          <div class="section-head">
            <h2>Mensagens Recentes</h2>
            <p>Histórico operacional da conversa persistida.</p>
          </div>
          <div class="section-tools">
            <label>
              Busca
              <input id="message-filter" class="control" type="text" placeholder="role, conteúdo, data..." />
            </label>
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

        <article class="panel section page-panel" data-view-panel="telegram">
          <div class="section-head">
            <h2>Telegram</h2>
            <p>Resumo por origem quando os metadados de mensagem estiverem disponíveis.</p>
          </div>
          <div class="section-tools">
            <label>
              Busca
              <input id="telegram-filter-query" class="control" type="text" placeholder="chat, usuário, conteúdo..." />
            </label>
            <label>
              Tipo
              <select id="telegram-filter-type" class="control">
                <option value="">Todos</option>
                <option value="text">text</option>
                <option value="voice">voice</option>
                <option value="audio">audio</option>
              </select>
            </label>
          </div>
          <div class="feed" id="telegram-feed"></div>
        </article>

        <article class="panel section page-panel" data-view-panel="logs">
          <div class="section-head">
            <h2>Logs do Sistema</h2>
            <p>Eventos recentes do runtime para depuração e monitoramento.</p>
          </div>
          <div class="section-tools">
            <label>
              Busca
              <input id="log-filter" class="control" type="text" placeholder="level, mensagem..." />
            </label>
            <label>
              Level
              <select id="log-filter-level" class="control">
                <option value="">Todos</option>
                <option value="info">info</option>
                <option value="error">error</option>
                <option value="warn">warn</option>
              </select>
            </label>
            <label>
              Categoria
              <select id="log-filter-category" class="control">
                <option value="">Todas</option>
                <option value="dashboard-audit">dashboard-audit</option>
                <option value="delegation-factory">delegation-factory</option>
                <option value="delegation-validation">delegation-validation</option>
                <option value="telegram-admin">telegram-admin</option>
                <option value="telegram-command">telegram-command</option>
                <option value="bootstrap">bootstrap</option>
                <option value="runtime">runtime</option>
              </select>
            </label>
          </div>
          <div class="feed" id="logs-feed"></div>
        </article>

        <article class="panel section page-panel" data-view-panel="executions">
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

        <article class="panel section page-panel" data-view-panel="artifacts">
          <div class="section-head">
            <h2>Artifacts</h2>
            <p>Gestão completa de agents, sub-agents e skills, incluindo acesso, manifesto e edição manual.</p>
          </div>
          <div class="artifact-toolbar">
            <label>
              Tipo
              <select id="artifact-filter-kind" class="control">
                <option value="">Todos</option>
                <option value="agent">agent</option>
                <option value="sub-agent">sub-agent</option>
                <option value="skill">skill</option>
              </select>
            </label>
            <label>
              Busca
              <input id="artifact-filter-query" class="control" type="text" placeholder="nome, descrição, acesso..." />
            </label>
          </div>
          <div class="artifact-layout">
            <div class="artifact-stack">
              <section class="settings-card">
                <h3>Factory de Artifacts</h3>
                <p>Crie agents, sub-agents e skills diretamente do painel usando os templates oficiais da LiNa, com validação imediata do manifest gerado.</p>
                <form class="settings-form" id="artifact-factory-form">
                  <label>
                    Tipo
                    <select id="artifact-kind" class="control">
                      <option value="agent">agent</option>
                      <option value="sub-agent">sub-agent</option>
                      <option value="skill">skill</option>
                    </select>
                  </label>
                  <label>
                    Nome
                    <input id="artifact-name" class="control" type="text" placeholder="ex: document-analyzer-specialist" required />
                  </label>
                  <label>
                    Descrição
                    <input id="artifact-description" class="control" type="text" placeholder="Descrição objetiva do artifact" required />
                  </label>
                  <label style="display:flex;align-items:center;gap:10px;">
                    <input id="artifact-overwrite" type="checkbox" />
                    sobrescrever se já existir
                  </label>
                  <button class="task-action" type="submit">Criar artifact</button>
                </form>
                <div class="composer-result" id="artifact-factory-result">Nenhum artifact criado nesta sessão.</div>
              </section>
              <section class="settings-card">
                <h3>Catálogo Atual</h3>
                <p>Itens já criados, com acesso efetivo e caminho do manifest.</p>
                <div class="artifact-list" id="artifacts-feed"></div>
              </section>
            </div>
            <section class="settings-card artifact-editor">
              <h3>Manifest Editor</h3>
              <p>Abra, revise e modifique manualmente o arquivo que define o artifact selecionado, com apoio de metadados estruturados e preview de diff antes do save.</p>
              <div class="composer-result" id="artifact-editor-summary">Selecione um artifact para começar.</div>
              <form class="settings-form" id="artifact-editor-form">
                <div class="artifact-structured-grid">
                  <label>
                    Nome
                    <input id="artifact-editor-name" class="control" type="text" readonly />
                  </label>
                  <label>
                    Tipo
                    <input id="artifact-editor-kind" class="control" type="text" readonly />
                  </label>
                  <label class="artifact-full">
                    Pode ser acessado por
                    <input id="artifact-editor-accessible" class="control" type="text" placeholder="LiNa, Admin, operator" />
                  </label>
                  <label class="artifact-full">
                    Pode ser editado por
                    <input id="artifact-editor-editable" class="control" type="text" placeholder="Admin" />
                  </label>
                </div>
                <div class="artifact-inline-actions">
                  <button class="task-action" id="artifact-editor-apply-structured" type="button">Aplicar metadados no manifest</button>
                </div>
                <p class="artifact-inline-note">Os campos acima atualizam o frontmatter. O editor raw continua como fonte final para ajustes manuais.</p>
                <label>
                  Caminho do arquivo
                  <input id="artifact-editor-path" class="control" type="text" readonly />
                </label>
                <label>
                  Conteúdo do manifest
                  <textarea id="artifact-editor-content" class="control" placeholder="O conteúdo do manifest aparecerá aqui."></textarea>
                </label>
                <label>
                  Preview do diff
                  <div id="artifact-editor-diff" class="artifact-diff">Nenhuma alteração em relação ao arquivo original.</div>
                </label>
                <button class="task-action" id="artifact-editor-save" type="submit">Salvar manifest</button>
              </form>
              <div class="composer-result" id="artifact-editor-result">Nenhuma alteração salva nesta sessão.</div>
            </section>
          </div>
        </article>

        <article class="panel section page-panel" data-view-panel="settings">
          <div class="section-head">
            <h2>Configurações</h2>
            <p>Autenticação, acesso operacional e governança do painel.</p>
          </div>
          <div class="settings-layout">
            <div class="settings-stack">
              <section class="settings-hero">
                <h3>Centro de Controle</h3>
                <p>Esta área concentra identidade, governança e automações sensíveis do dashboard. Cada trilha abaixo agrupa apenas um tipo de ação para evitar mistura entre credenciais, usuários e factory.</p>
                <div class="settings-metrics" id="settings-metrics">
                  <div class="settings-metric">Sessão em carregamento</div>
                </div>
              </section>

              <section class="settings-block">
                <div class="settings-section-title">Acesso e Identidade</div>
                <div class="settings-grid">
                  <section class="settings-card">
                    <h3>Criar usuário</h3>
                    <p>Cadastre novos acessos do dashboard e associe IDs do Telegram permitidos para esse usuário.</p>
                    <form class="settings-form" id="create-user-form">
                      <label>
                        Usuário
                        <input id="create-user-username" class="control" type="text" placeholder="ex: operador.lina" required />
                      </label>
                      <label>
                        Papel
                        <select id="create-user-role" class="control">
                          <option value="viewer">viewer</option>
                          <option value="operator">operator</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                      <label>
                        Senha inicial
                        <input id="create-user-password" class="control" type="password" placeholder="mínimo 8 caracteres" required />
                      </label>
                      <label>
                        IDs do Telegram
                        <input id="create-user-telegram-ids" class="control" type="text" placeholder="165169460, 123456789" />
                      </label>
                      <button class="task-action" type="submit">Criar usuário</button>
                    </form>
                  </section>

                  <section class="settings-card">
                    <h3>Gerenciar usuário</h3>
                    <p>Edite papel, IDs do Telegram, situação e senha operacional do usuário selecionado.</p>
                    <form class="settings-form" id="manage-user-form">
                      <label>
                        Usuário
                        <select id="manage-user-select" class="control"></select>
                      </label>
                      <label>
                        Papel
                        <select id="manage-user-role" class="control">
                          <option value="viewer">viewer</option>
                          <option value="operator">operator</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                      <label>
                        IDs do Telegram
                        <input id="manage-user-telegram-ids" class="control" type="text" placeholder="165169460, 123456789" />
                      </label>
                      <label>
                        Situação
                        <select id="manage-user-active" class="control">
                          <option value="true">ativo</option>
                          <option value="false">inativo</option>
                        </select>
                      </label>
                      <label>
                        Nova senha opcional
                        <input id="manage-user-password" class="control" type="password" placeholder="preencha só se quiser trocar" />
                      </label>
                      <button class="task-action" type="submit">Salvar usuário</button>
                    </form>
                  </section>
                </div>
              </section>

              <section class="settings-block">
                <div class="settings-section-title">Segurança da Sessão</div>
                <section class="settings-card">
                  <h3>Trocar minha senha</h3>
                  <p>Esse fluxo é pessoal e separado do gerenciamento administrativo. Use sua senha atual para confirmar a alteração.</p>
                  <form class="settings-form" id="self-password-form">
                    <label>
                      Senha atual
                      <input id="self-current-password" class="control" type="password" required />
                    </label>
                    <label>
                      Nova senha
                      <input id="self-new-password" class="control" type="password" required />
                    </label>
                    <label>
                      Confirmar nova senha
                      <input id="self-confirm-password" class="control" type="password" required />
                    </label>
                    <button class="task-action" type="submit">Trocar senha</button>
                  </form>
                </section>
              </section>
            </div>

            <aside class="settings-rail">
              <section class="settings-block">
                <div class="settings-section-title">Governança</div>
                <section class="settings-card">
                  <h3>Bootstrap Admin</h3>
                  <p>Ative ou desative a janela de criação do primeiro admin. Esse controle afeta somente o bootstrap do dashboard.</p>
                  <div class="settings-actions">
                    <button class="task-action" id="bootstrap-toggle-button" type="button">Alternar bootstrap</button>
                  </div>
                </section>
              </section>

              <section class="settings-block">
                <div class="settings-section-title">Diretório Operacional</div>
                <section class="settings-card">
                  <h3>Usuários e Permissões</h3>
                  <p>Lista operacional dos usuários do dashboard, com papéis, IDs do Telegram e permissões efetivas.</p>
                  <div class="feed" id="settings-feed"></div>
                </section>
              </section>
            </aside>
          </div>
        </article>
          </section>
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
        delegationCatalog: "/api/delegation/catalog",
        delegationFactory: "/api/delegation/factory",
        delegationArtifactContent: "/api/delegation/artifact-content",
        authState: "/dashboard/auth/state",
        authBootstrapToggle: "/dashboard/auth/bootstrap-toggle",
        authUsers: "/dashboard/auth/users",
        authMePassword: "/dashboard/auth/me/password",
      };

      const dashboardState = {
        health: null,
        status: null,
        providers: {},
        messages: [],
        tasks: [],
        executions: [],
        logs: [],
        artifactCatalog: { agents: [], subAgents: [], skills: [] },
        auth: null,
        activeView: "overview",
        theme: localStorage.getItem("lina-dashboard-theme") || "dark",
        activeArtifactPath: "",
        artifactEditorLoadedPath: "",
        artifactEditorOriginalContent: "",
        artifactEditorDraftContent: "",
      };

      const viewTitles = {
        overview: "Visão Geral",
        infra: "Infra",
        composer: "Composer",
        tasks: "Tarefas",
        messages: "Mensagens",
        telegram: "Telegram",
        executions: "Execuções",
        logs: "Logs",
        artifacts: "Artifacts",
        settings: "Configurações",
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

      const normalizeNewlines = (value) => String(value || "").replace(/\\r\\n/g, "\\n");

      const splitArtifactFrontmatter = (content) => {
        const normalized = normalizeNewlines(content);
        if (!normalized.startsWith("---\\n")) {
          return { hasFrontmatter: false, frontmatter: "", body: normalized };
        }

        const closingIndex = normalized.indexOf("\\n---\\n", 4);
        if (closingIndex === -1) {
          return { hasFrontmatter: false, frontmatter: "", body: normalized };
        }

        return {
          hasFrontmatter: true,
          frontmatter: normalized.slice(4, closingIndex),
          body: normalized.slice(closingIndex + 5),
        };
      };

      const parseArtifactMetadata = (content) => {
        const { hasFrontmatter, frontmatter } = splitArtifactFrontmatter(content);
        const metadata = {
          hasFrontmatter,
          accessibleBy: [],
          editableBy: [],
        };

        if (!hasFrontmatter) {
          return metadata;
        }

        let activeListKey = null;
        frontmatter.split("\\n").forEach((line) => {
          const listMatch = line.match(/^\\s*-\\s*(.+?)\\s*$/);
          if (listMatch && activeListKey) {
            metadata[activeListKey].push(listMatch[1].trim());
            return;
          }

          activeListKey = null;
          const fieldMatch = line.match(/^([a-zA-Z0-9_]+):\\s*(.*)$/);
          if (!fieldMatch) {
            return;
          }

          const [, key, rawValue] = fieldMatch;
          const value = rawValue.trim();
          if (key === "name") {
            metadata.name = value;
            return;
          }
          if (key === "description") {
            metadata.description = value;
            return;
          }
          if (key === "version") {
            metadata.version = value;
            return;
          }
          if (key === "accessible_by" || key === "editable_by") {
            const targetKey = key === "accessible_by" ? "accessibleBy" : "editableBy";
            if (value.startsWith("[") && value.endsWith("]")) {
              metadata[targetKey] = value
                .slice(1, -1)
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              return;
            }

            if (value) {
              metadata[targetKey] = [value];
              return;
            }

            activeListKey = targetKey;
          }
        });

        return metadata;
      };

      const normalizeStructuredList = (value, fallback) => {
        const normalized = String(value || "")
          .split(/[\\n,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        return normalized.length ? normalized : fallback;
      };

      const formatArtifactListField = (key, values) =>
        [key + ":", ...values.map((value) => "  - " + value)].join("\\n");

      const upsertArtifactListField = (frontmatter, key, values) => {
        const lines = normalizeNewlines(frontmatter).split("\\n");
        const nextLines = [];
        let replaced = false;

        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const fieldMatch = line.match(/^([a-zA-Z0-9_]+):\\s*(.*)$/);
          if (!fieldMatch || fieldMatch[1] !== key) {
            nextLines.push(line);
            continue;
          }

          replaced = true;
          nextLines.push(...formatArtifactListField(key, values).split("\\n"));
          index += 1;
          while (index < lines.length && /^\\s*-\\s+/.test(lines[index])) {
            index += 1;
          }
          index -= 1;
        }

        if (!replaced) {
          if (nextLines.length && nextLines[nextLines.length - 1] !== "") {
            nextLines.push("");
          }
          nextLines.push(...formatArtifactListField(key, values).split("\\n"));
        }

        return nextLines.join("\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
      };

      const applyArtifactStructuredFieldsToContent = (content, options) => {
        const source = normalizeNewlines(content);
        const { hasFrontmatter, frontmatter, body } = splitArtifactFrontmatter(source);
        const accessibleBy = normalizeStructuredList(options.accessibleBy, ["LiNa"]);
        const editableBy = normalizeStructuredList(options.editableBy, ["Admin"]);
        const baseFrontmatter = hasFrontmatter ? frontmatter : "";
        const withAccess = upsertArtifactListField(baseFrontmatter, "accessible_by", accessibleBy);
        const finalFrontmatter = upsertArtifactListField(withAccess, "editable_by", editableBy);
        const normalizedBody = hasFrontmatter ? body : source;
        return ["---", finalFrontmatter, "---", normalizedBody.replace(/^\\n*/, "")].join("\\n");
      };

      const computeLineDiff = (beforeValue, afterValue) => {
        const before = normalizeNewlines(beforeValue).split("\\n");
        const after = normalizeNewlines(afterValue).split("\\n");
        const rows = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));

        for (let i = before.length - 1; i >= 0; i -= 1) {
          for (let j = after.length - 1; j >= 0; j -= 1) {
            if (before[i] === after[j]) {
              rows[i][j] = rows[i + 1][j + 1] + 1;
            } else {
              rows[i][j] = Math.max(rows[i + 1][j], rows[i][j + 1]);
            }
          }
        }

        const diff = [];
        let i = 0;
        let j = 0;

        while (i < before.length && j < after.length) {
          if (before[i] === after[j]) {
            diff.push({ type: "context", value: before[i] });
            i += 1;
            j += 1;
            continue;
          }

          if (rows[i + 1][j] >= rows[i][j + 1]) {
            diff.push({ type: "remove", value: before[i] });
            i += 1;
          } else {
            diff.push({ type: "add", value: after[j] });
            j += 1;
          }
        }

        while (i < before.length) {
          diff.push({ type: "remove", value: before[i] });
          i += 1;
        }

        while (j < after.length) {
          diff.push({ type: "add", value: after[j] });
          j += 1;
        }

        return diff;
      };

      const formatTime = (value) => {
        if (!value) return "Sem data";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? safeText(value) : date.toLocaleString("pt-BR");
      };

      const parseTelegramIds = (value) =>
        String(value || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

      const renderArtifactValidation = (payload) => {
        const artifact = payload?.artifact;
        const validation = payload?.validation;

        if (!artifact) {
          return "Nenhum artifact retornado.";
        }

        return [
          (validation?.valid ? "Validação ok" : "Validação com pendências"),
          "tipo: " + safeText(artifact.kind),
          "nome: " + safeText(artifact.name),
          "manifest: " + safeText(artifact.manifestPath),
        ]
          .concat(
            (validation?.checks || []).map(
              (check) => (check.ok ? "ok" : "erro") + " · " + safeText(check.label) + " · " + safeText(check.details)
            )
          )
          .join("\\n");
      };

      const listEnabledPermissions = (permissions) =>
        Object.entries(permissions || {})
          .filter(([, enabled]) => Boolean(enabled))
          .map(([name]) => name);

      const humanizePermission = (permission) =>
        ({
          manageUsers: "Gerenciar usuários",
          manageBootstrap: "Controlar bootstrap",
          resetPasswords: "Resetar senhas",
          manageArtifacts: "Gerenciar artifacts",
          runComposer: "Executar composer",
          manageTasks: "Gerenciar tarefas",
          viewLogs: "Ver logs",
          viewSettings: "Ver configurações",
          useTelegramRun: "Usar /run no Telegram",
          useTelegramAdmin: "Usar comandos admin no Telegram",
        }[permission] || permission);

      const classifyLogCategory = (message) => {
        const normalized = safeText(message).toLowerCase();
        if (normalized.includes("[dashboard-audit]")) return "dashboard-audit";
        if (normalized.includes("[delegation-factory]")) return "delegation-factory";
        if (normalized.includes("[delegation-validation]")) return "delegation-validation";
        if (normalized.includes("[telegram-admin]")) return "telegram-admin";
        if (normalized.includes("[telegram-command]")) return "telegram-command";
        if (normalized.includes("bootstrap")) return "bootstrap";
        return "runtime";
      };

      const parseDelegationSummary = (summary) => {
        const raw = summary ? String(summary).trim() : "";
        if (!raw) {
          return {
            mode: null,
            agent: null,
            subAgent: null,
            skill: null,
            validation: null,
            artifact: null,
            raw: null,
          };
        }

        const fields = {};
        raw
          .split(" | ")
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => {
            const separatorIndex = part.indexOf("=");
            if (separatorIndex === -1) {
              return;
            }

            const key = part.slice(0, separatorIndex).trim();
            const value = part.slice(separatorIndex + 1).trim();
            if (key) {
              fields[key] = value;
            }
          });

        const artifactValue = fields.artifact || "";
        let artifact = null;
        if (artifactValue) {
          const firstSeparator = artifactValue.indexOf(":");
          const secondSeparator = artifactValue.indexOf(":", firstSeparator + 1);
          if (firstSeparator !== -1 && secondSeparator !== -1) {
            artifact = {
              kind: artifactValue.slice(0, firstSeparator),
              name: artifactValue.slice(firstSeparator + 1, secondSeparator),
              path: artifactValue.slice(secondSeparator + 1),
            };
          }
        }

        const normalizeNone = (value) =>
          !value || value === "none" || value === "n/a" ? null : value;

        return {
          mode: normalizeNone(fields.mode),
          agent: normalizeNone(fields.agent),
          subAgent: normalizeNone(fields.subAgent),
          skill: normalizeNone(fields.skill),
          validation: normalizeNone(fields.validation),
          artifact,
          raw,
        };
      };

      const flattenArtifactCatalog = (catalog) => [
        ...((catalog?.agents || []).map((item) => ({ ...item, kind: "agent" }))),
        ...((catalog?.subAgents || []).map((item) => ({ ...item, kind: "sub-agent" }))),
        ...((catalog?.skills || []).map((item) => ({ ...item, kind: "skill" }))),
      ];

      const getArtifactFilters = () => ({
        kind: document.getElementById("artifact-filter-kind").value.trim(),
        query: document.getElementById("artifact-filter-query").value.trim().toLowerCase(),
      });

      const getArtifactAccessText = (artifact) => {
        const access = Array.isArray(artifact?.accessibleBy) && artifact.accessibleBy.length
          ? artifact.accessibleBy.join(", ")
          : "LiNa";
        const editable = Array.isArray(artifact?.editableBy) && artifact.editableBy.length
          ? artifact.editableBy.join(", ")
          : "Admin";
        return {
          access,
          editable,
        };
      };

      const renderArtifactDiffPreview = () => {
        const diffBox = document.getElementById("artifact-editor-diff");
        if (!diffBox) {
          return;
        }

        const original = dashboardState.artifactEditorOriginalContent || "";
        const draft = dashboardState.artifactEditorDraftContent || "";
        if (normalizeNewlines(original) === normalizeNewlines(draft)) {
          diffBox.textContent = "Nenhuma alteração em relação ao arquivo original.";
          return;
        }

        diffBox.innerHTML = computeLineDiff(original, draft)
          .map((line) => {
            const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
            return '<span class="artifact-diff-line ' + line.type + '">' + escapeHtml(prefix + " " + line.value) + "</span>";
          })
          .join("");
      };

      const syncArtifactStructuredInputs = (content, artifact) => {
        const metadata = parseArtifactMetadata(content);
        const access = metadata.accessibleBy.length ? metadata.accessibleBy : (artifact?.accessibleBy || ["LiNa"]);
        const editable = metadata.editableBy.length ? metadata.editableBy : (artifact?.editableBy || ["Admin"]);

        const nameInput = document.getElementById("artifact-editor-name");
        const kindInput = document.getElementById("artifact-editor-kind");
        const accessibleInput = document.getElementById("artifact-editor-accessible");
        const editableInput = document.getElementById("artifact-editor-editable");

        if (nameInput) {
          nameInput.value = artifact?.name || metadata.name || "";
        }
        if (kindInput) {
          kindInput.value = artifact?.kind || "";
        }
        if (accessibleInput) {
          accessibleInput.value = access.join(", ");
        }
        if (editableInput) {
          editableInput.value = editable.join(", ");
        }
      };

      const updateArtifactEditorDraft = (content, artifact) => {
        const normalized = normalizeNewlines(content);
        dashboardState.artifactEditorDraftContent = normalized;
        const editorContent = document.getElementById("artifact-editor-content");
        if (editorContent && editorContent.value !== normalized) {
          editorContent.value = normalized;
        }
        syncArtifactStructuredInputs(normalized, artifact);
        renderArtifactDiffPreview();
      };

      const buildExecutionRows = (execution) => {
        const delegation = parseDelegationSummary(execution.delegationSummary);
        const rows = [];
        const selectedAgent = execution.selectedAgent || delegation.agent;
        const selectedSubAgent = execution.selectedSubAgent || delegation.subAgent;
        const selectedSkill = execution.selectedSkill || delegation.skill;

        rows.push({
          label: "Roteamento",
          value: [
            "agent: " + safeText(selectedAgent),
            "sub-agent: " + safeText(selectedSubAgent),
            "skill: " + safeText(selectedSkill),
          ].join(" · "),
        });

        rows.push({
          label: "Modo",
          value: safeText(delegation.mode),
        });

        if (delegation.artifact) {
          rows.push({
            label: "Artifact",
            value: [
              "tipo: " + safeText(delegation.artifact.kind),
              "nome: " + safeText(delegation.artifact.name),
              "path: " + safeText(delegation.artifact.path),
            ].join(" · "),
          });
        }

        if (delegation.validation) {
          rows.push({
            label: "Validação",
            value: delegation.validation,
          });
        }

        if (delegation.raw) {
          rows.push({
            label: "Resumo",
            value: delegation.raw,
          });
        }

        return rows;
      };

      const renderArtifacts = (catalog) => {
        const feed = document.getElementById("artifacts-feed");
        const summary = document.getElementById("artifact-editor-summary");
        const editorPath = document.getElementById("artifact-editor-path");
        const editorName = document.getElementById("artifact-editor-name");
        const editorKind = document.getElementById("artifact-editor-kind");
        const editorAccessible = document.getElementById("artifact-editor-accessible");
        const editorEditable = document.getElementById("artifact-editor-editable");
        const resultBox = document.getElementById("artifact-editor-result");
        const artifacts = flattenArtifactCatalog(catalog);
        const filters = getArtifactFilters();

        const filteredArtifacts = artifacts
          .filter((artifact) => {
            const access = getArtifactAccessText(artifact);
            const kindMatch = !filters.kind || artifact.kind === filters.kind;
            const queryMatch =
              !filters.query ||
              safeText(artifact.name).toLowerCase().includes(filters.query) ||
              safeText(artifact.description).toLowerCase().includes(filters.query) ||
              safeText(access.access).toLowerCase().includes(filters.query) ||
              safeText(access.editable).toLowerCase().includes(filters.query) ||
              safeText(artifact.path).toLowerCase().includes(filters.query);
            return kindMatch && queryMatch;
          })
          .sort((left, right) => String(left.name).localeCompare(String(right.name)));

        if (!filteredArtifacts.length) {
          renderEmpty(feed, "Nenhum artifact corresponde aos filtros atuais.");
          summary.textContent = "Selecione um artifact para começar.";
          editorPath.value = "";
          editorName.value = "";
          editorKind.value = "";
          editorAccessible.value = "";
          editorEditable.value = "";
          dashboardState.artifactEditorLoadedPath = "";
          dashboardState.artifactEditorOriginalContent = "";
          dashboardState.artifactEditorDraftContent = "";
          renderArtifactDiffPreview();
          return;
        }

        if (!dashboardState.activeArtifactPath || !filteredArtifacts.some((artifact) => artifact.path === dashboardState.activeArtifactPath)) {
          dashboardState.activeArtifactPath = filteredArtifacts[0].path;
        }

        const selectedArtifact =
          filteredArtifacts.find((artifact) => artifact.path === dashboardState.activeArtifactPath) ||
          filteredArtifacts[0];
        const selectedAccess = getArtifactAccessText(selectedArtifact);

        feed.innerHTML = filteredArtifacts.map((artifact) => {
          const access = getArtifactAccessText(artifact);
          const isActive = artifact.path === dashboardState.activeArtifactPath;
          return \`
            <article class="artifact-item \${isActive ? "active" : ""}" data-artifact-path="\${escapeHtml(artifact.path)}">
              <div class="feed-meta">
                <span class="badge neutral">\${escapeHtml(artifact.kind)}</span>
                <span>\${escapeHtml(artifact.version || "sem versão")}</span>
              </div>
              <div class="feed-title">\${escapeHtml(artifact.name)}</div>
              <div class="feed-body">\${escapeHtml(artifact.description)}</div>
              <div class="artifact-meta">
                <span class="artifact-chip">acesso: \${escapeHtml(access.access)}</span>
                <span class="artifact-chip">edição: \${escapeHtml(access.editable)}</span>
              </div>
            </article>
          \`;
        }).join("");

        summary.innerHTML = [
          '<strong>' + escapeHtml(selectedArtifact.name) + '</strong>',
          'tipo: ' + escapeHtml(selectedArtifact.kind),
          'acesso: ' + escapeHtml(selectedAccess.access),
          'edição: ' + escapeHtml(selectedAccess.editable),
          'arquivo: ' + escapeHtml(selectedArtifact.path),
        ].join('<br />');
        editorPath.value = selectedArtifact.path || "";
        if (dashboardState.artifactEditorLoadedPath !== selectedArtifact.path) {
          dashboardState.artifactEditorLoadedPath = selectedArtifact.path || "";
          dashboardState.artifactEditorOriginalContent = normalizeNewlines(selectedArtifact.content || "");
          resultBox.textContent = "Nenhuma alteração salva nesta sessão.";
        }
        updateArtifactEditorDraft(selectedArtifact.content || "", selectedArtifact);
      };

      const getTelegramFilters = () => ({
        query: document.getElementById("telegram-filter-query").value.trim().toLowerCase(),
        type: document.getElementById("telegram-filter-type").value.trim(),
      });

      const hasUiPermission = (permission) =>
        Boolean(dashboardState.auth?.currentUser?.permissions?.[permission]);

      const setElementVisibility = (selector, visible) => {
        const element = document.querySelector(selector);
        if (!element) {
          return;
        }

        element.style.display = visible ? "" : "none";
      };

      const setElementDisabled = (selector, disabled) => {
        const element = document.querySelector(selector);
        if (!element) {
          return;
        }

        element.disabled = disabled;
      };

      const applyPermissionState = (authPayload) => {
        const currentUser = authPayload?.currentUser;
        const permissions = currentUser?.permissions || {};

        const canManageUsers = Boolean(permissions.manageUsers);
        const canManageBootstrap = Boolean(permissions.manageBootstrap);
        const canManageArtifacts = Boolean(permissions.manageArtifacts);
        const canManageTasks = Boolean(permissions.manageTasks);
        const canRunComposer = Boolean(permissions.runComposer);
        const canViewLogs = Boolean(permissions.viewLogs);

        setElementVisibility('.view-tab[data-view="composer"]', canRunComposer);
        setElementVisibility('[data-view-panel="composer"]', canRunComposer);
        setElementVisibility('.view-tab[data-view="logs"]', canViewLogs);
        setElementVisibility('[data-view-panel="logs"]', canViewLogs);

        setElementVisibility("#create-user-form", canManageUsers);
        setElementVisibility("#manage-user-form", canManageUsers);
        setElementVisibility("#artifact-factory-form", canManageArtifacts);
        setElementVisibility("#artifact-editor-form", canManageArtifacts);
        setElementVisibility("#bootstrap-toggle-button", canManageBootstrap);

        setElementDisabled("#task-title", !canManageTasks);
        setElementDisabled("#task-agent", !canManageTasks);
        setElementDisabled("#task-status", !canManageTasks);
        setElementDisabled('#task-form button[type="submit"]', !canManageTasks);

        setElementDisabled("#composer-text", !canRunComposer);
        setElementDisabled("#composer-task", !canRunComposer);
        setElementDisabled('#composer-form button[type="submit"]', !canRunComposer);
        setElementDisabled("#artifact-kind", !canManageArtifacts);
        setElementDisabled("#artifact-name", !canManageArtifacts);
        setElementDisabled("#artifact-description", !canManageArtifacts);
        setElementDisabled("#artifact-overwrite", !canManageArtifacts);
        setElementDisabled("#artifact-editor-accessible", !canManageArtifacts);
        setElementDisabled("#artifact-editor-editable", !canManageArtifacts);
        setElementDisabled("#artifact-editor-content", !canManageArtifacts);
        setElementDisabled("#artifact-editor-apply-structured", !canManageArtifacts);
        setElementDisabled('#artifact-factory-form button[type="submit"]', !canManageArtifacts);
        setElementDisabled('#artifact-editor-form button[type="submit"]', !canManageArtifacts);

        if (dashboardState.activeView === "composer" && !canRunComposer) {
          dashboardState.activeView = "overview";
        }

        if (dashboardState.activeView === "logs" && !canViewLogs) {
          dashboardState.activeView = "overview";
        }
      };

      const applyTheme = () => {
        const theme = dashboardState.theme === "light" ? "light" : "dark";
        document.body.dataset.theme = theme;
        const button = document.getElementById("theme-toggle-button");
        if (button) {
          button.textContent = theme === "dark" ? "Tema claro" : "Tema escuro";
        }
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
        const entries = Array.isArray(providers) ? providers : [];

        if (!entries.length) {
          renderEmpty(grid, "Nenhum provider disponível.");
          return;
        }

        grid.innerHTML = entries.map((provider) => {
          const state = provider?.enabled ? "configured" : "not-configured";
          const model = provider?.model || provider?.details || "sem modelo";
          return \`
            <article class="provider-card">
              <div class="feed-meta">
                <strong>\${escapeHtml(provider?.name || "provider")}</strong>
                <span class="badge \${badgeClass(state)}">\${provider?.enabled ? "ativo" : "off"}</span>
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
        category: document.getElementById("log-filter-category").value.trim(),
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
        const activeProviders = (Array.isArray(providers) ? providers : []).filter((item) => item?.enabled).length;
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
        const canManageTasks = hasUiPermission("manageTasks");
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
            <div class="feed-submeta">targetAgent: \${escapeHtml(task.targetAgent)} · targetSubAgent: \${escapeHtml(task.targetSubAgent)} · targetSkill: \${escapeHtml(task.targetSkill)}</div>
            <div class="feed-submeta">modo: \${escapeHtml(task.delegationMode)} · por: \${escapeHtml(task.delegatedBy)}</div>
            <div class="task-actions">
              \${canManageTasks
                ? [
                    '<button class="task-action" data-task-id="' + escapeHtml(task.id) + '" data-status="pending" type="button">pending</button>',
                    '<button class="task-action" data-task-id="' + escapeHtml(task.id) + '" data-status="running" type="button">running</button>',
                    '<button class="task-action" data-task-id="' + escapeHtml(task.id) + '" data-status="completed" type="button">completed</button>',
                    '<button class="task-action" data-task-id="' + escapeHtml(task.id) + '" data-status="failed" type="button">failed</button>',
                  ].join("")
                : '<span class="muted">Somente operator/admin podem alterar status.</span>'
              }
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
        const filters = getTelegramFilters();
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
            messageTypes: new Set(),
            lastMessageAt: message.createdAt,
            lastPreview: message.content,
          };

          current.count += 1;
          if (metadata.messageType) {
            current.messageTypes.add(metadata.messageType);
          }
          current.lastMessageAt = message.createdAt;
          current.lastPreview = message.content;
          grouped.set(key, current);
        }

        const cards = Array.from(grouped.values())
          .filter((item) => {
            const typeMatch = !filters.type || item.messageTypes.has(filters.type);
            const queryMatch =
              !filters.query ||
              safeText(item.chatId).toLowerCase().includes(filters.query) ||
              safeText(item.userId).toLowerCase().includes(filters.query) ||
              safeText(item.username).toLowerCase().includes(filters.query) ||
              safeText(item.firstName).toLowerCase().includes(filters.query) ||
              safeText(item.lastPreview).toLowerCase().includes(filters.query);
            return typeMatch && queryMatch;
          })
          .sort((left, right) => String(right.lastMessageAt).localeCompare(String(left.lastMessageAt)))
          .slice(0, 12);

        if (!cards.length) {
          renderEmpty(feed, "Nenhum chat do Telegram corresponde aos filtros atuais.");
          return;
        }

        feed.innerHTML = cards.map((item) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge neutral">\${escapeHtml(item.chatType || "telegram")}</span>
              <span>\${formatTime(item.lastMessageAt)}</span>
            </div>
            <div class="feed-title">\${escapeHtml(item.firstName || item.username || item.chatId || "origem desconhecida")}</div>
            <div class="feed-body">chatId: \${escapeHtml(item.chatId)} | userId: \${escapeHtml(item.userId)} | mensagens: \${escapeHtml(item.count)}</div>
            <div class="feed-submeta">tipos: \${escapeHtml(Array.from(item.messageTypes).join(", ") || "n/a")}</div>
            <div class="feed-body">\${escapeHtml(item.lastPreview)}</div>
          </article>
        \`).join("");
      };

      const renderLogs = (logs) => {
        const feed = document.getElementById("logs-feed");
        const filters = getLogFilters();
        const filteredLogs = (logs || []).filter((log) => {
          const levelMatch = !filters.level || log.level === filters.level;
          const category = classifyLogCategory(log.message);
          const categoryMatch = !filters.category || category === filters.category;
          const queryMatch =
            !filters.query ||
            safeText(log.message).toLowerCase().includes(filters.query) ||
            safeText(log.level).toLowerCase().includes(filters.query);
          return levelMatch && categoryMatch && queryMatch;
        });

        if (!filteredLogs.length) {
          renderEmpty(feed, "Nenhum log recente.");
          return;
        }

        feed.innerHTML = filteredLogs.map((log) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${badgeClass(log.level === "error" ? "degraded" : log.level === "info" ? "ok" : "configured")}">\${escapeHtml(log.level)}</span>
              <span class="badge neutral">\${escapeHtml(classifyLogCategory(log.message))}</span>
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
              <span class="badge neutral">\${escapeHtml(execution.provider)}</span>
              <span>\${formatTime(execution.createdAt)}</span>
            </div>
            <div class="feed-title">Execução \${escapeHtml(execution.id)}</div>
            <div class="feed-body">\${escapeHtml(execution.resultSummary)}</div>
            <div class="execution-grid">
              \${buildExecutionRows(execution).map((row) => \`
                <div class="execution-row">
                  <div class="execution-label">\${escapeHtml(row.label)}</div>
                  <div class="execution-value">\${escapeHtml(row.value)}</div>
                </div>
              \`).join("")}
            </div>
          </article>
        \`).join("");
      };

      const renderSettings = (authPayload) => {
        const feed = document.getElementById("settings-feed");
        const metrics = document.getElementById("settings-metrics");
        const pill = document.getElementById("current-user-pill");
        const toggleButton = document.getElementById("bootstrap-toggle-button");
        const manageUserSelect = document.getElementById("manage-user-select");
        const manageUserTelegramIds = document.getElementById("manage-user-telegram-ids");
        const manageUserActive = document.getElementById("manage-user-active");

        if (!authPayload) {
          pill.textContent = "Sessão sem contexto";
          metrics.innerHTML = '<div class="settings-metric">Sem estado de autenticação</div>';
          toggleButton.disabled = true;
          manageUserSelect.innerHTML = '<option value="">Sem usuários</option>';
          renderEmpty(feed, "Autenticação do dashboard indisponível.");
          return;
        }

        const currentUser = authPayload.currentUser;
        const authState = authPayload.authState;
        const users = authPayload.users || [];
        const canManageUsers = Boolean(currentUser?.permissions?.manageUsers);
        const canManageBootstrap = Boolean(currentUser?.permissions?.manageBootstrap);
        const canManageArtifacts = Boolean(currentUser?.permissions?.manageArtifacts);
        const currentPermissionList = listEnabledPermissions(currentUser?.permissions || {});

        pill.textContent = currentUser
          ? safeText(currentUser.username) + " · " + safeText(currentUser.role)
          : "Sessão sem usuário";

        if (authPayload.mode !== "database") {
          metrics.innerHTML = [
            '<div class="settings-metric">modo legado</div>',
            '<div class="settings-metric">bootstrap indisponível</div>',
          ].join("");
          toggleButton.disabled = true;
          manageUserSelect.innerHTML = '<option value="">Modo legado</option>';
          renderEmpty(feed, "O dashboard está em modo legado de token. O gerenciamento de usuários no banco só aparece no modo database.");
          return;
        }

        metrics.innerHTML = [
          '<div class="settings-metric">usuário: ' + escapeHtml(currentUser?.username || "n/a") + '</div>',
          '<div class="settings-metric">papel: ' + escapeHtml(currentUser?.role || "n/a") + '</div>',
          '<div class="settings-metric">bootstrap: ' + escapeHtml(authState?.allowAdminBootstrap ? "on" : "off") + '</div>',
          '<div class="settings-metric">usuários: ' + escapeHtml(authState?.usersCount || 0) + '</div>',
          '<div class="settings-metric">permissões: ' + escapeHtml(currentPermissionList.length) + '</div>',
        ].join("");

        toggleButton.disabled = false;
        toggleButton.textContent = authState?.allowAdminBootstrap
          ? "Desabilitar bootstrap admin"
          : "Habilitar bootstrap admin";
        toggleButton.style.display = canManageBootstrap ? "" : "none";

        const currentManagedUsername = manageUserSelect.value;
        manageUserSelect.innerHTML = users.length
          ? users
              .map(
                (user) =>
                  \`<option value="\${escapeHtml(user.username)}">\${escapeHtml(user.username)} (\${user.isActive ? "ativo" : "inativo"})</option>\`
              )
              .join("")
          : '<option value="">Sem usuários</option>';

        if (currentManagedUsername && users.some((user) => user.username === currentManagedUsername)) {
          manageUserSelect.value = currentManagedUsername;
        }

        const selectedUser =
          users.find((user) => user.username === manageUserSelect.value) ||
          users[0] ||
          null;

        if (selectedUser) {
          manageUserSelect.value = selectedUser.username;
          const manageUserRole = document.getElementById("manage-user-role");
          manageUserRole.value = selectedUser.role || "viewer";
          manageUserTelegramIds.value = (selectedUser.telegramUserIds || []).join(", ");
          manageUserActive.value = selectedUser.isActive ? "true" : "false";
        } else {
          const manageUserRole = document.getElementById("manage-user-role");
          manageUserRole.value = "viewer";
          manageUserTelegramIds.value = "";
          manageUserActive.value = "true";
        }

        const createUserForm = document.getElementById("create-user-form");
        const manageUserForm = document.getElementById("manage-user-form");
        const artifactFactoryForm = document.getElementById("artifact-factory-form");
        const artifactEditorForm = document.getElementById("artifact-editor-form");
        createUserForm.style.display = canManageUsers ? "" : "none";
        manageUserForm.style.display = canManageUsers ? "" : "none";
        artifactFactoryForm.style.display = canManageArtifacts ? "" : "none";
        artifactEditorForm.style.display = canManageArtifacts ? "" : "none";

        const userCards = users.length
          ? users.map((user) => \`
              <article class="feed-item">
                <div class="feed-meta">
                  <span class="badge \${user.isActive ? "ok" : "bad"}">\${user.isActive ? "ativo" : "inativo"}</span>
                  <span class="badge neutral">\${escapeHtml(user.role)}</span>
                  <span>\${formatTime(user.createdAt)}</span>
                </div>
                <div class="feed-title">\${escapeHtml(user.username)}</div>
                <div class="feed-body">role: \${escapeHtml(user.role)} | último login: \${escapeHtml(user.lastLoginAt ? formatTime(user.lastLoginAt) : "nunca")}</div>
                <div class="feed-submeta">telegram ids: \${escapeHtml((user.telegramUserIds || []).join(", ") || "nenhum")}</div>
                <div class="feed-submeta">permissões: \${escapeHtml(listEnabledPermissions(user.permissions).map(humanizePermission).join(" · ") || "nenhuma")}</div>
              </article>
            \`).join("")
          : '<div class="empty">Nenhum usuário cadastrado ainda.</div>';

        feed.innerHTML = [
          \`<article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${authState?.allowAdminBootstrap ? "warn" : "neutral"}">\${authState?.allowAdminBootstrap ? "bootstrap on" : "bootstrap off"}</span>
              <span>Usuários: \${escapeHtml(authState?.usersCount || 0)}</span>
            </div>
            <div class="feed-title">Sessão atual: \${escapeHtml(currentUser?.username || "n/a")}</div>
            <div class="feed-body">Papel: \${escapeHtml(currentUser?.role || "n/a")} | bootstrap: \${authState?.allowAdminBootstrap ? "habilitado" : "desabilitado"}</div>
            <div class="feed-submeta">Permissões atuais: \${escapeHtml(currentPermissionList.map(humanizePermission).join(" · ") || "nenhuma")}</div>
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
        const tabs = document.querySelectorAll(".view-tab");
        const panels = document.querySelectorAll("[data-view-panel]");
        const titleNode = document.getElementById("topbar-section-title");

        tabs.forEach((tab) => {
          tab.classList.toggle("active", tab.dataset.view === activeView);
        });
        panels.forEach((panel) => {
          panel.classList.toggle("active", panel.dataset.viewPanel === activeView);
        });
        if (titleNode) {
          titleNode.textContent = viewTitles[activeView] || "Painel";
        }
      };

      const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          let details = "";
          try {
            const payload = await response.json();
            details = payload?.error ? " - " + payload.error : "";
          } catch (_error) {
            details = "";
          }
          throw new Error("Falha ao carregar " + url + ": " + response.status + details);
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
          let details = "";
          try {
            const errorPayload = await response.json();
            details = errorPayload?.error ? " - " + errorPayload.error : "";
          } catch (_error) {
            details = "";
          }
          throw new Error("Falha na operação " + method + " " + url + ": " + response.status + details);
        }

        return response.json();
      };

      const rerenderFeeds = () => {
        renderTasks(dashboardState.tasks);
        renderExecutions(dashboardState.executions);
        renderMessages(dashboardState.messages);
        renderTelegramView(dashboardState.messages);
        renderLogs(dashboardState.logs);
        renderArtifacts(dashboardState.artifactCatalog);
        renderSettings(dashboardState.auth);
        applyViewState();
      };

      const refresh = async () => {
        try {
          const [health, status, providers, messages, tasks, executions, logs, auth, artifactCatalog] = await Promise.all([
            fetchJson(endpoints.health),
            fetchJson(endpoints.status),
            fetchJson(endpoints.providers),
            fetchJson(endpoints.messages),
            fetchJson(endpoints.tasks),
            fetchJson(endpoints.executions),
            fetchJson(endpoints.logs),
            fetchJson(endpoints.authState),
            fetchJson(endpoints.delegationCatalog),
          ]);

          dashboardState.health = health;
          dashboardState.status = status;
          dashboardState.providers = providers;
          dashboardState.messages = messages;
          dashboardState.tasks = tasks;
          dashboardState.executions = executions;
          dashboardState.logs = logs;
          dashboardState.artifactCatalog = artifactCatalog;
          dashboardState.auth = auth;

          applyPermissionState(auth);
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
      document.getElementById("theme-toggle-button").addEventListener("click", () => {
        dashboardState.theme = dashboardState.theme === "dark" ? "light" : "dark";
        localStorage.setItem("lina-dashboard-theme", dashboardState.theme);
        applyTheme();
      });
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
      document.getElementById("manage-user-select").addEventListener("change", () => {
        renderSettings(dashboardState.auth);
      });
      document.getElementById("create-user-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const usernameInput = document.getElementById("create-user-username");
        const roleInput = document.getElementById("create-user-role");
        const passwordInput = document.getElementById("create-user-password");
        const telegramIdsInput = document.getElementById("create-user-telegram-ids");

        try {
          await sendJson(endpoints.authUsers, "POST", {
            username: usernameInput.value.trim(),
            role: roleInput.value,
            password: passwordInput.value,
            telegramUserIds: parseTelegramIds(telegramIdsInput.value),
          });
          usernameInput.value = "";
          roleInput.value = "viewer";
          passwordInput.value = "";
          telegramIdsInput.value = "";
          await refresh();
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao criar usuário";
        }
      });
      document.getElementById("manage-user-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const userSelect = document.getElementById("manage-user-select");
        const roleInput = document.getElementById("manage-user-role");
        const telegramIdsInput = document.getElementById("manage-user-telegram-ids");
        const activeSelect = document.getElementById("manage-user-active");
        const passwordInput = document.getElementById("manage-user-password");
        const username = userSelect.value;

        if (!username) {
          return;
        }

        try {
          await sendJson(\`\${endpoints.authUsers}/\${encodeURIComponent(username)}\`, "PATCH", {
            role: roleInput.value,
            telegramUserIds: parseTelegramIds(telegramIdsInput.value),
            isActive: activeSelect.value === "true",
          });

          if (passwordInput.value.trim()) {
            await sendJson(\`\${endpoints.authUsers}/\${encodeURIComponent(username)}/password\`, "POST", {
              password: passwordInput.value,
            });
          }

          passwordInput.value = "";
          await refresh();
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao atualizar usuário";
        }
      });
      document.getElementById("self-password-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const currentPasswordInput = document.getElementById("self-current-password");
        const newPasswordInput = document.getElementById("self-new-password");
        const confirmPasswordInput = document.getElementById("self-confirm-password");

        if (newPasswordInput.value !== confirmPasswordInput.value) {
          document.getElementById("last-updated").textContent = "A confirmação de senha não confere.";
          return;
        }

        try {
          await sendJson(endpoints.authMePassword, "POST", {
            currentPassword: currentPasswordInput.value,
            newPassword: newPasswordInput.value,
          });
          currentPasswordInput.value = "";
          newPasswordInput.value = "";
          confirmPasswordInput.value = "";
          await refresh();
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao trocar senha";
        }
      });
      document.getElementById("artifact-factory-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const kindInput = document.getElementById("artifact-kind");
        const nameInput = document.getElementById("artifact-name");
        const descriptionInput = document.getElementById("artifact-description");
        const overwriteInput = document.getElementById("artifact-overwrite");
        const resultBox = document.getElementById("artifact-factory-result");

        try {
          const payload = await sendJson(endpoints.delegationFactory, "POST", {
            kind: kindInput.value,
            name: nameInput.value.trim(),
            description: descriptionInput.value.trim(),
            overwrite: Boolean(overwriteInput.checked),
          });

          resultBox.textContent = renderArtifactValidation(payload);
          nameInput.value = "";
          descriptionInput.value = "";
          overwriteInput.checked = false;
          await refresh();
        } catch (error) {
          resultBox.textContent = error instanceof Error ? error.message : "Falha ao criar artifact";
        }
      });
      document.getElementById("artifact-editor-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const resultBox = document.getElementById("artifact-editor-result");
        const pathInput = document.getElementById("artifact-editor-path");
        const contentInput = document.getElementById("artifact-editor-content");

        if (!pathInput.value.trim()) {
          resultBox.textContent = "Selecione um artifact antes de salvar.";
          return;
        }

        try {
          const payload = await sendJson(endpoints.delegationArtifactContent, "PUT", {
            path: pathInput.value.trim(),
            content: contentInput.value,
          });

          dashboardState.artifactEditorLoadedPath = pathInput.value.trim();
          dashboardState.artifactEditorOriginalContent = normalizeNewlines(contentInput.value);
          dashboardState.artifactEditorDraftContent = normalizeNewlines(contentInput.value);
          renderArtifactDiffPreview();
          resultBox.textContent = payload.validation?.valid
            ? "Manifest salvo com validação ok."
            : "Manifest salvo com pendências de validação.";

          const refreshedCatalog = await fetchJson(endpoints.delegationCatalog);
          dashboardState.artifactCatalog = refreshedCatalog;
          renderArtifacts(dashboardState.artifactCatalog);
        } catch (error) {
          resultBox.textContent = error instanceof Error ? error.message : "Falha ao salvar manifest";
        }
      });
      document.getElementById("artifact-editor-apply-structured").addEventListener("click", () => {
        const contentInput = document.getElementById("artifact-editor-content");
        const accessibleInput = document.getElementById("artifact-editor-accessible");
        const editableInput = document.getElementById("artifact-editor-editable");
        const resultBox = document.getElementById("artifact-editor-result");

        const nextContent = applyArtifactStructuredFieldsToContent(contentInput.value, {
          accessibleBy: accessibleInput.value,
          editableBy: editableInput.value,
        });

        updateArtifactEditorDraft(nextContent, {
          kind: document.getElementById("artifact-editor-kind").value,
          name: document.getElementById("artifact-editor-name").value,
        });
        resultBox.textContent = "Metadados estruturados aplicados no manifest. Revise o diff antes de salvar.";
      });
      document.getElementById("artifact-editor-content").addEventListener("input", (event) => {
        updateArtifactEditorDraft(event.target.value, {
          kind: document.getElementById("artifact-editor-kind").value,
          name: document.getElementById("artifact-editor-name").value,
        });
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
        "telegram-filter-query",
        "telegram-filter-type",
        "log-filter",
        "log-filter-level",
        "log-filter-category",
        "execution-filter-status",
        "execution-filter-provider",
        "artifact-filter-kind",
        "artifact-filter-query",
      ].forEach((id) => {
        document.getElementById(id).addEventListener("input", rerenderFeeds);
        document.getElementById(id).addEventListener("change", rerenderFeeds);
      });

      document.getElementById("artifacts-feed").addEventListener("click", (event) => {
        const card = event.target.closest("[data-artifact-path]");

        if (!card) {
          return;
        }

        dashboardState.activeArtifactPath = card.dataset.artifactPath || "";
        renderArtifacts(dashboardState.artifactCatalog);
      });

      document.getElementById("view-nav").addEventListener("click", (event) => {
        const button = event.target.closest(".view-tab");
        if (!button) {
          return;
        }

        dashboardState.activeView = button.dataset.view || "overview";
        applyViewState();
      });

      applyTheme();
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

  try {
    return await fetch(targetUrl, {
      method,
      headers,
      body: safeBody ? new Blob([safeBody], { type: "application/json" }) : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local API unavailable";

    return new Response(
      JSON.stringify({
        error: `Local API unavailable: ${message}`,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
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
        await logDashboardAudit(`bootstrap admin created: ${session.user.username}`);
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

    if (url === "/change-password" && request.method === "POST") {
      if (dashboardAuthMode !== "database") {
        sendJson(response, 404, { error: "Password change is only available with database auth." });
        return;
      }

      const payload = new URLSearchParams((await readBody(request)).toString("utf8"));
      const username = payload.get("username") || "";
      const currentPassword = payload.get("currentPassword") || "";
      const newPassword = payload.get("newPassword") || "";
      const confirmPassword = payload.get("confirmPassword") || "";

      if (newPassword !== confirmPassword) {
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
        await dashboardAuthStore!.changePasswordWithCurrentPassword({
          username,
          currentPassword,
          newPassword,
        });
        await logDashboardAudit(`password changed from login screen: ${username}`);
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          loginHtml({
            authState: await dashboardAuthStore!.getAuthState().catch(() => null),
            infoMessage: "Senha atualizada com sucesso. Faça login com a nova senha.",
          })
        );
        return;
      } catch (error) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          loginHtml({
            errorMessage: error instanceof Error ? error.message : "Falha ao trocar a senha.",
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
        users: hasPermission(authContext, "manageUsers") ? await dashboardAuthStore!.listUsers() : [],
      });
      return;
    }

    if (url === "/dashboard/auth/bootstrap-toggle" && request.method === "POST") {
      if (!authContext.isAuthenticated || dashboardAuthMode !== "database") {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }
      if (!requirePermission(response, authContext, "manageBootstrap")) {
        return;
      }

      const rawBody = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
        enabled?: boolean;
      };
      await dashboardAuthStore!.setAllowAdminBootstrap(Boolean(rawBody.enabled));
      await logDashboardAudit(
        `${authContext.currentUser?.username || "unknown"} set bootstrap to ${Boolean(rawBody.enabled) ? "on" : "off"}`
      );
      sendJson(response, 200, {
        ok: true,
        authState: await dashboardAuthStore!.getAuthState(),
      });
      return;
    }

    if (url === "/dashboard/auth/users" && request.method === "POST") {
      if (!authContext.isAuthenticated || dashboardAuthMode !== "database") {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }
      if (!requirePermission(response, authContext, "manageUsers")) {
        return;
      }

      const rawBody = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
        username?: string;
        password?: string;
        role?: string;
        telegramUserIds?: string[];
      };

      const user = await dashboardAuthStore!.createUser({
        username: rawBody.username || "",
        password: rawBody.password || "",
        role: normalizeDashboardRole(rawBody.role),
        telegramUserIds: rawBody.telegramUserIds || [],
      });
      await logDashboardAudit(
        `${authContext.currentUser?.username || "unknown"} created user ${user.username} as ${user.role}`
      );
      sendJson(response, 201, { ok: true, user });
      return;
    }

    if (url.startsWith("/dashboard/auth/users/") && request.method === "PATCH") {
      if (!authContext.isAuthenticated || dashboardAuthMode !== "database") {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }
      if (!requirePermission(response, authContext, "manageUsers")) {
        return;
      }

      const username = decodeURIComponent(url.split("/")[4] || "");
      const rawBody = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
        role?: string;
        isActive?: boolean;
        telegramUserIds?: string[];
      };

      const user = await dashboardAuthStore!.updateUser(username, {
        role: rawBody.role ? normalizeDashboardRole(rawBody.role) : undefined,
        isActive: rawBody.isActive,
        telegramUserIds: rawBody.telegramUserIds,
      });
      await logDashboardAudit(
        `${authContext.currentUser?.username || "unknown"} updated user ${user.username} to ${user.role} (${user.isActive ? "active" : "inactive"})`
      );
      sendJson(response, 200, { ok: true, user });
      return;
    }

    if (url.startsWith("/dashboard/auth/users/") && url.endsWith("/password") && request.method === "POST") {
      if (!authContext.isAuthenticated || dashboardAuthMode !== "database") {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }
      if (!requirePermission(response, authContext, "resetPasswords")) {
        return;
      }

      const username = decodeURIComponent(url.split("/")[4] || "");
      const rawBody = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
        password?: string;
      };

      const user = await dashboardAuthStore!.setUserPassword(username, rawBody.password || "");
      await logDashboardAudit(
        `${authContext.currentUser?.username || "unknown"} reset password for ${user.username}`
      );
      sendJson(response, 200, { ok: true, user });
      return;
    }

    if (url === "/dashboard/auth/me/password" && request.method === "POST") {
      if (!authContext.isAuthenticated || dashboardAuthMode !== "database" || !authContext.currentUser) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const rawBody = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
        currentPassword?: string;
        newPassword?: string;
      };

      const user = await dashboardAuthStore!.changePasswordWithCurrentPassword({
        username: authContext.currentUser.username,
        currentPassword: rawBody.currentPassword || "",
        newPassword: rawBody.newPassword || "",
      });
      await logDashboardAudit(`${authContext.currentUser.username} changed own password`);
      sendJson(response, 200, { ok: true, user });
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
      const method = request.method || "GET";

      if ((url === "/api/orchestrator/run" || url.startsWith("/api/orchestrator/run?")) && !hasPermission(authContext, "runComposer")) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (((url === "/api/tasks" && method === "POST") || (url.startsWith("/api/tasks/") && method === "PATCH")) && !hasPermission(authContext, "manageTasks")) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (url === "/api/delegation/factory" && method === "POST" && !hasPermission(authContext, "manageArtifacts")) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (url === "/api/delegation/artifact-content" && (method === "PUT" || method === "PATCH") && !hasPermission(authContext, "manageArtifacts")) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (url.startsWith("/api/logs") && !hasPermission(authContext, "viewLogs")) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const body =
        method === "GET" || method === "HEAD"
          ? undefined
          : new Uint8Array(await readBody(request));
      const proxied = await proxyRequest(url, method, body);

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
