import { TelegramRuntimeStatus } from "./telegram.types";

export class TelegramRuntime {
  private status: TelegramRuntimeStatus = {
    configured: false,
    authenticated: false,
    pollingEnabled: false,
  };

  public setStatus(status: TelegramRuntimeStatus): void {
    this.status = status;
  }

  public getStatus(): TelegramRuntimeStatus {
    return { ...this.status };
  }
}
