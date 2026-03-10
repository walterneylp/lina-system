import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type ConversationMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
};

export class MemoryManager {
  private readonly conversation: ConversationMessage[];

  constructor(private readonly storagePath = "./tmp/memory/conversation.json") {
    this.conversation = this.load();
  }

  public append(role: ConversationMessage["role"], content: string): void {
    this.conversation.push({
      role,
      content,
      createdAt: new Date().toISOString(),
    });
    this.persist();
  }

  public getConversation(): ConversationMessage[] {
    return [...this.conversation];
  }

  private load(): ConversationMessage[] {
    if (!existsSync(this.storagePath)) {
      return [];
    }

    try {
      const raw = readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as ConversationMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(this.conversation, null, 2));
  }
}
