import { AgentLoop } from "../agent-loop/agent-loop";
import { SkillLoader } from "../skills/skill-loader";
import { SkillRouter } from "../skills/skill-router";
import { LlmMessage } from "../providers/provider.types";
import { SkillMetadata } from "../skills/skill.types";
import { OrchestratorResponse } from "./orchestrator.types";
import { buildLiNaBaseSystemPrompt } from "../prompts/lina-base-system-prompt";

type OrchestratorInput = {
  text: string;
  runtimeContext?: string;
};

export class LinaOrchestrator {
  private readonly skillRouter = new SkillRouter();

  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly skillLoader: SkillLoader,
    private readonly appName: string,
    private readonly environment: string
  ) {}

  public async handle(input: OrchestratorInput): Promise<OrchestratorResponse> {
    const skills = this.skillLoader.load();
    const selectedSkill = this.skillRouter.route(input.text, skills);
    const systemPrompt = buildLiNaBaseSystemPrompt({
      appName: this.appName,
      environment: this.environment,
      runtimeContext: input.runtimeContext,
      skillContext: selectedSkill?.content,
    });

    const messages: LlmMessage[] = [{ role: "user", content: input.text }];

    const result = await this.agentLoop.run({
      messages,
      systemPrompt,
    });

    return {
      ...result,
      skillName: selectedSkill?.name || null,
      availableSkills: skills.map((skill: SkillMetadata) => ({
        name: skill.name,
        description: skill.description,
      })),
    };
  }
}
