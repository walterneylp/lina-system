import { LinaEnv } from "../config/env";
import { DashboardAuthStore } from "../../../dashboard/src/auth/dashboard-auth-store";

type TelegramAccessControlOptions = {
  env: LinaEnv;
};

export class TelegramAccessControl {
  private readonly dashboardAuthStore: DashboardAuthStore | null;

  constructor(private readonly options: TelegramAccessControlOptions) {
    this.dashboardAuthStore =
      options.env.supabaseUrl && options.env.supabaseServiceRoleKey
        ? new DashboardAuthStore({
            url: options.env.supabaseUrl,
            serviceRoleKey: options.env.supabaseServiceRoleKey,
          })
        : null;
  }

  public async isAllowed(userId: string): Promise<boolean> {
    const normalizedUserId = String(userId || "").trim();

    if (!normalizedUserId) {
      return false;
    }

    if (this.options.env.telegramAllowedUserIds.includes(normalizedUserId)) {
      return true;
    }

    if (!this.dashboardAuthStore) {
      return this.options.env.telegramAllowedUserIds.length === 0;
    }

    const authorizedIds = await this.dashboardAuthStore.listAuthorizedTelegramUserIds();

    if (authorizedIds.length === 0) {
      return this.options.env.telegramAllowedUserIds.length === 0;
    }

    return authorizedIds.includes(normalizedUserId);
  }
}
