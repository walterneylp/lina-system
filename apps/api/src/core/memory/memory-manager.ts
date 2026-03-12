import { MemoryStore } from "./memory-store.interface";
import {
  ConversationMessage,
  ConversationMessageMetadata,
  LinaExecutionRecord,
  LinaExecutionUpdate,
  LinaSystemLogRecord,
  LinaTaskRecord,
  LinaTaskUpdate,
  MemoryRole,
  PersistenceHealth,
} from "./memory.types";

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

  public async append(
    role: MemoryRole,
    content: string,
    metadata?: ConversationMessageMetadata
  ): Promise<ConversationMessage> {
    const conversationId = await this.ensureConversation();
    return this.store.appendMessage(role, content, conversationId, metadata);
  }

  public async getConversation(): Promise<ConversationMessage[]> {
    return this.store.listMessages();
  }

  public async getRecentConversation(options?: {
    limit?: number;
    source?: ConversationMessageMetadata["source"];
    chatId?: string | null;
    userId?: string | null;
  }): Promise<ConversationMessage[]> {
    const messages = await this.store.listMessages();
    const filtered = messages.filter((message) => {
      if (options?.source && message.metadata?.source !== options.source) {
        return false;
      }

      if (options?.chatId && message.metadata?.chatId !== options.chatId) {
        return false;
      }

      if (options?.userId && message.metadata?.userId !== options.userId) {
        return false;
      }

      return true;
    });

    const limit = options?.limit || 8;
    return filtered.slice(-limit);
  }

  public async createTask(task: LinaTaskRecord): Promise<LinaTaskRecord> {
    return this.store.createTask(task);
  }

  public async listTasks(): Promise<LinaTaskRecord[]> {
    return this.store.listTasks();
  }

  public async updateTask(id: string, updates: LinaTaskUpdate): Promise<LinaTaskRecord> {
    return this.store.updateTask(id, updates);
  }

  public async createExecution(execution: LinaExecutionRecord): Promise<LinaExecutionRecord> {
    return this.store.createExecution(execution);
  }

  public async listExecutions(limit?: number): Promise<LinaExecutionRecord[]> {
    return this.store.listExecutions(limit);
  }

  public async updateExecution(id: string, updates: LinaExecutionUpdate): Promise<LinaExecutionRecord> {
    return this.store.updateExecution(id, updates);
  }

  public async listLogs(limit?: number): Promise<LinaSystemLogRecord[]> {
    return this.store.listLogs(limit);
  }

  public async log(level: string, message: string): Promise<void> {
    return this.store.log(level, message);
  }
}
