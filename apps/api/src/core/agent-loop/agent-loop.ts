import { ProviderFactory } from "../providers/provider-factory";
import { LlmMessage } from "../providers/provider.types";
import { AgentLoopRequest, AgentLoopResult } from "./agent-loop.types";

type AgentLoopOptions = {
  providerFactory: ProviderFactory;
  maxIterations: number;
};

export class AgentLoop {
  constructor(private readonly options: AgentLoopOptions) {}

  public async run(request: AgentLoopRequest): Promise<AgentLoopResult> {
    const boundedMessages = this.buildMessages(request.messages, request.systemPrompt);

    for (let iteration = 1; iteration <= this.options.maxIterations; iteration += 1) {
      const response = await this.options.providerFactory.generate({
        messages: boundedMessages,
        temperature: 0.2,
        maxTokens: 2048,
      });

      return {
        answer: response.content,
        iterations: iteration,
        provider: response.provider,
      };
    }

    return {
      answer: "Execution stopped after reaching MAX_ITERATIONS.",
      iterations: this.options.maxIterations,
      provider: "none",
    };
  }

  private buildMessages(messages: LlmMessage[], systemPrompt?: string): LlmMessage[] {
    if (!systemPrompt) {
      return messages;
    }

    return [{ role: "system", content: systemPrompt }, ...messages];
  }
}
