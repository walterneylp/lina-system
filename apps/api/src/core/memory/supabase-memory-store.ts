import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { MemoryStore } from "./memory-store.interface";
import { ConversationMessage, LinaTaskRecord, MemoryRole, PersistenceHealth } from "./memory.types";

type SupabaseMemoryStoreOptions = {
  url: string;
  serviceRoleKey: string;
};

export class SupabaseMemoryStore implements MemoryStore {
  private readonly client: SupabaseClient;

  constructor(private readonly options: SupabaseMemoryStoreOptions) {
    this.client = createClient(options.url, options.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  public async getHealth(): Promise<PersistenceHealth> {
    try {
      const { error } = await this.client.from("system_logs").select("id").limit(1);
      return {
        provider: "supabase",
        configured: true,
        connected: !error,
        details: error?.message,
      };
    } catch (error) {
      return {
        provider: "supabase",
        configured: true,
        connected: false,
        details: error instanceof Error ? error.message : "Unknown Supabase error",
      };
    }
  }

  public async createConversation(): Promise<{ id: string; createdAt: string }> {
    const { data: conversation, error: conversationError } = await this.client
      .from("conversations")
      .insert({})
      .select("id, created_at")
      .single();

    if (conversationError || !conversation) {
      throw new Error(`Failed to create conversation: ${conversationError?.message || "unknown error"}`);
    }

    return {
      id: conversation.id,
      createdAt: conversation.created_at,
    };
  }

  public async appendMessage(
    role: MemoryRole,
    content: string,
    conversationId?: string
  ): Promise<ConversationMessage> {
    const activeConversation =
      conversationId ? { id: conversationId } : await this.createConversation();

    const { data, error } = await this.client
      .from("messages")
      .insert({
        conversation_id: activeConversation.id,
        role,
        content,
      })
      .select("id, conversation_id, role, content, created_at")
      .single();

    if (error || !data) {
      throw new Error(`Failed to append message: ${error?.message || "unknown error"}`);
    }

    return {
      id: data.id,
      conversationId: data.conversation_id,
      role: data.role as MemoryRole,
      content: data.content,
      createdAt: data.created_at,
    };
  }

  public async listMessages(): Promise<ConversationMessage[]> {
    const { data, error } = await this.client
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list messages: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, string>>).map((item: Record<string, string>) => ({
      id: item.id,
      conversationId: item.conversation_id,
      role: item.role as MemoryRole,
      content: item.content,
      createdAt: item.created_at,
    }));
  }

  public async createTask(task: LinaTaskRecord): Promise<LinaTaskRecord> {
    const { data, error } = await this.client
      .from("tasks")
      .insert({
        title: task.title,
        status: task.status,
        assigned_agent: task.assignedAgent || null,
      })
      .select("id, title, status, assigned_agent, created_at")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create task: ${error?.message || "unknown error"}`);
    }

    return {
      id: data.id,
      title: data.title,
      status: data.status,
      assignedAgent: data.assigned_agent,
      createdAt: data.created_at,
    };
  }

  public async listTasks(): Promise<LinaTaskRecord[]> {
    const { data, error } = await this.client
      .from("tasks")
      .select("id, title, status, assigned_agent, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list tasks: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, string>>).map((item: Record<string, string>) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      assignedAgent: item.assigned_agent,
      createdAt: item.created_at,
    }));
  }

  public async log(level: string, message: string): Promise<void> {
    const { error } = await this.client.from("system_logs").insert({
      level,
      message,
    });

    if (error) {
      throw new Error(`Failed to write system log: ${error.message}`);
    }
  }
}
