import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { LinaEnv } from "../config/env";
import { MemoryManager } from "../core/memory/memory-manager";
import { LinaOrchestrator } from "../core/orchestrator/orchestrator";
import { SkillLoader } from "../core/skills/skill-loader";

type HttpServerDependencies = {
  env: LinaEnv;
  memoryManager: MemoryManager;
  orchestrator: LinaOrchestrator;
  skillLoader: SkillLoader;
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
    const { method = "GET", url = "/" } = request;

    if (method === "GET" && url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok", app: dependencies.env.appName }));
      return;
    }

    if (method === "GET" && url === "/status") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          app: dependencies.env.appName,
          environment: dependencies.env.appEnv,
          defaultProvider: dependencies.env.defaultProvider,
          maxIterations: dependencies.env.maxIterations,
          conversationSize: dependencies.memoryManager.getConversation().length,
        })
      );
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

      dependencies.memoryManager.append("user", payload.text);
      const result = await dependencies.orchestrator.handle({ text: payload.text });
      dependencies.memoryManager.append("assistant", result.answer);

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
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
