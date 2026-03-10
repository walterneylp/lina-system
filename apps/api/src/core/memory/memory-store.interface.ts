import { ConversationMessage, LinaTaskRecord, MemoryRole, PersistenceHealth } from "./memory.types";

export interface MemoryStore {
  getHealth(): Promise<PersistenceHealth>;
  createConversation(): Promise<{ id: string; createdAt: string }>;
  appendMessage(
    role: MemoryRole,
    content: string,
    conversationId?: string
  ): Promise<ConversationMessage>;
  listMessages(): Promise<ConversationMessage[]>;
  createTask(task: LinaTaskRecord): Promise<LinaTaskRecord>;
  listTasks(): Promise<LinaTaskRecord[]>;
  log(level: string, message: string): Promise<void>;
}
