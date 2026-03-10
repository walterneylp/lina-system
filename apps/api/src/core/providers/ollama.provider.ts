import { ILlmProvider } from "./provider.interface";
import { LlmGenerationParams, LlmGenerationResult, LlmMessage } from "./provider.types";

export class OllamaProvider implements ILlmProvider {
  public readonly name = "ollama" as const;
  public readonly defaultModel: string;

  constructor(
    private readonly baseUrl: string,
    defaultModel: string
  ) {
    this.defaultModel = defaultModel;
  }

  public isEnabled(): boolean {
    return Boolean(this.baseUrl);
  }

  public async generate(params: LlmGenerationParams): Promise<LlmGenerationResult> {
    const model = params.model || this.defaultModel;
    const prompt = params.messages
      .map((message: LlmMessage) => `${message.role}: ${message.content}`)
      .join("\n\n");

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[ollama] request failed: ${response.status} ${text}`);
    }

    const data = await response.json() as any;

    return {
      provider: this.name,
      model,
      content: data?.response ?? "",
      raw: data,
    };
  }
}
