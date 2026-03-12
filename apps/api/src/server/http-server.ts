import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { LinaEnv } from "../config/env";
import { AgentLoader } from "../core/agents/agent-loader";
import { DelegationArtifactFactory } from "../core/delegation/artifact-factory";
import { DelegationArtifactValidator } from "../core/delegation/artifact-validator";
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
  agentLoader: AgentLoader;
  subAgentLoader: AgentLoader;
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
  const artifactFactory = new DelegationArtifactFactory({
    agentsDirectory: dependencies.env.agentsDirectory,
    subAgentsDirectory: dependencies.env.subAgentsDirectory,
    skillsDirectory: dependencies.env.skillsDirectory,
    templatesDirectory: "./.agents/templates",
  });
  const artifactValidator = new DelegationArtifactValidator({
    agentsDirectory: dependencies.env.agentsDirectory,
    subAgentsDirectory: dependencies.env.subAgentsDirectory,
    skillsDirectory: dependencies.env.skillsDirectory,
  });
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
            agentsCount: dependencies.agentLoader.load().length,
            subAgentsCount: dependencies.subAgentLoader.load().length,
            skillsCount: dependencies.skillLoader.load().length,
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

      if (method === "GET" && url === "/agents") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(dependencies.agentLoader.load()));
        return;
      }

      if (method === "GET" && url === "/sub-agents") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(dependencies.subAgentLoader.load()));
        return;
      }

      if (method === "GET" && url === "/delegation/catalog") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            agents: dependencies.agentLoader.load(),
            subAgents: dependencies.subAgentLoader.load(),
            skills: dependencies.skillLoader.load(),
          })
        );
        return;
      }

      if (method === "GET" && url === "/delegation/templates") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(artifactFactory.getTemplateCatalog()));
        return;
      }

      if (method === "POST" && url === "/delegation/factory") {
        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as {
          kind?: "agent" | "sub-agent" | "skill";
          name?: string;
          description?: string;
          version?: string;
          role?: string;
          delegationScope?: string;
          allowedSkills?: string[];
          capabilities?: string[];
          objective?: string;
          whenToUse?: string[];
          rules?: string[];
          overwrite?: boolean;
        };

        if (!payload.kind || !payload.name || !payload.description) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({ error: "Missing `kind`, `name` or `description` in request body." })
          );
          return;
        }

        const artifact = artifactFactory.create({
          kind: payload.kind,
          name: payload.name,
          description: payload.description,
          version: payload.version,
          role: payload.role,
          delegationScope: payload.delegationScope,
          allowedSkills: payload.allowedSkills,
          capabilities: payload.capabilities,
          objective: payload.objective,
          whenToUse: payload.whenToUse,
          rules: payload.rules,
          overwrite: payload.overwrite,
        });
        const validation = artifactValidator.validate(payload.kind, artifact.manifestPath);
        await dependencies.memoryManager.log(
          "info",
          `Delegation artifact ${artifact.overwritten ? "updated" : "created"}: ${artifact.kind} ${artifact.name}`
        );

        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ artifact, validation }));
        return;
      }

      if (method === "POST" && url === "/delegation/validate") {
        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as {
          kind?: "agent" | "sub-agent" | "skill";
          manifestPath?: string;
        };

        if (!payload.kind || !payload.manifestPath) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({ error: "Missing `kind` or `manifestPath` in request body." })
          );
          return;
        }

        const validation = artifactValidator.validate(payload.kind, payload.manifestPath);

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(validation));
        return;
      }

      if (method === "POST" && url === "/orchestrator/run") {
        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as {
          text?: string;
          taskId?: string;
          delegatedBy?: string;
        };

        if (!payload.text) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Missing `text` in request body." }));
          return;
        }

        const execution = await dependencies.memoryManager.createExecution({
          taskId: payload.taskId || null,
          status: "running",
          provider: null,
          resultSummary: null,
        });

        try {
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
                capabilities: skill.capabilities,
              })),
              availableAgents: dependencies.agentLoader.load().map((agent) => ({
                name: agent.name,
                description: agent.description,
                role: agent.role,
              })),
              availableSubAgents: dependencies.subAgentLoader.load().map((agent) => ({
                name: agent.name,
                description: agent.description,
                role: agent.role,
              })),
            },
            null,
            2
          );
          const result = await dependencies.orchestrator.handle({
            text: payload.text,
            runtimeContext,
          });
          let taskId = payload.taskId || null;
          const delegatedTaskTitle = result.createdArtifact
            ? `Create ${result.createdArtifact.kind} ${result.createdArtifact.name}`
            : payload.text;
          const artifactSummary = result.createdArtifact
            ? `artifact=${result.createdArtifact.kind}:${result.createdArtifact.name}:${result.createdArtifact.manifestPath}`
            : null;
          const validationSummary = result.validationSummary
            ? `validation=${result.validationSummary}`
            : null;

          if (!taskId && result.delegationMode && result.delegationMode !== "none") {
            const delegatedTask = await dependencies.memoryManager.createTask({
              title: delegatedTaskTitle,
              status:
                result.createdArtifact && result.artifactValidation?.valid
                  ? "completed"
                  : "delegated",
              assignedAgent: result.agentName || result.subAgentName || null,
              targetAgent: result.agentName || null,
              targetSubAgent: result.subAgentName || null,
              targetSkill: result.skillName || null,
              delegationMode: result.delegationMode,
              delegatedBy: payload.delegatedBy || "orchestrator",
            });
            taskId = delegatedTask.id || null;
          }

          if (taskId && result.createdArtifact) {
            await dependencies.memoryManager.updateTask(taskId, {
              title: delegatedTaskTitle,
              status: result.artifactValidation?.valid ? "completed" : "failed",
              assignedAgent: result.agentName || result.subAgentName || null,
              targetAgent: result.agentName || null,
              targetSubAgent: result.subAgentName || null,
              targetSkill: result.skillName || null,
              delegationMode: result.delegationMode || null,
              delegatedBy: payload.delegatedBy || "orchestrator",
            });
          }

          await dependencies.memoryManager.append("assistant", result.answer);
          if (result.createdArtifact) {
            await dependencies.memoryManager.log(
              result.artifactValidation?.valid ? "info" : "warn",
              `[delegation-factory] ${result.createdArtifact.kind} ${result.createdArtifact.name} -> ${result.createdArtifact.manifestPath} (${result.artifactValidation?.valid ? "valid" : "invalid"})`
            );
            await dependencies.memoryManager.log(
              result.artifactValidation?.valid ? "info" : "warn",
              `[delegation-validation] ${result.validationAgentName || "validator"} -> ${result.validationSummary || "sem resumo"}`
            );
          }
          await dependencies.memoryManager.updateExecution(execution.id || "", {
            taskId,
            provider: result.provider,
            status: "completed",
            resultSummary: [result.answer, result.validationSummary].filter(Boolean).join("\n").slice(0, 500),
            selectedAgent: result.agentName || null,
            selectedSubAgent: result.subAgentName || null,
            selectedSkill: result.skillName || null,
            delegationSummary:
              [result.delegationSummary, artifactSummary, validationSummary].filter(Boolean).join(" | ") || null,
          });

          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              ...result,
              executionId: execution.id || null,
              taskId,
            })
          );
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Execution failed";
          await dependencies.memoryManager.updateExecution(execution.id || "", {
            status: "failed",
            resultSummary: message,
          });
          throw error;
        }
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

      if (method === "GET" && url.startsWith("/logs")) {
        const parsedUrl = new URL(url, `http://localhost:${dependencies.env.appPort}`);
        const limit = Number.parseInt(parsedUrl.searchParams.get("limit") || "50", 10);
        const logs = await dependencies.memoryManager.listLogs(
          Number.isFinite(limit) ? limit : 50
        );
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(logs));
        return;
      }

      if (method === "GET" && url.startsWith("/executions")) {
        const parsedUrl = new URL(url, `http://localhost:${dependencies.env.appPort}`);
        const limit = Number.parseInt(parsedUrl.searchParams.get("limit") || "50", 10);
        const executions = await dependencies.memoryManager.listExecutions(
          Number.isFinite(limit) ? limit : 50
        );
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(executions));
        return;
      }

      if (method === "POST" && url === "/tasks") {
        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as {
          title?: string;
          status?: string;
          assignedAgent?: string | null;
          targetAgent?: string | null;
          targetSubAgent?: string | null;
          targetSkill?: string | null;
          delegationMode?: string | null;
          delegatedBy?: string | null;
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
          targetAgent: payload.targetAgent || null,
          targetSubAgent: payload.targetSubAgent || null,
          targetSkill: payload.targetSkill || null,
          delegationMode: payload.delegationMode || null,
          delegatedBy: payload.delegatedBy || null,
        });
        await dependencies.memoryManager.log("info", `Task created: ${task.title}`);

        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify(task));
        return;
      }

      if (method === "PATCH" && url.startsWith("/tasks/")) {
        const taskId = url.split("/")[2];

        if (!taskId) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Missing task id." }));
          return;
        }

        const rawBody = await readBody(request);
        const payload = JSON.parse(rawBody || "{}") as {
          title?: string;
          status?: string;
          assignedAgent?: string | null;
          targetAgent?: string | null;
          targetSubAgent?: string | null;
          targetSkill?: string | null;
          delegationMode?: string | null;
          delegatedBy?: string | null;
        };

        const task = await dependencies.memoryManager.updateTask(taskId, {
          title: payload.title,
          status: payload.status,
          assignedAgent: payload.assignedAgent,
          targetAgent: payload.targetAgent,
          targetSubAgent: payload.targetSubAgent,
          targetSkill: payload.targetSkill,
          delegationMode: payload.delegationMode,
          delegatedBy: payload.delegatedBy,
        });
        await dependencies.memoryManager.log("info", `Task updated: ${task.title} (${task.status})`);

        response.writeHead(200, { "Content-Type": "application/json" });
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
