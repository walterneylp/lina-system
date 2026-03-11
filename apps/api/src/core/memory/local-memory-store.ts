import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "./memory-store.interface";
import {
  ConversationMessage,
  LinaExecutionRecord,
  LinaExecutionUpdate,
  LinaSystemLogRecord,
  LinaTaskRecord,
  LinaTaskUpdate,
  MemoryRole,
  PersistenceHealth,
} from "./memory.types";

type LocalMemoryState = {
  messages: ConversationMessage[];
  tasks: LinaTaskRecord[];
  executions: LinaExecutionRecord[];
  systemLogs: Array<{
    id: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
};

export class LocalMemoryStore implements MemoryStore {
  constructor(private readonly storagePath = "./tmp/memory/state.json") {}

  public async getHealth(): Promise<PersistenceHealth> {
    return {
      provider: "local",
      configured: true,
      connected: true,
      details: this.storagePath,
    };
  }

  public async createConversation(): Promise<{ id: string; createdAt: string }> {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
  }

  public async appendMessage(
    role: MemoryRole,
    content: string,
    conversationId?: string
  ): Promise<ConversationMessage> {
    const state = this.load();
    const message: ConversationMessage = {
      id: randomUUID(),
      conversationId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(message);
    this.persist(state);
    return message;
  }

  public async listMessages(): Promise<ConversationMessage[]> {
    return this.load().messages;
  }

  public async createTask(task: LinaTaskRecord): Promise<LinaTaskRecord> {
    const state = this.load();
    const createdTask: LinaTaskRecord = {
      id: randomUUID(),
      title: task.title,
      status: task.status,
      assignedAgent: task.assignedAgent || null,
      createdAt: new Date().toISOString(),
    };
    state.tasks.push(createdTask);
    this.persist(state);
    return createdTask;
  }

  public async listTasks(): Promise<LinaTaskRecord[]> {
    return this.load().tasks;
  }

  public async updateTask(id: string, updates: LinaTaskUpdate): Promise<LinaTaskRecord> {
    const state = this.load();
    const taskIndex = state.tasks.findIndex((task) => task.id === id);

    if (taskIndex < 0) {
      throw new Error(`Task not found: ${id}`);
    }

    const currentTask = state.tasks[taskIndex];
    const updatedTask: LinaTaskRecord = {
      ...currentTask,
      title: updates.title ?? currentTask.title,
      status: updates.status ?? currentTask.status,
      assignedAgent:
        updates.assignedAgent === undefined ? currentTask.assignedAgent || null : updates.assignedAgent,
    };

    state.tasks[taskIndex] = updatedTask;
    this.persist(state);
    return updatedTask;
  }

  public async createExecution(execution: LinaExecutionRecord): Promise<LinaExecutionRecord> {
    const state = this.load();
    const createdExecution: LinaExecutionRecord = {
      id: randomUUID(),
      taskId: execution.taskId || null,
      provider: execution.provider || null,
      status: execution.status,
      resultSummary: execution.resultSummary || null,
      createdAt: new Date().toISOString(),
    };
    state.executions.push(createdExecution);
    this.persist(state);
    return createdExecution;
  }

  public async listExecutions(limit = 50): Promise<LinaExecutionRecord[]> {
    return this.load().executions.slice(-limit).reverse();
  }

  public async updateExecution(id: string, updates: LinaExecutionUpdate): Promise<LinaExecutionRecord> {
    const state = this.load();
    const executionIndex = state.executions.findIndex((execution) => execution.id === id);

    if (executionIndex < 0) {
      throw new Error(`Execution not found: ${id}`);
    }

    const currentExecution = state.executions[executionIndex];
    const updatedExecution: LinaExecutionRecord = {
      ...currentExecution,
      provider: updates.provider === undefined ? currentExecution.provider || null : updates.provider,
      status: updates.status ?? currentExecution.status,
      resultSummary:
        updates.resultSummary === undefined ? currentExecution.resultSummary || null : updates.resultSummary,
    };

    state.executions[executionIndex] = updatedExecution;
    this.persist(state);
    return updatedExecution;
  }

  public async listLogs(limit = 50): Promise<LinaSystemLogRecord[]> {
    return this.load()
      .systemLogs
      .slice(-limit)
      .reverse()
      .map((item) => ({
        id: item.id,
        level: item.level,
        message: item.message,
        createdAt: item.createdAt,
      }));
  }

  public async log(level: string, message: string): Promise<void> {
    const state = this.load();
    state.systemLogs.push({
      id: randomUUID(),
      level,
      message,
      createdAt: new Date().toISOString(),
    });
    this.persist(state);
  }

  private load(): LocalMemoryState {
    if (!existsSync(this.storagePath)) {
      return {
        messages: [],
        tasks: [],
        executions: [],
        systemLogs: [],
      };
    }

    try {
      const raw = readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as LocalMemoryState;
      return {
        messages: parsed.messages || [],
        tasks: parsed.tasks || [],
        executions: parsed.executions || [],
        systemLogs: parsed.systemLogs || [],
      };
    } catch {
      return {
        messages: [],
        tasks: [],
        executions: [],
        systemLogs: [],
      };
    }
  }

  private persist(state: LocalMemoryState): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(state, null, 2));
  }
}
