import { GeminiProvider } from "./gemini.provider";
import { OpenAIProvider } from "./openai.provider";
import { DeepSeekProvider } from "./deepseek.provider";
import { OpenRouterProvider } from "./openrouter.provider";
import { AnthropicProvider } from "./anthropic.provider";
import { GroqProvider } from "./groq.provider";
import { OllamaProvider } from "./ollama.provider";
import { ProviderRegistry } from "./provider-registry";
import { ILlmProvider } from "./provider.interface";
import { LlmGenerationParams, LlmGenerationResult, ProviderName } from "./provider.types";

function parseKeys(raw?: string): string[] {
  return (raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export class ProviderFactory {
  private readonly registry = new ProviderRegistry();
  private readonly defaultProvider: ProviderName;
  private readonly fallbackOrder: ProviderName[];

  constructor() {
    this.defaultProvider = (process.env.DEFAULT_LLM_PROVIDER || "gemini") as ProviderName;
    this.fallbackOrder = ((process.env.LLM_FALLBACK_ORDER || "gemini,openai,deepseek,openrouter,anthropic,groq,ollama")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)) as ProviderName[];

    this.bootstrapProviders();
  }

  public getProvider(name?: ProviderName): ILlmProvider {
    const providerName = name || this.defaultProvider;
    const provider = this.registry.get(providerName);

    if (!provider || !provider.isEnabled()) {
      throw new Error(`Provider not available: ${providerName}`);
    }

    return provider;
  }

  public async generate(params: LlmGenerationParams): Promise<LlmGenerationResult> {
    const preferred = params.provider || this.defaultProvider;

    const order = [
      preferred,
      ...this.fallbackOrder.filter((name) => name !== preferred),
    ];

    let lastError: unknown;

    for (const providerName of order) {
      const provider = this.registry.get(providerName);
      if (!provider || !provider.isEnabled()) continue;

      try {
        return await provider.generate({
          ...params,
          provider: providerName,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`All providers failed. Last error: ${String(lastError)}`);
  }

  private bootstrapProviders(): void {
    this.registry.register(
      new GeminiProvider(
        parseKeys(process.env.GEMINI_API_KEYS),
        process.env.GEMINI_MODEL || "gemini-1.5-pro"
      )
    );

    this.registry.register(
      new OpenAIProvider(
        parseKeys(process.env.OPENAI_API_KEYS),
        process.env.OPENAI_MODEL || "gpt-4o"
      )
    );

    this.registry.register(
      new DeepSeekProvider(
        parseKeys(process.env.DEEPSEEK_API_KEYS),
        process.env.DEEPSEEK_MODEL || "deepseek-chat"
      )
    );

    this.registry.register(
      new OpenRouterProvider(
        parseKeys(process.env.OPENROUTER_API_KEYS),
        process.env.OPENROUTER_MODEL || "anthropic/claude-3-opus"
      )
    );

    this.registry.register(
      new AnthropicProvider(
        parseKeys(process.env.ANTHROPIC_API_KEYS),
        process.env.ANTHROPIC_MODEL || "claude-3-opus"
      )
    );

    this.registry.register(
      new GroqProvider(
        parseKeys(process.env.GROQ_API_KEYS),
        process.env.GROQ_MODEL || "llama3-70b"
      )
    );

    this.registry.register(
      new OllamaProvider(
        process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        process.env.OLLAMA_MODEL || "llama3"
      )
    );
  }
}
