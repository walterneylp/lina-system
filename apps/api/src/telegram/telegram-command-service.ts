import { LinaEnv } from "../config/env";
import { MemoryManager } from "../core/memory/memory-manager";
import { LinaOrchestrator } from "../core/orchestrator/orchestrator";
import { ProviderFactory } from "../core/providers/provider-factory";
import { SkillLoader } from "../core/skills/skill-loader";
import { TelegramRuntime } from "./telegram-runtime";
import { DashboardAuthStore } from "../../../dashboard/src/auth/dashboard-auth-store";

type TelegramCommandServiceOptions = {
  env: LinaEnv;
  memoryManager: MemoryManager;
  orchestrator: LinaOrchestrator;
  providerFactory: ProviderFactory;
  skillLoader: SkillLoader;
  telegramRuntime: TelegramRuntime;
};

type ParsedCommand = {
  name: string;
  args: string[];
  rawArgs: string;
};

export class TelegramCommandService {
  private readonly dashboardAuthStore: DashboardAuthStore | null;

  constructor(private readonly options: TelegramCommandServiceOptions) {
    this.dashboardAuthStore =
      options.env.supabaseUrl && options.env.supabaseServiceRoleKey
        ? new DashboardAuthStore({
            url: options.env.supabaseUrl,
            serviceRoleKey: options.env.supabaseServiceRoleKey,
          })
        : null;
  }

  public async handle(text: string): Promise<string | null> {
    const command = this.parseCommand(text);

    if (!command) {
      return null;
    }

    switch (command.name) {
      case "help":
      case "ajuda":
        return this.handleHelp();
      case "health":
        return this.handleHealth();
      case "status":
        return this.handleStatus();
      case "tasks":
      case "tarefas":
        return this.handleTasks(command.args);
      case "run":
        return this.handleRun(command.rawArgs);
      case "dashboard":
        return this.handleDashboard(command.args);
      default:
        return "Comando nao reconhecido. Use /help para ver os comandos disponiveis.";
    }
  }

  private parseCommand(text: string): ParsedCommand | null {
    const normalized = text.trim();
    if (!normalized.startsWith("/")) {
      return null;
    }

    const withoutSlash = normalized.slice(1).trim();
    if (!withoutSlash) {
      return null;
    }

    const [name, ...args] = withoutSlash.split(/\s+/);
    const rawArgs = withoutSlash.slice(name.length).trim();

    return {
      name: name.toLowerCase(),
      args,
      rawArgs,
    };
  }

  private async handleHealth(): Promise<string> {
    const persistence = await this.options.memoryManager.getHealth();
    const telegram = this.options.telegramRuntime.getStatus();

    return [
      "Saude da LiNa",
      `- aplicacao: ${this.options.env.appName}`,
      `- ambiente: ${this.options.env.appEnv}`,
      `- persistencia: ${persistence.provider} (${persistence.connected ? "conectada" : "indisponivel"})`,
      `- telegram: ${telegram.pollingEnabled ? "polling ativo" : "polling inativo"}`,
      `- provider padrao: ${this.options.env.defaultProvider}`,
    ].join("\n");
  }

  private async handleStatus(): Promise<string> {
    const conversation = await this.options.memoryManager.getConversation();
    const tasks = await this.options.memoryManager.listTasks();
    const executions = await this.options.memoryManager.listExecutions(10);
    const providers = this.options.providerFactory.inspect();
    const configuredProviders = providers.filter((value) => value.enabled);
    const failedExecutions = executions.filter((execution) => execution.status === "failed").length;

    return [
      "Status operacional da LiNa",
      `- mensagens persistidas: ${conversation.length}`,
      `- tarefas: ${tasks.length}`,
      `- execucoes recentes: ${executions.length}`,
      `- falhas recentes: ${failedExecutions}`,
      `- providers ativos: ${configuredProviders.map((provider) => provider.name).join(", ") || "nenhum"}`,
    ].join("\n");
  }

  private async handleTasks(args: string[]): Promise<string> {
    const requestedLimit = Number.parseInt(args[0] || "5", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 10))
      : 5;
    const tasks = await this.options.memoryManager.listTasks();
    const selected = tasks.slice(0, limit);

    if (!selected.length) {
      return "Nao existem tarefas registradas no momento.";
    }

    return [
      `Tarefas recentes (${selected.length})`,
      ...selected.map(
        (task, index) =>
          `${index + 1}. [${task.status}] ${task.title}${task.assignedAgent ? ` · ${task.assignedAgent}` : ""}`
      ),
    ].join("\n");
  }

  private async handleRun(rawArgs: string): Promise<string> {
    const text = rawArgs.trim();

    if (!text) {
      return "Use /run seguido do prompt. Exemplo: /run resuma o status da LiNa.";
    }

    const persistence = await this.options.memoryManager.getHealth();
    const runtimeContext = JSON.stringify(
      {
        app: this.options.env.appName,
        environment: this.options.env.appEnv,
        persistence,
        providers: this.options.providerFactory.inspect(),
        availableSkills: this.options.skillLoader.load().map((skill) => ({
          name: skill.name,
          description: skill.description,
        })),
      },
      null,
      2
    );

    const result = await this.options.orchestrator.handle({
      text,
      runtimeContext,
    });

    return [
      "Execucao concluida",
      `- provider: ${result.provider}`,
      `- iteracoes: ${result.iterations}`,
      "",
      result.answer,
    ].join("\n");
  }

  private async handleDashboard(args: string[]): Promise<string> {
    const [scope, value] = args.map((item) => item.toLowerCase());

    if (scope !== "bootstrap") {
      return "Use /dashboard bootstrap status|on|off";
    }

    if (!this.dashboardAuthStore) {
      return "A configuracao do dashboard no banco nao esta disponivel neste ambiente.";
    }

    if (!value || value === "status") {
      const authState = await this.dashboardAuthStore.getAuthState();
      return [
        "Bootstrap do dashboard",
        `- habilitado: ${authState.allowAdminBootstrap ? "sim" : "nao"}`,
        `- usuarios cadastrados: ${authState.usersCount}`,
      ].join("\n");
    }

    if (value !== "on" && value !== "off") {
      return "Use /dashboard bootstrap status|on|off";
    }

    const enabled = value === "on";
    await this.dashboardAuthStore.setAllowAdminBootstrap(enabled);
    const authState = await this.dashboardAuthStore.getAuthState();

    return [
      "Bootstrap do dashboard atualizado",
      `- habilitado: ${authState.allowAdminBootstrap ? "sim" : "nao"}`,
      `- usuarios cadastrados: ${authState.usersCount}`,
    ].join("\n");
  }

  private handleHelp(): string {
    return [
      "Comandos Telegram da LiNa",
      "/health",
      "/status",
      "/tasks [limite]",
      "/run <prompt>",
      "/dashboard bootstrap status",
      "/dashboard bootstrap on",
      "/dashboard bootstrap off",
    ].join("\n");
  }
}
