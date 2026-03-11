export type MemoryRole = "system" | "user" | "assistant" | "tool";

export type ConversationMessage = {
  id?: string;
  conversationId?: string;
  role: MemoryRole;
  content: string;
  createdAt: string;
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

export type LinaSystemLogRecord = {
  id?: string;
  level: string;
  message: string;
  createdAt: string;
};
