import { LinaOrchestrator } from "../core/orchestrator/orchestrator";
import { MemoryManager } from "../core/memory/memory-manager";
import { TelegramClient } from "./telegram-client";
import { GroqAudioTranscriber } from "./groq-audio-transcriber";
import { TelegramOutputHandler } from "./telegram-output-handler";
import { TelegramUpdate } from "./telegram.types";

type TelegramInputHandlerOptions = {
  allowedUserIds: string[];
  orchestrator: LinaOrchestrator;
  memoryManager: MemoryManager;
  client: TelegramClient;
  outputHandler: TelegramOutputHandler;
  audioTranscriber: GroqAudioTranscriber;
};

export class TelegramInputHandler {
  constructor(private readonly options: TelegramInputHandlerOptions) {}

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    const userId = String(update.message?.from?.id || "");
    const chatId = String(update.message?.chat.id || "");
    const text = update.message?.text?.trim();
    const voice = update.message?.voice;
    const audio = update.message?.audio;

    if (!chatId || !this.isAllowed(userId)) {
      return;
    }

    if (text) {
      await this.processText(chatId, text);
      return;
    }

    if (voice || audio) {
      await this.processAudio(
        chatId,
        voice?.file_id || audio?.file_id || "",
        voice?.mime_type || audio?.mime_type,
        audio?.file_name
      );
      return;
    }

    await this.options.outputHandler.sendText(
      chatId,
      "No momento eu processo mensagens de texto e áudio/voice no Telegram."
    );
  }

  private async processText(chatId: string, text: string): Promise<void> {
    await this.options.memoryManager.append("user", text);
    await this.options.client.sendChatAction(chatId, "typing");

    const result = await this.options.orchestrator.handle({ text });

    await this.options.memoryManager.append("assistant", result.answer);
    await this.options.outputHandler.sendText(chatId, result.answer);
  }

  private async processAudio(
    chatId: string,
    fileId: string,
    mimeType?: string,
    preferredFileName?: string
  ): Promise<void> {
    if (!fileId) {
      await this.options.outputHandler.sendText(chatId, "Nao consegui identificar o arquivo de audio.");
      return;
    }

    if (!this.options.audioTranscriber.isEnabled()) {
      await this.options.outputHandler.sendText(
        chatId,
        "Recebi o audio, mas a transcricao ainda nao esta configurada."
      );
      return;
    }

    await this.options.client.sendChatAction(chatId, "typing");

    try {
      const file = await this.options.client.getFile(fileId);
      if (!file.file_path) {
        throw new Error("Telegram did not return a file path for this audio");
      }

      const downloadedFile = await this.options.client.downloadFile(file.file_path);
      const filename = preferredFileName || file.file_path.split("/").pop() || "telegram-audio.ogg";
      const transcript = await this.options.audioTranscriber.transcribe({
        filename,
        content: downloadedFile.content,
        mimeType,
      });

      if (!transcript) {
        await this.options.outputHandler.sendText(
          chatId,
          "Recebi o audio, mas a transcricao voltou vazia. Pode reenviar?"
        );
        return;
      }

      await this.processText(chatId, transcript);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida ao processar audio";
      await this.options.outputHandler.sendText(
        chatId,
        `Falha ao processar o audio: ${message}`
      );
    }
  }

  private isAllowed(userId: string): boolean {
    if (this.options.allowedUserIds.length === 0) {
      return true;
    }

    return this.options.allowedUserIds.includes(userId);
  }
}
