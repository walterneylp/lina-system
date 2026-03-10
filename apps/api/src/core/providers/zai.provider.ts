import { BaseHttpProvider } from "./base-http.provider";
import { LlmGenerationParams, LlmGenerationResult } from "./provider.types";

export class ZAiProvider extends BaseHttpProvider {
  public readonly name = "zai" as const;
  public readonly defaultModel: string;

  constructor(
    keys: string[],
    private readonly baseUrl: string,
    defaultModel: string
  ) {
    super(keys);
    this.defaultModel = defaultModel;
  }

  protected async performRequest(params: LlmGenerationParams): Promise<LlmGenerationResult> {
    const apiKey = String(params.metadata?.apiKey || "");
    const model = params.model || this.defaultModel;

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[zai] request failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as any;

    return {
      provider: this.name,
      model,
      content: data?.choices?.[0]?.message?.content ?? "",
      raw: data,
      usage: {
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
        totalTokens: data?.usage?.total_tokens,
      },
    };
  }
}
