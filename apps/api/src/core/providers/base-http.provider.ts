import { ILlmProvider } from "./provider.interface";
import { LlmGenerationParams, LlmGenerationResult, ProviderName } from "./provider.types";
import { ProviderKeyPool } from "./provider-key-pool";

export abstract class BaseHttpProvider implements ILlmProvider {
  public abstract readonly name: ProviderName;
  public abstract readonly defaultModel: string;

  protected readonly keyPool: ProviderKeyPool;

  constructor(keys: string[] = []) {
    this.keyPool = new ProviderKeyPool(keys);
  }

  public isEnabled(): boolean {
    return this.name === "ollama" ? true : this.keyPool.hasKeys();
  }

  public async generate(params: LlmGenerationParams): Promise<LlmGenerationResult> {
    const model = params.model || this.defaultModel;

    if (this.name === "ollama") {
      return this.performRequest({
        ...params,
        model,
      });
    }

    const keyState = this.keyPool.getNextAvailableKey();
    if (!keyState) {
      throw new Error(`[${this.name}] no available API key`);
    }

    try {
      const result = await this.performRequest({
        ...params,
        model,
        metadata: {
          ...(params.metadata || {}),
          apiKey: keyState.key,
          maskedKey: keyState.maskedKey,
        },
      });

      this.keyPool.markSuccess(keyState.key);
      return result;
    } catch (error) {
      this.keyPool.markFailure(keyState.key);
      throw error;
    }
  }

  protected abstract performRequest(
    params: LlmGenerationParams
  ): Promise<LlmGenerationResult>;
}
