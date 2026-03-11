import { LinaEnv } from "../config/env";
import { DashboardAuthStore } from "../../../dashboard/src/auth/dashboard-auth-store";
import { DashboardRole, getDashboardPermissions } from "../../../dashboard/src/auth/dashboard-rbac";

type TelegramAccessControlOptions = {
  env: LinaEnv;
};

export type TelegramAuthorizedActor = {
  telegramUserId: string;
  username: string;
  role: DashboardRole;
  permissions: ReturnType<typeof getDashboardPermissions>;
  source: "env" | "dashboard";
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

  public async resolveActor(userId: string): Promise<TelegramAuthorizedActor | null> {
    const normalizedUserId = String(userId || "").trim();

    if (!normalizedUserId) {
      return null;
    }

    if (this.options.env.telegramAllowedUserIds.includes(normalizedUserId)) {
      return {
        telegramUserId: normalizedUserId,
        username: `env:${normalizedUserId}`,
        role: "admin",
        permissions: getDashboardPermissions("admin"),
        source: "env",
      };
    }

    if (!this.dashboardAuthStore) {
      if (this.options.env.telegramAllowedUserIds.length === 0) {
        return {
          telegramUserId: normalizedUserId,
          username: `open:${normalizedUserId}`,
          role: "admin",
          permissions: getDashboardPermissions("admin"),
          source: "env",
        };
      }

      return null;
    }

    const authorizedIds = await this.dashboardAuthStore.listAuthorizedTelegramUserIds();

    if (authorizedIds.length === 0) {
      if (this.options.env.telegramAllowedUserIds.length === 0) {
        return {
          telegramUserId: normalizedUserId,
          username: `open:${normalizedUserId}`,
          role: "admin",
          permissions: getDashboardPermissions("admin"),
          source: "env",
        };
      }

      return null;
    }

    if (!authorizedIds.includes(normalizedUserId)) {
      return null;
    }

    const user = await this.dashboardAuthStore.getUserByTelegramUserId(normalizedUserId);

    if (!user) {
      return null;
    }

    return {
      telegramUserId: normalizedUserId,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      source: "dashboard",
    };
  }

  public async isAllowed(userId: string): Promise<boolean> {
    return Boolean(await this.resolveActor(userId));
  }
}
