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

type SupabaseMessageRecord = Record<string, string | null | undefined>;

export class SupabaseMemoryStore implements MemoryStore {
  private readonly client: SupabaseClient;
  private messageMetadataSupport?: boolean;
  private taskDelegationSupport?: boolean;
  private executionDelegationSupport?: boolean;

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

    return (((data || []) as unknown) as SupabaseMessageRecord[]).map(
      (item: SupabaseMessageRecord) =>
        this.mapMessageRecord(item, supportsMetadata)
    );
  }

  public async createTask(task: LinaTaskRecord): Promise<LinaTaskRecord> {
    const supportsDelegation = await this.supportsTaskDelegation();
    const payload: Record<string, string | null> = {
      title: task.title,
      status: task.status,
      assigned_agent: task.assignedAgent || null,
    };

    if (supportsDelegation) {
      payload.target_agent = task.targetAgent || null;
      payload.target_sub_agent = task.targetSubAgent || null;
      payload.target_skill = task.targetSkill || null;
      payload.delegation_mode = task.delegationMode || null;
      payload.delegated_by = task.delegatedBy || null;
    }

    const { data, error } = await this.client
      .from("tasks")
      .insert(payload)
      .select(this.taskSelectClause(supportsDelegation))
      .single();

    if (error || !data) {
      throw new Error(`Failed to create task: ${error?.message || "unknown error"}`);
    }

    return this.mapTaskRecord(
      data as unknown as Record<string, string | null | undefined>,
      supportsDelegation
    );
  }

  public async listTasks(): Promise<LinaTaskRecord[]> {
    const supportsDelegation = await this.supportsTaskDelegation();
    const { data, error } = await this.client
      .from("tasks")
      .select(this.taskSelectClause(supportsDelegation))
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list tasks: ${error.message}`);
    }

    return (((data || []) as unknown) as Array<Record<string, string | null | undefined>>).map((item) =>
      this.mapTaskRecord(item, supportsDelegation)
    );
  }

  public async updateTask(id: string, updates: LinaTaskUpdate): Promise<LinaTaskRecord> {
    const supportsDelegation = await this.supportsTaskDelegation();
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

    if (supportsDelegation) {
      if (updates.targetAgent !== undefined) {
        payload.target_agent = updates.targetAgent;
      }

      if (updates.targetSubAgent !== undefined) {
        payload.target_sub_agent = updates.targetSubAgent;
      }

      if (updates.targetSkill !== undefined) {
        payload.target_skill = updates.targetSkill;
      }

      if (updates.delegationMode !== undefined) {
        payload.delegation_mode = updates.delegationMode;
      }

      if (updates.delegatedBy !== undefined) {
        payload.delegated_by = updates.delegatedBy;
      }
    }

    const { data, error } = await this.client
      .from("tasks")
      .update(payload)
      .eq("id", id)
      .select(this.taskSelectClause(supportsDelegation))
      .single();

    if (error || !data) {
      throw new Error(`Failed to update task: ${error?.message || "unknown error"}`);
    }

    return this.mapTaskRecord(
      data as unknown as Record<string, string | null | undefined>,
      supportsDelegation
    );
  }

  public async createExecution(execution: LinaExecutionRecord): Promise<LinaExecutionRecord> {
    const supportsDelegation = await this.supportsExecutionDelegation();
    const payload: Record<string, string | null> = {
      task_id: execution.taskId || null,
      provider: execution.provider || null,
      status: execution.status,
      result_summary: execution.resultSummary || null,
    };

    if (supportsDelegation) {
      payload.selected_agent = execution.selectedAgent || null;
      payload.selected_sub_agent = execution.selectedSubAgent || null;
      payload.selected_skill = execution.selectedSkill || null;
      payload.delegation_summary = execution.delegationSummary || null;
    }

    const { data, error } = await this.client
      .from("executions")
      .insert(payload)
      .select(this.executionSelectClause(supportsDelegation))
      .single();

    if (error || !data) {
      throw new Error(`Failed to create execution: ${error?.message || "unknown error"}`);
    }

    return this.mapExecutionRecord(
      data as unknown as Record<string, string | null | undefined>,
      supportsDelegation
    );
  }

  public async listExecutions(limit = 50): Promise<LinaExecutionRecord[]> {
    const supportsDelegation = await this.supportsExecutionDelegation();
    const { data, error } = await this.client
      .from("executions")
      .select(this.executionSelectClause(supportsDelegation))
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list executions: ${error.message}`);
    }

    return (((data || []) as unknown) as Array<Record<string, string | null | undefined>>).map((item) =>
      this.mapExecutionRecord(item, supportsDelegation)
    );
  }

  public async updateExecution(id: string, updates: LinaExecutionUpdate): Promise<LinaExecutionRecord> {
    const supportsDelegation = await this.supportsExecutionDelegation();
    const payload: Record<string, string | null> = {};

    if (updates.taskId !== undefined) {
      payload.task_id = updates.taskId;
    }

    if (updates.provider !== undefined) {
      payload.provider = updates.provider;
    }

    if (updates.status !== undefined) {
      payload.status = updates.status;
    }

    if (updates.resultSummary !== undefined) {
      payload.result_summary = updates.resultSummary;
    }

    if (supportsDelegation) {
      if (updates.selectedAgent !== undefined) {
        payload.selected_agent = updates.selectedAgent;
      }

      if (updates.selectedSubAgent !== undefined) {
        payload.selected_sub_agent = updates.selectedSubAgent;
      }

      if (updates.selectedSkill !== undefined) {
        payload.selected_skill = updates.selectedSkill;
      }

      if (updates.delegationSummary !== undefined) {
        payload.delegation_summary = updates.delegationSummary;
      }
    }

    const { data, error } = await this.client
      .from("executions")
      .update(payload)
      .eq("id", id)
      .select(this.executionSelectClause(supportsDelegation))
      .single();

    if (error || !data) {
      throw new Error(`Failed to update execution: ${error?.message || "unknown error"}`);
    }

    return this.mapExecutionRecord(
      data as unknown as Record<string, string | null | undefined>,
      supportsDelegation
    );
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

  private async supportsTaskDelegation(): Promise<boolean> {
    if (this.taskDelegationSupport !== undefined) {
      return this.taskDelegationSupport;
    }

    const { error } = await this.client.from("tasks").select("id, target_agent").limit(1);
    this.taskDelegationSupport = !error;
    return this.taskDelegationSupport;
  }

  private async supportsExecutionDelegation(): Promise<boolean> {
    if (this.executionDelegationSupport !== undefined) {
      return this.executionDelegationSupport;
    }

    const { error } = await this.client.from("executions").select("id, selected_agent").limit(1);
    this.executionDelegationSupport = !error;
    return this.executionDelegationSupport;
  }

  private messageSelectClause(includeMetadata: boolean): string {
    const base = "id, conversation_id, role, content, created_at";
    if (!includeMetadata) {
      return base;
    }

    return `${base}, source, channel, chat_id, chat_type, user_id, username, first_name, message_type, transport_message_id`;
  }

  private taskSelectClause(includeDelegation: boolean): string {
    const base = "id, title, status, assigned_agent, created_at";

    if (!includeDelegation) {
      return base;
    }

    return `${base}, target_agent, target_sub_agent, target_skill, delegation_mode, delegated_by`;
  }

  private executionSelectClause(includeDelegation: boolean): string {
    const base = "id, task_id, provider, status, result_summary, created_at";

    if (!includeDelegation) {
      return base;
    }

    return `${base}, selected_agent, selected_sub_agent, selected_skill, delegation_summary`;
  }

  private mapMessageRecord(
    item: SupabaseMessageRecord,
    includeMetadata: boolean
  ): ConversationMessage {
    const getOptional = (value: string | null | undefined): string | undefined =>
      value === null || value === undefined || value === "" ? undefined : value;

    return {
      id: getOptional(item.id),
      conversationId: getOptional(item.conversation_id),
      role: item.role as MemoryRole,
      content: item.content || "",
      createdAt: item.created_at || new Date().toISOString(),
      metadata: includeMetadata
        ? {
            source: item.source as ConversationMessageMetadata["source"],
            channel: getOptional(item.channel),
            chatId: getOptional(item.chat_id),
            chatType: getOptional(item.chat_type),
            userId: getOptional(item.user_id),
            username: getOptional(item.username),
            firstName: getOptional(item.first_name),
            messageType: item.message_type as ConversationMessageMetadata["messageType"],
            transportMessageId: getOptional(item.transport_message_id),
          }
        : undefined,
    };
  }

  private mapTaskRecord(
    item: Record<string, string | null | undefined>,
    includeDelegation: boolean
  ): LinaTaskRecord {
    return {
      id: item.id || undefined,
      title: item.title || "",
      status: item.status || "pending",
      assignedAgent: item.assigned_agent || null,
      targetAgent: includeDelegation ? item.target_agent || null : null,
      targetSubAgent: includeDelegation ? item.target_sub_agent || null : null,
      targetSkill: includeDelegation ? item.target_skill || null : null,
      delegationMode: includeDelegation ? item.delegation_mode || null : null,
      delegatedBy: includeDelegation ? item.delegated_by || null : null,
      createdAt: item.created_at || undefined,
    };
  }

  private mapExecutionRecord(
    item: Record<string, string | null | undefined>,
    includeDelegation: boolean
  ): LinaExecutionRecord {
    return {
      id: item.id || undefined,
      taskId: item.task_id || null,
      provider: item.provider || null,
      status: item.status || "pending",
      resultSummary: item.result_summary || null,
      selectedAgent: includeDelegation ? item.selected_agent || null : null,
      selectedSubAgent: includeDelegation ? item.selected_sub_agent || null : null,
      selectedSkill: includeDelegation ? item.selected_skill || null : null,
      delegationSummary: includeDelegation ? item.delegation_summary || null : null,
      createdAt: item.created_at || undefined,
    };
  }
}
