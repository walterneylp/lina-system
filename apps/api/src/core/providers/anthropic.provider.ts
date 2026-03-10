import { BaseHttpProvider } from "./base-http.provider";
import { LlmGenerationParams, LlmGenerationResult, LlmMessage } from "./provider.types";

export class AnthropicProvider extends BaseHttpProvider {
  public readonly name = "anthropic" as const;
  public readonly defaultModel: string;

  constructor(keys: string[], defaultModel: string) {
    super(keys);
    this.defaultModel = defaultModel;
  }

  protected async performRequest(params: LlmGenerationParams): Promise<LlmGenerationResult> {
    const apiKey = String(params.metadata?.apiKey || "");
    const model = params.model || this.defaultModel;

    const systemMessages = params.messages
      .filter((message: LlmMessage) => message.role === "system")
      .map((message: LlmMessage) => message.content)
      .join("\n");

    const userMessages = params.messages
      .filter((message: LlmMessage) => message.role !== "system")
      .map((message: LlmMessage) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: systemMessages || undefined,
        messages: userMessages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[anthropic] request failed: ${response.status} ${text}`);
    }

    const data = await response.json() as any;
    const content = Array.isArray(data?.content)
      ? data.content.map((item: any) => item?.text || "").join("")
      : "";

    return {
      provider: this.name,
      model,
      content,
      raw: data,
      usage: {
        inputTokens: data?.usage?.input_tokens,
        outputTokens: data?.usage?.output_tokens,
      },
    };
  }
}
