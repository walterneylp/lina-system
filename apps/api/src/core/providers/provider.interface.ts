import { LlmGenerationParams, LlmGenerationResult, ProviderName } from "./provider.types";

export interface ILlmProvider {
  readonly name: ProviderName;
  readonly defaultModel: string;

  isEnabled(): boolean;

  generate(params: LlmGenerationParams): Promise<LlmGenerationResult>;
}
