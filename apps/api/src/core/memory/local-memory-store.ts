import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "./memory-store.interface";
import { ConversationMessage, LinaTaskRecord, MemoryRole, PersistenceHealth } from "./memory.types";

type LocalMemoryState = {
  messages: ConversationMessage[];
  tasks: LinaTaskRecord[];
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
        systemLogs: [],
      };
    }

    try {
      const raw = readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as LocalMemoryState;
      return {
        messages: parsed.messages || [],
        tasks: parsed.tasks || [],
        systemLogs: parsed.systemLogs || [],
      };
    } catch {
      return {
        messages: [],
        tasks: [],
        systemLogs: [],
      };
    }
  }

  private persist(state: LocalMemoryState): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(state, null, 2));
  }
}
