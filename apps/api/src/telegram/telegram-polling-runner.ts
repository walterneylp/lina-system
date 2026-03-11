import { TelegramInputHandler } from "./telegram-input-handler";
import { TelegramClient } from "./telegram-client";

type TelegramPollingRunnerOptions = {
  client: TelegramClient;
  inputHandler: TelegramInputHandler;
  pollingIntervalMs: number;
  discardPendingUpdatesOnStart?: boolean;
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
    void this.initializeAndLoop();
  }

  public stop(): void {
    this.active = false;
  }

  private async initializeAndLoop(): Promise<void> {
    if (this.options.discardPendingUpdatesOnStart !== false) {
      await this.discardPendingUpdates();
    }

    await this.loop();
  }

  private async discardPendingUpdates(): Promise<void> {
    try {
      const pendingUpdates = await this.options.client.getUpdates(undefined, 0);
      const lastUpdate = pendingUpdates.at(-1);

      if (lastUpdate) {
        this.offset = lastUpdate.update_id + 1;
        console.log(
          `[LiNa][telegram] discarded ${pendingUpdates.length} pending update(s) on startup`
        );
      }
    } catch (error) {
      console.error("[LiNa][telegram] failed to discard pending updates", error);
    }
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
