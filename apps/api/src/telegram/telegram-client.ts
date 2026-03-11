import {
  TelegramBotIdentity,
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
