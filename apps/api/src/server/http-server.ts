import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { LinaEnv } from "../config/env";
import { MemoryManager } from "../core/memory/memory-manager";
import { LinaOrchestrator } from "../core/orchestrator/orchestrator";
import { ProviderFactory } from "../core/providers/provider-factory";
import { SkillLoader } from "../core/skills/skill-loader";
import { TelegramRuntime } from "../telegram/telegram-runtime";

type HttpServerDependencies = {
  env: LinaEnv;
  memoryManager: MemoryManager;
  orchestrator: LinaOrchestrator;
  providerFactory: ProviderFactory;
  skillLoader: SkillLoader;
  telegramRuntime: TelegramRuntime;
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

export const startHttpServer = (dependencies: HttpServerDependencies) => {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const { method = "GET", url = "/" } = request;

      if (method === "GET" && url === "/health") {
        const persistence = await dependencies.memoryManager.getHealth();
        const telegram = dependencies.telegramRuntime.getStatus();
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            status: persistence.connected ? "ok" : "degraded",
            app: dependencies.env.appName,
            persistence,
            telegram,
          })
        );
        return;
      }

      if (method === "GET" && url === "/status") {
        const conversation = await dependencies.memoryManager.getConversation();
        const tasks = await dependencies.memoryManager.listTasks();
        const persistence = await dependencies.memoryManager.getHealth();
        const providers = dependencies.providerFactory.inspect();
        const telegram = dependencies.telegramRuntime.getStatus();
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            app: dependencies.env.appName,
            environment: dependencies.env.appEnv,
            defaultProvider: dependencies.env.defaultProvider,
            maxIterations: dependencies.env.maxIterations,
            conversationSize: conversation.length,
            tasksCount: tasks.length,
            persistence,
            providers,
            telegram,
          })
        );
        return;
      }

      if (method === "GET" && url === "/providers") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(dependencies.providerFactory.inspect()));
        return;
      }

      if (method === "GET" && url === "/skills") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(dependencies.skillLoader.load()));
        return;
      }

      if (method === "POST" && url === "/orchestrator/run") {
        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as { text?: string };

        if (!payload.text) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Missing `text` in request body." }));
          return;
        }

        await dependencies.memoryManager.append("user", payload.text);
        const persistence = await dependencies.memoryManager.getHealth();
        const runtimeContext = JSON.stringify(
          {
            app: dependencies.env.appName,
            environment: dependencies.env.appEnv,
            persistence,
            providers: dependencies.providerFactory.inspect(),
            availableSkills: dependencies.skillLoader.load().map((skill) => ({
              name: skill.name,
              description: skill.description,
            })),
          },
          null,
          2
        );
        const result = await dependencies.orchestrator.handle({
          text: payload.text,
          runtimeContext,
        });
        await dependencies.memoryManager.append("assistant", result.answer);

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(result));
        return;
      }

      if (method === "GET" && url === "/memory/messages") {
        const messages = await dependencies.memoryManager.getConversation();
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(messages));
        return;
      }

      if (method === "GET" && url === "/tasks") {
        const tasks = await dependencies.memoryManager.listTasks();
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(tasks));
        return;
      }

      if (method === "POST" && url === "/tasks") {
        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as {
          title?: string;
          status?: string;
          assignedAgent?: string;
        };

        if (!payload.title) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Missing `title` in request body." }));
          return;
        }

        const task = await dependencies.memoryManager.createTask({
          title: payload.title,
          status: payload.status || "pending",
          assignedAgent: payload.assignedAgent || null,
        });
        await dependencies.memoryManager.log("info", `Task created: ${task.title}`);

        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify(task));
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      await dependencies.memoryManager.log("error", message).catch(() => undefined);
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: message }));
    }
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `[LiNa] HTTP server could not bind to port ${dependencies.env.appPort}: port already in use`
      );
      return;
    }

    console.error("[LiNa] HTTP server error", error);
  });

  server.listen(dependencies.env.appPort, () => {
    console.log(`[LiNa] HTTP server listening on port ${dependencies.env.appPort}`);
  });

  return server;
};
