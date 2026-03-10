import { MemoryStore } from "./memory-store.interface";
import { ConversationMessage, LinaTaskRecord, MemoryRole, PersistenceHealth } from "./memory.types";

export class MemoryManager {
  constructor(private readonly store: MemoryStore) {}

  public async getHealth(): Promise<PersistenceHealth> {
    return this.store.getHealth();
  }

  public async append(role: MemoryRole, content: string): Promise<ConversationMessage> {
    return this.store.appendMessage(role, content);
  }

  public async getConversation(): Promise<ConversationMessage[]> {
    return this.store.listMessages();
  }

  public async createTask(task: LinaTaskRecord): Promise<LinaTaskRecord> {
    return this.store.createTask(task);
  }

  public async listTasks(): Promise<LinaTaskRecord[]> {
    return this.store.listTasks();
  }

  public async log(level: string, message: string): Promise<void> {
    return this.store.log(level, message);
  }
}
