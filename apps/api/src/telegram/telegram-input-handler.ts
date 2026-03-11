import { LinaOrchestrator } from "../core/orchestrator/orchestrator";
import { ConversationMessageMetadata } from "../core/memory/memory.types";
import { MemoryManager } from "../core/memory/memory-manager";
import { AudioPreprocessor } from "./audio-preprocessor";
import { TelegramClient } from "./telegram-client";
import { GroqAudioTranscriber } from "./groq-audio-transcriber";
import { TelegramCommandService } from "./telegram-command-service";
import { TelegramOutputHandler } from "./telegram-output-handler";
import { TelegramUpdate } from "./telegram.types";

type TelegramInputHandlerOptions = {
  allowedUserIds: string[];
  orchestrator: LinaOrchestrator;
  memoryManager: MemoryManager;
  client: TelegramClient;
  outputHandler: TelegramOutputHandler;
  audioTranscriber: GroqAudioTranscriber;
  audioPreprocessor: AudioPreprocessor;
  commandService: TelegramCommandService;
};

export class TelegramInputHandler {
  constructor(private readonly options: TelegramInputHandlerOptions) {}

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    const userId = String(update.message?.from?.id || "");
    const chatId = String(update.message?.chat.id || "");
    const text = update.message?.text?.trim();
    const voice = update.message?.voice;
    const audio = update.message?.audio;
    const metadata = this.buildMetadata(update, voice ? "voice" : audio ? "audio" : "text");

    if (!chatId || !this.isAllowed(userId)) {
      return;
    }

    if (text) {
      await this.processText(chatId, text, metadata);
      return;
    }

    if (voice || audio) {
      await this.processAudio(
        chatId,
        voice?.file_id || audio?.file_id || "",
        voice ? "voice" : "audio",
        voice?.mime_type || audio?.mime_type,
        audio?.file_name,
        metadata
      );
      return;
    }

