import { createClient, SupabaseClient } from "@supabase/supabase-js";
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

type SupabaseMemoryStoreOptions = {
  url: string;
  serviceRoleKey: string;
};

export class SupabaseMemoryStore implements MemoryStore {
  private readonly client: SupabaseClient;
  private messageMetadataSupport?: boolean;

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
    conversationId?: string,
    metadata?: ConversationMessageMetadata
  ): Promise<ConversationMessage> {
    const activeConversation =
      conversationId ? { id: conversationId } : await this.createConversation();

    const supportsMetadata = await this.supportsMessageMetadata();
    const insertPayload: Record<string, string | null> = {
      conversation_id: activeConversation.id,
      role,
      content,
    };

    if (supportsMetadata) {
      insertPayload.source = metadata?.source || null;
      insertPayload.channel = metadata?.channel || null;
      insertPayload.chat_id = metadata?.chatId || null;
      insertPayload.chat_type = metadata?.chatType || null;
      insertPayload.user_id = metadata?.userId || null;
      insertPayload.username = metadata?.username || null;
      insertPayload.first_name = metadata?.firstName || null;
      insertPayload.message_type = metadata?.messageType || null;
      insertPayload.transport_message_id = metadata?.transportMessageId || null;
    }

    const { data, error } = await this.client
      .from("messages")
      .insert(insertPayload)
      .select(this.messageSelectClause(supportsMetadata))
      .single();

    if (error || !data) {
      throw new Error(`Failed to append message: ${error?.message || "unknown error"}`);
    }

    return this.mapMessageRecord(
      data as unknown as Record<string, string | null | undefined>,
      supportsMetadata
    );
  }

  public async listMessages(): Promise<ConversationMessage[]> {
    const supportsMetadata = await this.supportsMessageMetadata();
    const { data, error } = await this.client
      .from("messages")
      .select(this.messageSelectClause(supportsMetadata))
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list messages: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, string | null | undefined>>).map(
      (item: Record<string, string | null | undefined>) =>
        this.mapMessageRecord(item, supportsMetadata)
    );
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

  public async updateTask(id: string, updates: LinaTaskUpdate): Promise<LinaTaskRecord> {
    const payload: Record<string, string | null> = {};

    if (updates.title !== undefined) {
      payload.title = updates.title;
    }

    if (updates.status !== undefined) {
      payload.status = updates.status;
    }

    if (updates.assignedAgent !== undefined) {
      payload.assigned_agent = updates.assignedAgent;
    }

    const { data, error } = await this.client
      .from("tasks")
      .update(payload)
      .eq("id", id)
      .select("id, title, status, assigned_agent, created_at")
      .single();

    if (error || !data) {
      throw new Error(`Failed to update task: ${error?.message || "unknown error"}`);
    }

    return {
      id: data.id,
      title: data.title,
      status: data.status,
      assignedAgent: data.assigned_agent,
      createdAt: data.created_at,
    };
  }

  public async createExecution(execution: LinaExecutionRecord): Promise<LinaExecutionRecord> {
    const { data, error } = await this.client
      .from("executions")
      .insert({
        task_id: execution.taskId || null,
        provider: execution.provider || null,
        status: execution.status,
        result_summary: execution.resultSummary || null,
      })
      .select("id, task_id, provider, status, result_summary, created_at")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create execution: ${error?.message || "unknown error"}`);
    }

    return {
      id: data.id,
      taskId: data.task_id,
      provider: data.provider,
      status: data.status,
      resultSummary: data.result_summary,
      createdAt: data.created_at,
    };
  }

  public async listExecutions(limit = 50): Promise<LinaExecutionRecord[]> {
    const { data, error } = await this.client
      .from("executions")
      .select("id, task_id, provider, status, result_summary, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list executions: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, string>>).map((item: Record<string, string>) => ({
      id: item.id,
      taskId: item.task_id,
      provider: item.provider,
      status: item.status,
      resultSummary: item.result_summary,
      createdAt: item.created_at,
    }));
  }

  public async updateExecution(id: string, updates: LinaExecutionUpdate): Promise<LinaExecutionRecord> {
    const payload: Record<string, string | null> = {};

    if (updates.provider !== undefined) {
      payload.provider = updates.provider;
    }

    if (updates.status !== undefined) {
      payload.status = updates.status;
    }

    if (updates.resultSummary !== undefined) {
      payload.result_summary = updates.resultSummary;
    }

    const { data, error } = await this.client
      .from("executions")
      .update(payload)
      .eq("id", id)
      .select("id, task_id, provider, status, result_summary, created_at")
      .single();

    if (error || !data) {
      throw new Error(`Failed to update execution: ${error?.message || "unknown error"}`);
    }

    return {
      id: data.id,
      taskId: data.task_id,
      provider: data.provider,
      status: data.status,
      resultSummary: data.result_summary,
      createdAt: data.created_at,
    };
  }

  public async listLogs(limit = 50): Promise<LinaSystemLogRecord[]> {
    const { data, error } = await this.client
      .from("system_logs")
      .select("id, level, message, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list logs: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, string>>).map((item: Record<string, string>) => ({
      id: item.id,
      level: item.level,
      message: item.message,
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

  private async supportsMessageMetadata(): Promise<boolean> {
    if (this.messageMetadataSupport !== undefined) {
      return this.messageMetadataSupport;
    }

    const { error } = await this.client
      .from("messages")
      .select("id, source")
      .limit(1);

    this.messageMetadataSupport = !error;
    return this.messageMetadataSupport;
  }

  private messageSelectClause(includeMetadata: boolean): string {
    const base = "id, conversation_id, role, content, created_at";
    if (!includeMetadata) {
      return base;
    }

    return `${base}, source, channel, chat_id, chat_type, user_id, username, first_name, message_type, transport_message_id`;
  }

  private mapMessageRecord(
    item: Record<string, string | null | undefined>,
    includeMetadata: boolean
  ): ConversationMessage {
    return {
      id: item.id,
      conversationId: item.conversation_id,
      role: item.role as MemoryRole,
      content: item.content,
      createdAt: item.created_at,
      metadata: includeMetadata
        ? {
            source: item.source as ConversationMessageMetadata["source"],
            channel: item.channel,
            chatId: item.chat_id,
            chatType: item.chat_type,
            userId: item.user_id,
            username: item.username,
            firstName: item.first_name,
            messageType: item.message_type as ConversationMessageMetadata["messageType"],
            transportMessageId: item.transport_message_id,
          }
        : undefined,
    };
  }
}
