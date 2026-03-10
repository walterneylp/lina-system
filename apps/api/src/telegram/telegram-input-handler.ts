import { LinaOrchestrator } from "../core/orchestrator/orchestrator";
import { MemoryManager } from "../core/memory/memory-manager";
import { TelegramClient } from "./telegram-client";
import { TelegramOutputHandler } from "./telegram-output-handler";
import { TelegramUpdate } from "./telegram.types";

type TelegramInputHandlerOptions = {
  allowedUserIds: string[];
  orchestrator: LinaOrchestrator;
  memoryManager: MemoryManager;
  client: TelegramClient;
  outputHandler: TelegramOutputHandler;
};

export class TelegramInputHandler {
  constructor(private readonly options: TelegramInputHandlerOptions) {}

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    const text = update.message?.text?.trim();
    const userId = String(update.message?.from?.id || "");
    const chatId = String(update.message?.chat.id || "");

    if (!text || !chatId || !this.isAllowed(userId)) {
      return;
    }

    await this.options.memoryManager.append("user", text);
    await this.options.client.sendChatAction(chatId, "typing");

    const result = await this.options.orchestrator.handle({ text });

    await this.options.memoryManager.append("assistant", result.answer);
    await this.options.outputHandler.sendText(chatId, result.answer);
  }

  private isAllowed(userId: string): boolean {
    if (this.options.allowedUserIds.length === 0) {
      return true;
    }

    return this.options.allowedUserIds.includes(userId);
  }
}
