import { BaseHttpProvider } from "./base-http.provider";
import { LlmGenerationParams, LlmGenerationResult, LlmMessage } from "./provider.types";

export class GeminiProvider extends BaseHttpProvider {
  public readonly name = "gemini" as const;
  public readonly defaultModel: string;

  constructor(keys: string[], defaultModel: string) {
    super(keys);
    this.defaultModel = defaultModel;
  }

  protected async performRequest(params: LlmGenerationParams): Promise<LlmGenerationResult> {
    const apiKey = String(params.metadata?.apiKey || "");
    const model = params.model || this.defaultModel;

    const prompt = params.messages
      .map((message: LlmMessage) => `${message.role}: ${message.content}`)
      .join("\n\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: params.temperature ?? 0.2,
          maxOutputTokens: params.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[gemini] request failed: ${response.status} ${text}`);
    }

    const data = await response.json() as any;
    const content =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";

    return {
      provider: this.name,
      model,
      content,
      raw: data,
    };
  }
}
