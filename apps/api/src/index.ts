import { loadEnv } from "./config/env";
import { AgentLoader } from "./core/agents/agent-loader";
import { AgentLoop } from "./core/agent-loop/agent-loop";
import { AgentSkillFactoryExecutor } from "./core/delegation/agent-skill-factory-executor";
import { DelegationArtifactFactory } from "./core/delegation/artifact-factory";
import { DelegationArtifactValidator } from "./core/delegation/artifact-validator";
import { MemoryManager } from "./core/memory/memory-manager";
import { createMemoryStoreWithFallback } from "./core/memory/memory-store.factory";
import { LinaOrchestrator } from "./core/orchestrator/orchestrator";
import { ProviderFactory } from "./core/providers/provider-factory";
import { SkillLoader } from "./core/skills/skill-loader";
import { RuntimeLock } from "./runtime/runtime-lock";
import { startHttpServer } from "./server/http-server";
import { AudioPreprocessor } from "./telegram/audio-preprocessor";
import { TelegramAccessControl } from "./telegram/telegram-access-control";
import { TelegramClient } from "./telegram/telegram-client";
import { GroqAudioTranscriber } from "./telegram/groq-audio-transcriber";
import { TelegramInputHandler } from "./telegram/telegram-input-handler";
import { TelegramCommandService } from "./telegram/telegram-command-service";
import { TelegramOutputHandler } from "./telegram/telegram-output-handler";
import { TelegramPollingRunner } from "./telegram/telegram-polling-runner";
import { TelegramRuntime } from "./telegram/telegram-runtime";

const env = loadEnv();
const providerFactory = new ProviderFactory();
const skillLoader = new SkillLoader(env.skillsDirectory);
const agentLoader = new AgentLoader(env.agentsDirectory, "AGENT.md", "agent");
const subAgentLoader = new AgentLoader(env.subAgentsDirectory, "SUB_AGENT.md", "sub-agent");
const telegramRuntime = new TelegramRuntime();
const agentLoop = new AgentLoop({
  providerFactory,
  maxIterations: env.maxIterations,
});

export const bootstrapLiNa = async () => {
  const runtimeLock = new RuntimeLock({
    lockFilePath: `${env.tempDirectory.replace(/\/$/, "")}/lina-api.lock`,
  });
  await runtimeLock.acquire();

  const memoryStore = await createMemoryStoreWithFallback(env);
  const memoryManager = new MemoryManager(memoryStore);
  const artifactFactory = new DelegationArtifactFactory({
    agentsDirectory: env.agentsDirectory,
    subAgentsDirectory: env.subAgentsDirectory,
    skillsDirectory: env.skillsDirectory,
    templatesDirectory: "./.agents/templates",
  });
  const artifactValidator = new DelegationArtifactValidator({
    agentsDirectory: env.agentsDirectory,
    subAgentsDirectory: env.subAgentsDirectory,
    skillsDirectory: env.skillsDirectory,
  });
  const agentSkillFactoryExecutor = new AgentSkillFactoryExecutor({
    artifactFactory,
    artifactValidator,
  });
  const orchestrator = new LinaOrchestrator(
    agentLoop,
    skillLoader,
    agentLoader,
    subAgentLoader,
    agentSkillFactoryExecutor,
    env.appName,
    env.appEnv
  );
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
    providerFactory,
    skillLoader,
    agentLoader,
    subAgentLoader,
    telegramRuntime,
  });

  let telegramRunner: TelegramPollingRunner | null = null;

  if (env.telegramBotToken) {
    const telegramClient = new TelegramClient({ token: env.telegramBotToken });
    const audioPreprocessor = new AudioPreprocessor();
    const accessControl = new TelegramAccessControl({ env });
    const audioTranscriber = new GroqAudioTranscriber({
      apiKey: process.env.GROQ_API_KEYS?.split(",").map((value) => value.trim()).filter(Boolean)[0],
      model: env.groqTranscriptionModel,
    });
    const commandService = new TelegramCommandService({
      env,
      memoryManager,
      orchestrator,
      providerFactory,
      skillLoader,
      agentLoader,
      subAgentLoader,
      telegramRuntime,
    });
    telegramRuntime.setStatus({
      configured: true,
      authenticated: false,
      pollingEnabled: false,
    });
    const identity = await telegramClient.getMe();
    const outputHandler = new TelegramOutputHandler(telegramClient);
    const inputHandler = new TelegramInputHandler({
      allowedUserIds: env.telegramAllowedUserIds,
      orchestrator,
      memoryManager,
      client: telegramClient,
      outputHandler,
      audioTranscriber,
      audioPreprocessor,
      commandService,
      accessControl,
    });

    telegramRunner = new TelegramPollingRunner({
      client: telegramClient,
      inputHandler,
      pollingIntervalMs: env.telegramPollingInterval,
    });
    telegramRunner.start();
    telegramRuntime.setStatus({
      configured: true,
      authenticated: true,
      pollingEnabled: true,
      identity,
    });
    console.log("[LiNa] Telegram polling enabled");
  } else {
    telegramRuntime.setStatus({
      configured: false,
      authenticated: false,
      pollingEnabled: false,
      details: "TELEGRAM_BOT_TOKEN not configured",
    });
  }

  const shutdown = async () => {
    telegramRunner?.stop();
    httpServer.close();
    await runtimeLock.release();
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    console.log(`[LiNa] shutting down on ${signal}`);
    void shutdown().finally(() => process.exit(0));
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  process.once("exit", () => {
    void runtimeLock.release();
  });

  return { env, memoryManager, orchestrator, httpServer, telegramRunner, telegramRuntime };
};

if (process.argv[1]?.endsWith("/apps/api/src/index.ts")) {
  void bootstrapLiNa().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error";
    console.error("[LiNa] bootstrap failed", message);
    process.exit(1);
  });
}
