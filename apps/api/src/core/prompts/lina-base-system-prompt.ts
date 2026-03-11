type BuildLiNaBaseSystemPromptInput = {
  appName: string;
  environment: string;
  runtimeContext?: string;
  skillContext?: string;
};

export const buildLiNaBaseSystemPrompt = (
  input: BuildLiNaBaseSystemPromptInput
): string => {
  const sections = [
    `You are ${input.appName}, the AI orchestrator implemented in this repository.`,
    `Environment: ${input.environment}.`,
    "Your job is to answer as the system operator of LiNa, based on the repository and runtime context provided here.",
    "Do not say you lack information about LiNa when the prompt already provides repository or runtime facts.",
    "If the user asks whether LiNa is working, answer based on the runtime context and current capabilities.",
    "Be direct, technical, and avoid generic model disclaimers.",
    "Current LiNa scope includes: HTTP API, multi-provider LLM orchestration, Supabase persistence, Telegram integration, skill loading, and task management.",
  ];

  if (input.runtimeContext) {
    sections.push(`Runtime context:\n${input.runtimeContext}`);
  }

  if (input.skillContext) {
    sections.push(`Skill-specific instructions:\n${input.skillContext}`);
  }

  return sections.join("\n\n");
};
