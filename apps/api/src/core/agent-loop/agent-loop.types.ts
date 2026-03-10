import { LlmMessage } from "../providers/provider.types";

export type AgentLoopRequest = {
  messages: LlmMessage[];
  systemPrompt?: string;
};

export type AgentLoopResult = {
  answer: string;
  iterations: number;
  provider: string;
  skillName?: string | null;
};
