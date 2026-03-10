import { AgentLoop } from "../agent-loop/agent-loop";
import { SkillLoader } from "../skills/skill-loader";
import { SkillRouter } from "../skills/skill-router";
import { LlmMessage } from "../providers/provider.types";
import { SkillMetadata } from "../skills/skill.types";
import { OrchestratorResponse } from "./orchestrator.types";

type OrchestratorInput = {
  text: string;
};

export class LinaOrchestrator {
  private readonly skillRouter = new SkillRouter();

  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly skillLoader: SkillLoader
  ) {}

  public async handle(input: OrchestratorInput): Promise<OrchestratorResponse> {
    const skills = this.skillLoader.load();
    const selectedSkill = this.skillRouter.route(input.text, skills);
    const systemPrompt = selectedSkill?.content;

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
