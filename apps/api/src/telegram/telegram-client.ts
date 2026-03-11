import {
  TelegramBotIdentity,
  TelegramDownloadedFile,
  TelegramFile,
  TelegramOutboundMessage,
  TelegramUpdate,
} from "./telegram.types";

type TelegramClientOptions = {
  token: string;
};

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(options: TelegramClientOptions) {
    this.baseUrl = `https://api.telegram.org/bot${options.token}`;
  }

  public async getUpdates(offset?: number, timeoutSeconds = 25): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.baseUrl}/getUpdates`);
    url.searchParams.set("timeout", String(timeoutSeconds));
    if (offset) {
      url.searchParams.set("offset", String(offset));
    }

    const response = await fetch(url);
    const payload = (await response.json()) as { result?: TelegramUpdate[] };
    return payload.result || [];
  }

  public async getMe(): Promise<TelegramBotIdentity> {
    const response = await fetch(`${this.baseUrl}/getMe`);
    const payload = (await response.json()) as { ok: boolean; result?: TelegramBotIdentity };

    if (!payload.ok || !payload.result) {
      throw new Error("Telegram getMe failed");
    }

    return payload.result;
  }

  public async getFile(fileId: string): Promise<TelegramFile> {
    const response = await fetch(`${this.baseUrl}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const payload = (await response.json()) as { ok: boolean; result?: TelegramFile };

    if (!payload.ok || !payload.result) {
      throw new Error(`Telegram getFile failed for file_id=${fileId}`);
    }

    return payload.result;
  }

  public async downloadFile(filePath: string): Promise<TelegramDownloadedFile> {
    const response = await fetch(
      `https://api.telegram.org/file/${this.baseUrl.replace("https://api.telegram.org/", "")}/${filePath}`
    );

    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      filePath,
      content: Buffer.from(arrayBuffer),
    };
  }

  public async sendChatAction(chatId: string, action: "typing" | "record_voice"): Promise<void> {
    await fetch(`${this.baseUrl}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  }

  public async sendText(chatId: string, text: string): Promise<void> {
    await fetch(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
  }

  public async send(chatId: string, message: TelegramOutboundMessage): Promise<void> {
    if (message.isAudio) {
      await this.sendText(chatId, `[audio pending] ${message.text}`);
      return;
    }

    await this.sendText(chatId, message.text);
  }
}
