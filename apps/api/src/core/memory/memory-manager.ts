import { MemoryStore } from "./memory-store.interface";
import { ConversationMessage, LinaTaskRecord, MemoryRole, PersistenceHealth } from "./memory.types";

export class MemoryManager {
  private activeConversationId?: string;

  constructor(private readonly store: MemoryStore) {}

  public async getHealth(): Promise<PersistenceHealth> {
    return this.store.getHealth();
  }

  public async ensureConversation(): Promise<string> {
    if (this.activeConversationId) {
      return this.activeConversationId;
    }

    const conversation = await this.store.createConversation();
    this.activeConversationId = conversation.id;
    return conversation.id;
  }

  public async append(role: MemoryRole, content: string): Promise<ConversationMessage> {
    const conversationId = await this.ensureConversation();
    return this.store.appendMessage(role, content, conversationId);
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
