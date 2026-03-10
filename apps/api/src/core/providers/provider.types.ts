export type ProviderName =
  | "gemini"
  | "openai"
  | "deepseek"
  | "openrouter"
  | "anthropic"
  | "groq"
  | "zai"
  | "ollama";

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface LlmGenerationParams {
  provider?: ProviderName;
  model?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface LlmGenerationResult {
  provider: ProviderName;
  model: string;
  content: string;
  raw?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ProviderKeyState {
  key: string;
  maskedKey: string;
  failures: number;
  cooldownUntil?: number;
  lastUsedAt?: number;
}
