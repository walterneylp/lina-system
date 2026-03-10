import { existsSync, readFileSync } from "node:fs";

export type LinaEnv = {
  appName: string;
  appEnv: string;
  appPort: number;
  dashboardPort: number;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  defaultProvider: string;
  fallbackOrder: string[];
  maxIterations: number;
  maxExecutionTimeMs: number;
  maxToolCallsPerTool: number;
  skillsDirectory: string;
  tempDirectory: string;
  workspaceDirectory: string;
  telegramBotToken?: string;
  telegramAllowedUserIds: string[];
  telegramPollingInterval: number;
};

const parseInteger = (rawValue: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(rawValue || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseDotEnv = (): Record<string, string> => {
  const envPath = ".env";
  if (!existsSync(envPath)) {
    return {};
  }

  return readFileSync(envPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
};

const readEnvValue = (fileEnv: Record<string, string>, key: string): string | undefined =>
  process.env[key] || fileEnv[key];

export const loadEnv = (): LinaEnv => ({
  ...(() => {
    const fileEnv = parseDotEnv();
    return {
      appName: readEnvValue(fileEnv, "APP_NAME") || "LiNa",
      appEnv: readEnvValue(fileEnv, "APP_ENV") || "development",
      appPort: parseInteger(readEnvValue(fileEnv, "APP_PORT"), 3000),
      dashboardPort: parseInteger(readEnvValue(fileEnv, "DASHBOARD_PORT"), 3001),
      supabaseUrl: readEnvValue(fileEnv, "SUPABASE_URL"),
      supabaseAnonKey: readEnvValue(fileEnv, "SUPABASE_ANON_KEY"),
      supabaseServiceRoleKey: readEnvValue(fileEnv, "SUPABASE_SERVICE_ROLE_KEY"),
      defaultProvider: readEnvValue(fileEnv, "DEFAULT_LLM_PROVIDER") || "gemini",
      fallbackOrder: (readEnvValue(fileEnv, "LLM_FALLBACK_ORDER") || "gemini,openai,deepseek,openrouter,anthropic,groq,ollama")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      maxIterations: parseInteger(readEnvValue(fileEnv, "MAX_ITERATIONS"), 5),
      maxExecutionTimeMs: parseInteger(readEnvValue(fileEnv, "MAX_EXECUTION_TIME_MS"), 60_000),
      maxToolCallsPerTool: parseInteger(readEnvValue(fileEnv, "MAX_TOOL_CALLS_PER_TOOL"), 3),
      skillsDirectory: readEnvValue(fileEnv, "SKILLS_DIRECTORY") || "./.agents/skills",
      tempDirectory: readEnvValue(fileEnv, "TEMP_DIR") || "./tmp",
      workspaceDirectory: readEnvValue(fileEnv, "WORKSPACE_DIR") || "./workspace",
      telegramBotToken: readEnvValue(fileEnv, "TELEGRAM_BOT_TOKEN"),
      telegramAllowedUserIds: (readEnvValue(fileEnv, "TELEGRAM_ALLOWED_USER_IDS") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      telegramPollingInterval: parseInteger(readEnvValue(fileEnv, "TELEGRAM_POLLING_INTERVAL"), 1000),
    };
  })(),
});
