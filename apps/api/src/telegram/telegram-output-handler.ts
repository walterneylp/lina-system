import { TelegramClient } from "./telegram-client";

const TELEGRAM_LIMIT = 4096;

export class TelegramOutputHandler {
  constructor(private readonly client: TelegramClient) {}

  public async sendText(chatId: string, text: string): Promise<void> {
    for (const chunk of this.chunk(text)) {
      await this.client.sendText(chatId, chunk);
    }
  }

  private chunk(text: string): string[] {
    if (text.length <= TELEGRAM_LIMIT) {
      return [text];
    }

    const chunks: string[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      const slice = text.slice(cursor, cursor + TELEGRAM_LIMIT);
      chunks.push(slice);
      cursor += TELEGRAM_LIMIT;
    }

    return chunks;
  }
}
