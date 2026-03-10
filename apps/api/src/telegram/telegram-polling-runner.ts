import { TelegramInputHandler } from "./telegram-input-handler";
import { TelegramClient } from "./telegram-client";

type TelegramPollingRunnerOptions = {
  client: TelegramClient;
  inputHandler: TelegramInputHandler;
  pollingIntervalMs: number;
};

export class TelegramPollingRunner {
  private offset = 0;
  private active = false;

  constructor(private readonly options: TelegramPollingRunnerOptions) {}

  public start(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    void this.loop();
  }

  private async loop(): Promise<void> {
    while (this.active) {
      try {
        const updates = await this.options.client.getUpdates(this.offset);

        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.options.inputHandler.handleUpdate(update);
        }
      } catch (error) {
        console.error("[LiNa][telegram] polling error", error);
      }

      await new Promise((resolve) => setTimeout(resolve, this.options.pollingIntervalMs));
    }
  }
}
