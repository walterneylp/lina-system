export type MemoryRole = "system" | "user" | "assistant" | "tool";

export type ConversationMessageMetadata = {
  source?: "telegram" | "dashboard" | "api" | "system";
  channel?: string;
  chatId?: string | null;
  chatType?: string | null;
  userId?: string | null;
  username?: string | null;
  firstName?: string | null;
  messageType?: "text" | "voice" | "audio" | "system";
  transportMessageId?: string | null;
};

export type ConversationMessage = {
  id?: string;
  conversationId?: string;
  role: MemoryRole;
  content: string;
  createdAt: string;
  metadata?: ConversationMessageMetadata;
};

export type PersistenceHealth = {
  provider: "local" | "supabase";
  configured: boolean;
  connected: boolean;
  details?: string;
};

export type LinaTaskRecord = {
  id?: string;
  title: string;
  status: string;
  assignedAgent?: string | null;
  createdAt?: string;
};

export type LinaTaskUpdate = {
  title?: string;
  status?: string;
  assignedAgent?: string | null;
};

export type LinaSystemLogRecord = {
  id?: string;
  level: string;
  message: string;
  createdAt: string;
};

export type LinaExecutionRecord = {
  id?: string;
  taskId?: string | null;
  provider?: string | null;
  status: string;
  resultSummary?: string | null;
  createdAt?: string;
};

export type LinaExecutionUpdate = {
  provider?: string | null;
  status?: string;
  resultSummary?: string | null;
};
