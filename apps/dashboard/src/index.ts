import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";

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
const readEnv = (key: string, fallback: string): string => process.env[key] || fileEnv[key] || fallback;

const dashboardPort = Number.parseInt(readEnv("DASHBOARD_PORT", "3001"), 10);
const apiBaseUrl = readEnv("DASHBOARD_API_BASE", `http://localhost:${readEnv("APP_PORT", "3012")}`);

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
        grid-template-columns: repeat(2, minmax(0, 1fr));
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

      .toolbar small {
        color: var(--muted);
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
            </div>
            <div class="metric">
              <div class="metric-label">Mensagens</div>
              <div class="metric-value" id="metric-messages">0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Tarefas</div>
              <div class="metric-value" id="metric-tasks">0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Providers Ativos</div>
              <div class="metric-value" id="metric-providers">0</div>
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

      <div class="toolbar">
        <button id="refresh-button" type="button">Atualizar Agora</button>
        <small id="last-updated">Aguardando primeira carga...</small>
      </div>

      <section class="content-grid">
        <article class="panel section">
          <div class="section-head">
            <h2>Providers</h2>
            <p>Capacidade atual dos modelos e estado operacional.</p>
          </div>
          <div class="provider-grid" id="providers-grid"></div>
        </article>

        <article class="panel section">
          <div class="section-head">
            <h2>Tarefas</h2>
            <p>Tarefas persistidas pela LiNa.</p>
          </div>
          <div class="feed" id="tasks-feed"></div>
        </article>

        <article class="panel section">
          <div class="section-head">
            <h2>Mensagens Recentes</h2>
            <p>Histórico operacional da conversa persistida.</p>
          </div>
          <div class="feed" id="messages-feed"></div>
        </article>

        <article class="panel section">
          <div class="section-head">
            <h2>Logs do Sistema</h2>
            <p>Eventos recentes do runtime para depuração e monitoramento.</p>
          </div>
          <div class="feed" id="logs-feed"></div>
        </article>
      </section>
    </main>

    <script>
      const endpoints = {
        health: "/api/health",
        status: "/api/status",
        providers: "/api/providers",
        messages: "/api/memory/messages",
        tasks: "/api/tasks",
        logs: "/api/logs?limit=30",
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
                <span>\${item.description}</span>
              </div>
              <div class="badge \${badgeClass(item.value)}">\${badgeValue}</div>
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
                <strong>\${name}</strong>
                <span class="badge \${badgeClass(state)}">\${provider?.configured ? "ativo" : "off"}</span>
              </div>
              <h3>\${model}</h3>
              <p>\${safeText(provider?.details || "Provider carregado sem detalhe adicional.")}</p>
            </article>
          \`;
        }).join("");
      };

      const renderTasks = (tasks) => {
        const feed = document.getElementById("tasks-feed");
        if (!tasks?.length) {
          renderEmpty(feed, "Nenhuma tarefa registrada.");
          return;
        }

        feed.innerHTML = tasks.slice(0, 12).map((task) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${badgeClass(task.status === "completed" ? "ok" : task.status === "failed" ? "degraded" : "configured")}">\${safeText(task.status)}</span>
              <span>\${formatTime(task.createdAt)}</span>
            </div>
            <div class="feed-title">\${safeText(task.title)}</div>
            <div class="feed-body">Agente: \${safeText(task.assignedAgent)}</div>
          </article>
        \`).join("");
      };

      const renderMessages = (messages) => {
        const feed = document.getElementById("messages-feed");
        if (!messages?.length) {
          renderEmpty(feed, "Nenhuma mensagem persistida.");
          return;
        }

        feed.innerHTML = messages.slice(-12).reverse().map((message) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge neutral">\${safeText(message.role)}</span>
              <span>\${formatTime(message.createdAt)}</span>
            </div>
            <div class="feed-body">\${safeText(message.content)}</div>
          </article>
        \`).join("");
      };

      const renderLogs = (logs) => {
        const feed = document.getElementById("logs-feed");
        if (!logs?.length) {
          renderEmpty(feed, "Nenhum log recente.");
          return;
        }

        feed.innerHTML = logs.map((log) => \`
          <article class="feed-item">
            <div class="feed-meta">
              <span class="badge \${badgeClass(log.level === "error" ? "degraded" : log.level === "info" ? "ok" : "configured")}">\${safeText(log.level)}</span>
              <span>\${formatTime(log.createdAt)}</span>
            </div>
            <div class="feed-body">\${safeText(log.message)}</div>
          </article>
        \`).join("");
      };

      const updateMetrics = (health, providers, messages, tasks) => {
        document.getElementById("metric-health").textContent = safeText(health?.status || "n/a");
        document.getElementById("metric-messages").textContent = safeText(messages?.length || 0);
        document.getElementById("metric-tasks").textContent = safeText(tasks?.length || 0);
        const activeProviders = Object.values(providers || {}).filter((item) => item?.configured).length;
        document.getElementById("metric-providers").textContent = safeText(activeProviders);
      };

      const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Falha ao carregar " + url + ": " + response.status);
        }
        return response.json();
      };

      const refresh = async () => {
        try {
          const [health, status, providers, messages, tasks, logs] = await Promise.all([
            fetchJson(endpoints.health),
            fetchJson(endpoints.status),
            fetchJson(endpoints.providers),
            fetchJson(endpoints.messages),
            fetchJson(endpoints.tasks),
            fetchJson(endpoints.logs),
          ]);

          renderStatus(health, status);
          renderProviders(providers);
          renderTasks(tasks);
          renderMessages(messages);
          renderLogs(logs);
          updateMetrics(health, providers, messages, tasks);
          document.getElementById("last-updated").textContent = "Atualizado em " + new Date().toLocaleString("pt-BR");
        } catch (error) {
          document.getElementById("last-updated").textContent = error instanceof Error ? error.message : "Falha ao atualizar";
        }
      };

      document.getElementById("refresh-button").addEventListener("click", refresh);
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
