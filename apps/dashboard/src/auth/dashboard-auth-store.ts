import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type DashboardAuthStoreOptions = {
  url: string;
  serviceRoleKey: string;
};

export type DashboardAuthUser = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
};

export type DashboardAuthState = {
  allowAdminBootstrap: boolean;
  usersCount: number;
  hasUsers: boolean;
};

type DashboardSession = {
  token: string;
  user: DashboardAuthUser;
  expiresAt: string;
};

type DashboardUserRecord = Record<string, string | boolean | null>;

type DashboardSettingsRow = {
  key: string;
  value_json: {
    allowAdminBootstrap?: boolean;
  } | null;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export class DashboardAuthStore {
  private readonly client: SupabaseClient;

  constructor(options: DashboardAuthStoreOptions) {
    this.client = createClient(options.url, options.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  public async getAuthState(): Promise<DashboardAuthState> {
    const usersCount = await this.countUsers();
    const settings = await this.getSettings();

    return {
      allowAdminBootstrap: usersCount === 0 ? true : settings.allowAdminBootstrap,
      usersCount,
      hasUsers: usersCount > 0,
    };
  }

  public async listUsers(): Promise<DashboardAuthUser[]> {
    const { data, error } = await this.client
      .from("dashboard_users")
      .select("id, username, role, is_active, created_at, updated_at, last_login_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list dashboard users: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, string | boolean | null>>).map((item) =>
      this.mapUser(item)
    );
  }

  public async authenticate(username: string, password: string): Promise<DashboardSession> {
    const userRecord = await this.getUserByUsername(username);

    if (!userRecord) {
      throw new Error("Usuário ou senha inválidos.");
    }

    const rawPasswordHash = String(userRecord.password_hash || "");
    const user = this.mapUser(userRecord);
    if (!user.isActive || !this.verifyPassword(password, rawPasswordHash)) {
      throw new Error("Usuário ou senha inválidos.");
    }

    await this.client
      .from("dashboard_users")
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    return this.createSession(user);
  }

  public async bootstrapAdmin(username: string, password: string): Promise<DashboardSession> {
    const authState = await this.getAuthState();
    if (authState.hasUsers && !authState.allowAdminBootstrap) {
      throw new Error("O cadastro inicial de administrador está desabilitado.");
    }

    this.validateCredentials(username, password);

    const existingUser = await this.getUserByUsername(username);
    if (existingUser) {
      throw new Error("Esse nome de usuário já está em uso.");
    }

    const { data, error } = await this.client
      .from("dashboard_users")
      .insert({
        id: randomUUID(),
        username: username.trim(),
        password_hash: this.hashPassword(password),
        role: "admin",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, username, role, is_active, created_at, updated_at, last_login_at")
      .single();

    if (error || !data) {
      throw new Error(`Falha ao criar administrador inicial: ${error?.message || "erro desconhecido"}`);
    }

    await this.setAllowAdminBootstrap(false);
    return this.createSession(this.mapUser(data as Record<string, string | boolean | null>));
  }

  public async getUserFromSession(token?: string): Promise<DashboardAuthUser | null> {
    if (!token) {
      return null;
    }

    const { data, error } = await this.client
      .from("dashboard_sessions")
      .select("id, user_id, expires_at, revoked_at, dashboard_users(id, username, role, is_active, created_at, updated_at, last_login_at)")
      .eq("session_hash", this.hashSessionToken(token))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const user = (data as Record<string, unknown>).dashboard_users as Record<string, string | boolean | null> | null;
    if (!user || user.is_active !== true) {
      return null;
    }

    await this.client
      .from("dashboard_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", String((data as Record<string, unknown>).id || ""));

    return this.mapUser(user);
  }

  public async revokeSession(token?: string): Promise<void> {
    if (!token) {
      return;
    }

    await this.client
      .from("dashboard_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("session_hash", this.hashSessionToken(token));
  }

  public async setAllowAdminBootstrap(enabled: boolean): Promise<void> {
    const { error } = await this.client
      .from("dashboard_settings")
      .upsert({
        key: "auth",
        value_json: {
          allowAdminBootstrap: enabled,
        },
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Falha ao atualizar a configuração de bootstrap: ${error.message}`);
    }
  }

  public async setUserActive(username: string, isActive: boolean): Promise<DashboardAuthUser> {
    const userRecord = await this.getUserByUsername(username);

    if (!userRecord) {
      throw new Error("Usuário não encontrado.");
    }

    const { data, error } = await this.client
      .from("dashboard_users")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(userRecord.id || ""))
      .select("id, username, role, is_active, created_at, updated_at, last_login_at")
      .single();

    if (error || !data) {
      throw new Error(`Falha ao atualizar o usuário: ${error?.message || "erro desconhecido"}`);
    }

    return this.mapUser(data as DashboardUserRecord);
  }

  public async setUserPassword(username: string, password: string): Promise<DashboardAuthUser> {
    this.validateCredentials(username, password);

    const userRecord = await this.getUserByUsername(username);

    if (!userRecord) {
      throw new Error("Usuário não encontrado.");
    }

    const { data, error } = await this.client
      .from("dashboard_users")
      .update({
        password_hash: this.hashPassword(password),
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(userRecord.id || ""))
      .select("id, username, role, is_active, created_at, updated_at, last_login_at")
      .single();

    if (error || !data) {
      throw new Error(`Falha ao atualizar a senha do usuário: ${error?.message || "erro desconhecido"}`);
    }

    return this.mapUser(data as DashboardUserRecord);
  }

  private async createSession(user: DashboardAuthUser): Promise<DashboardSession> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const { error } = await this.client.from("dashboard_sessions").insert({
      id: randomUUID(),
      user_id: user.id,
      session_hash: this.hashSessionToken(token),
      expires_at: expiresAt,
    });

    if (error) {
      throw new Error(`Falha ao criar sessão do dashboard: ${error.message}`);
    }

    return {
      token,
      user,
      expiresAt,
    };
  }

  private async countUsers(): Promise<number> {
    const { count, error } = await this.client
      .from("dashboard_users")
      .select("*", { count: "exact", head: true });

    if (error) {
      throw new Error(`Failed to count dashboard users: ${error.message}`);
    }

    return count || 0;
  }

  private async getSettings(): Promise<{ allowAdminBootstrap: boolean }> {
    const { data, error } = await this.client
      .from("dashboard_settings")
      .select("key, value_json")
      .eq("key", "auth")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load dashboard settings: ${error.message}`);
    }

    const row = data as DashboardSettingsRow | null;
    return {
      allowAdminBootstrap: row?.value_json?.allowAdminBootstrap !== false,
    };
  }

  private async getUserByUsername(username: string): Promise<DashboardUserRecord | null> {
    const { data, error } = await this.client
      .from("dashboard_users")
      .select("id, username, role, is_active, created_at, updated_at, last_login_at, password_hash")
      .eq("username", username.trim())
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as DashboardUserRecord;
  }

  private validateCredentials(username: string, password: string): void {
    const normalized = username.trim();
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(normalized)) {
      throw new Error("O usuário deve ter entre 3 e 40 caracteres usando letras, números, ponto, traço ou underline.");
    }

    if (password.length < 8) {
      throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    }
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, expectedHash] = storedHash.split(":");
    if (!salt || !expectedHash) {
      return false;
    }

    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, "hex");

    if (derived.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(derived, expected);
  }

  private hashSessionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private mapUser(item: DashboardUserRecord): DashboardAuthUser {
    return {
      id: String(item.id || ""),
      username: String(item.username || ""),
      role: String(item.role || "admin"),
      isActive: item.is_active === true,
      createdAt: String(item.created_at || new Date().toISOString()),
      updatedAt: String(item.updated_at || new Date().toISOString()),
      lastLoginAt: item.last_login_at ? String(item.last_login_at) : null,
    };
  }
}
