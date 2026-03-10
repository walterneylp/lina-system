import { ConversationMessage, LinaTaskRecord, MemoryRole, PersistenceHealth } from "./memory.types";

export interface MemoryStore {
  getHealth(): Promise<PersistenceHealth>;
  appendMessage(role: MemoryRole, content: string): Promise<ConversationMessage>;
  listMessages(): Promise<ConversationMessage[]>;
  createTask(task: LinaTaskRecord): Promise<LinaTaskRecord>;
  listTasks(): Promise<LinaTaskRecord[]>;
  log(level: string, message: string): Promise<void>;
}
