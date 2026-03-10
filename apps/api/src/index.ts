import { loadEnv } from "./config/env";
import { AgentLoop } from "./core/agent-loop/agent-loop";
import { MemoryManager } from "./core/memory/memory-manager";
import { createMemoryStore } from "./core/memory/memory-store.factory";
import { LinaOrchestrator } from "./core/orchestrator/orchestrator";
import { ProviderFactory } from "./core/providers/provider-factory";
import { SkillLoader } from "./core/skills/skill-loader";
import { startHttpServer } from "./server/http-server";
import { TelegramClient } from "./telegram/telegram-client";
import { TelegramInputHandler } from "./telegram/telegram-input-handler";
import { TelegramOutputHandler } from "./telegram/telegram-output-handler";
import { TelegramPollingRunner } from "./telegram/telegram-polling-runner";

const env = loadEnv();
const providerFactory = new ProviderFactory();
const memoryStore = createMemoryStore(env);
const memoryManager = new MemoryManager(memoryStore);
const skillLoader = new SkillLoader(env.skillsDirectory);
const agentLoop = new AgentLoop({
  providerFactory,
  maxIterations: env.maxIterations,
});
const orchestrator = new LinaOrchestrator(agentLoop, skillLoader);

export const bootstrapLiNa = async () => {
  const status = {
    appName: env.appName,
    environment: env.appEnv,
    appPort: env.appPort,
    defaultProvider: env.defaultProvider,
    fallbackOrder: env.fallbackOrder,
    maxIterations: env.maxIterations,
    maxExecutionTimeMs: env.maxExecutionTimeMs,
  };

  console.log("[LiNa] bootstrap ready", status);
  await memoryManager.append("system", JSON.stringify(status));
  await memoryManager.log("info", "LiNa bootstrap completed");
  const httpServer = startHttpServer({
    env,
    memoryManager,
    orchestrator,
    skillLoader,
  });

  let telegramRunner: TelegramPollingRunner | null = null;

  if (env.telegramBotToken) {
    const telegramClient = new TelegramClient({ token: env.telegramBotToken });
    const outputHandler = new TelegramOutputHandler(telegramClient);
    const inputHandler = new TelegramInputHandler({
      allowedUserIds: env.telegramAllowedUserIds,
      orchestrator,
      memoryManager,
      client: telegramClient,
      outputHandler,
    });

    telegramRunner = new TelegramPollingRunner({
      client: telegramClient,
      inputHandler,
      pollingIntervalMs: env.telegramPollingInterval,
    });
    telegramRunner.start();
    console.log("[LiNa] Telegram polling enabled");
  }

  return { env, memoryManager, orchestrator, httpServer, telegramRunner };
};

if (process.argv[1]?.endsWith("/apps/api/src/index.ts")) {
  void bootstrapLiNa();
}