    await this.options.outputHandler.sendText(
      chatId,
      "No momento eu processo mensagens de texto e áudio/voice no Telegram."
    );
  }

  private async processText(
    chatId: string,
    text: string,
    metadata?: ConversationMessageMetadata
  ): Promise<void> {
    const commandReply = await this.options.commandService.handle(text);

    if (commandReply) {
      await this.options.memoryManager.log(
        "info",
        `[telegram-command] ${metadata?.username || metadata?.userId || "unknown"} -> ${text}`
      );
      await this.options.memoryManager.append("user", text, metadata);
      await this.options.memoryManager.append("assistant", commandReply, {
        source: "telegram",
        channel: "telegram",
        chatId,
        chatType: metadata?.chatType || null,
        userId: metadata?.userId || null,
        username: metadata?.username || null,
        firstName: metadata?.firstName || null,
        messageType: "text",
        transportMessageId: null,
      });
      await this.options.outputHandler.sendText(chatId, commandReply);
      return;
    }

    await this.options.memoryManager.append("user", text, metadata);

    const greetingReply = this.buildGreetingReply(text, metadata);
    if (greetingReply) {
      await this.options.memoryManager.append("assistant", greetingReply, {
        source: "telegram",
        channel: "telegram",
        chatId,
        chatType: metadata?.chatType || null,
        userId: metadata?.userId || null,
        username: metadata?.username || null,
        firstName: metadata?.firstName || null,
        messageType: "text",
        transportMessageId: null,
      });
      await this.options.outputHandler.sendText(chatId, greetingReply);
      return;
    }

    await this.options.client.sendChatAction(chatId, "typing");

    const result = await this.options.orchestrator.handle({ text });
    const finalAnswer = await this.ensurePortugueseAnswer(result.answer);

    await this.options.memoryManager.append("assistant", finalAnswer, {
      source: "telegram",
      channel: "telegram",
      chatId,
      chatType: metadata?.chatType || null,
      userId: metadata?.userId || null,
      username: metadata?.username || null,
      firstName: metadata?.firstName || null,
      messageType: "text",
      transportMessageId: null,
    });
    await this.options.outputHandler.sendText(chatId, finalAnswer);
  }

  private async processAudio(
    chatId: string,
    fileId: string,
    sourceType: "voice" | "audio",
    mimeType?: string,
    preferredFileName?: string,
    metadata?: ConversationMessageMetadata
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
      const filename = this.resolveAudioFilename(
        sourceType,
        preferredFileName,
        file.file_path,
        mimeType
      );
      const normalizedMimeType = this.normalizeAudioMimeType(sourceType, mimeType);
      console.log("[LiNa][telegram][audio]", {
        sourceType,
        telegramFilePath: file.file_path,
        filename,
        mimeType: normalizedMimeType,
        bytes: downloadedFile.content.length,
      });
      const normalizedAudio = await this.options.audioPreprocessor.transcodeToWav({
        filename,
        content: downloadedFile.content,
      });
      console.log("[LiNa][telegram][audio-normalized]", {
        filename: normalizedAudio.filename,
        mimeType: normalizedAudio.mimeType,
        bytes: normalizedAudio.content.length,
      });
      const transcript = await this.options.audioTranscriber.transcribe({
        filename: normalizedAudio.filename,
        content: normalizedAudio.content,
        mimeType: normalizedAudio.mimeType,
      });
      console.log("[LiNa][telegram][transcript]", {
        empty: !transcript,
        preview: transcript.slice(0, 120),
      });

      if (!transcript) {
        await this.options.outputHandler.sendText(
          chatId,
          "Recebi o audio, mas a transcricao voltou vazia. Pode reenviar?"
        );
        return;
      }

      await this.processText(chatId, transcript, metadata);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida ao processar audio";
      await this.options.outputHandler.sendText(
        chatId,
        `Falha ao processar o audio: ${message}`
      );
    }
  }

  private resolveAudioFilename(
    sourceType: "voice" | "audio",
    preferredFileName?: string,
    telegramFilePath?: string,
    mimeType?: string
  ): string {
    if (sourceType === "voice") {
      return "telegram-voice.ogg";
    }

    const candidate = preferredFileName || telegramFilePath?.split("/").pop() || "telegram-audio";

    if (candidate.includes(".")) {
      return this.normalizeSupportedAudioFilename(candidate);
    }

    const extension = this.inferAudioExtension(mimeType);
    return `${candidate}.${extension}`;
  }

  private normalizeSupportedAudioFilename(filename: string): string {
    const normalized = filename.replace(/\.oga$/i, ".ogg");
    return normalized.replace(/\.mpeg3$/i, ".mp3");
  }

  private normalizeAudioMimeType(
    sourceType: "voice" | "audio",
    mimeType?: string
  ): string {
    if (sourceType === "voice") {
      return "audio/ogg";
    }

    return mimeType || "audio/ogg";
  }

  private inferAudioExtension(mimeType?: string): string {
    switch (mimeType) {
      case "audio/ogg":
        return "ogg";
      case "audio/opus":
        return "opus";
      case "audio/mpeg":
        return "mp3";
      case "audio/mp4":
        return "mp4";
      case "audio/x-m4a":
      case "audio/m4a":
        return "m4a";
      case "audio/wav":
      case "audio/x-wav":
        return "wav";
      case "audio/webm":
        return "webm";
      case "audio/flac":
        return "flac";
      default:
        return "ogg";
    }
  }

  private isAllowed(userId: string): boolean {
    if (this.options.allowedUserIds.length === 0) {
      return true;
    }

    return this.options.allowedUserIds.includes(userId);
  }

  private buildMetadata(
    update: TelegramUpdate,
    messageType: ConversationMessageMetadata["messageType"]
  ): ConversationMessageMetadata {
    return {
      source: "telegram",
      channel: "telegram",
      chatId: update.message?.chat?.id ? String(update.message.chat.id) : null,
      chatType: update.message?.chat?.type || null,
      userId: update.message?.from?.id ? String(update.message.from.id) : null,
      username: update.message?.from?.username || update.message?.chat?.username || null,
      firstName: update.message?.from?.first_name || null,
      messageType,
      transportMessageId: update.message?.message_id ? String(update.message.message_id) : null,
    };
  }

  private buildGreetingReply(
    text: string,
    metadata?: ConversationMessageMetadata
  ): string | null {
    const normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[!?.,;:]/g, "")
      .trim();

    const greetings = new Set([
      "oi",
      "ola",
      "bom dia",
      "boa tarde",
      "boa noite",
      "e ai",
      "ei",
      "olá",
    ]);

    if (!greetings.has(normalized)) {
      return null;
    }

    const firstName = metadata?.firstName?.trim();
    if (firstName) {
      return `Oi, ${firstName}. Como posso ajudar?`;
    }

    return "Oi. Como posso ajudar?";
  }

  private async ensurePortugueseAnswer(answer: string): Promise<string> {
    const trimmed = answer.trim();

    if (!trimmed || !this.looksLikeEnglish(trimmed)) {
      return trimmed;
    }

    try {
      const rewritten = await this.options.orchestrator.handle({
        text: [
          "Reescreva a resposta abaixo em português do Brasil.",
          "Mantenha o sentido original.",
          "Seja natural e direto.",
          "Nao acrescente inventario de componentes nem status generico se isso nao for indispensavel.",
          "",
          trimmed,
        ].join("\n"),
      });

      const normalized = rewritten.answer.trim();
      return normalized || trimmed;
    } catch {
      return trimmed;
    }
  }

  private looksLikeEnglish(text: string): boolean {
    const englishSignals = [
      /\b(system|currently|running|development|environment|components|operational|testing|what would you like)\b/i,
      /\bskills?\b/i,
      /\btask management\b/i,
      /\bready for testing\b/i,
      /\bsupabase persistence\b/i,
      /\btelegram integration\b/i,
    ];

    return englishSignals.some((pattern) => pattern.test(text));
  }
}
