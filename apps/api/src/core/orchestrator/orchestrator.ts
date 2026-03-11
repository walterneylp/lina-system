import { AgentLoader } from "../agents/agent-loader";
import { AgentRouter } from "../agents/agent-router";
import { AgentMetadata } from "../agents/agent.types";
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
  private readonly agentRouter = new AgentRouter();

  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly skillLoader: SkillLoader,
    private readonly agentLoader: AgentLoader,
    private readonly subAgentLoader: AgentLoader,
    private readonly appName: string,
    private readonly environment: string
  ) {}

  public async handle(input: OrchestratorInput): Promise<OrchestratorResponse> {
    const skills = this.skillLoader.load();
    const agents = this.agentLoader.load();
    const subAgents = this.subAgentLoader.load();
    const selectedSkill = this.skillRouter.route(input.text, skills);
    const selectedAgent = this.agentRouter.route(input.text, agents);
    const selectedSubAgent = this.agentRouter.route(input.text, subAgents);
    const delegationContext = JSON.stringify(
      {
        agents: agents.map((agent) => ({
          name: agent.name,
          description: agent.description,
          role: agent.role,
          allowedSkills: agent.allowedSkills,
        })),
        subAgents: subAgents.map((agent) => ({
          name: agent.name,
          description: agent.description,
          role: agent.role,
          allowedSkills: agent.allowedSkills,
        })),
        skills: skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          capabilities: skill.capabilities,
        })),
      },
      null,
      2
    );
    const systemPrompt = buildLiNaBaseSystemPrompt({
      appName: this.appName,
      environment: this.environment,
      runtimeContext: input.runtimeContext,
      skillContext: selectedSkill?.content,
      agentContext: this.buildAgentContext(selectedAgent, selectedSubAgent),
      delegationContext,
    });

    const messages: LlmMessage[] = [{ role: "user", content: input.text }];

    const result = await this.agentLoop.run({
      messages,
      systemPrompt,
    });

    return {
      ...result,
      skillName: selectedSkill?.name || null,
      agentName: selectedAgent?.name || null,
      subAgentName: selectedSubAgent?.name || null,
      availableSkills: skills.map((skill: SkillMetadata) => ({
        name: skill.name,
        description: skill.description,
      })),
      availableAgents: agents.map((agent: AgentMetadata) => ({
        name: agent.name,
        description: agent.description,
        role: agent.role,
      })),
      availableSubAgents: subAgents.map((agent: AgentMetadata) => ({
        name: agent.name,
        description: agent.description,
        role: agent.role,
      })),
    };
  }

  private buildAgentContext(
    selectedAgent: AgentMetadata | null,
    selectedSubAgent: AgentMetadata | null
  ): string | undefined {
    const contexts = [selectedAgent, selectedSubAgent].filter(Boolean) as AgentMetadata[];

    if (!contexts.length) {
      return undefined;
    }

    return contexts
      .map(
        (agent) =>
          [
            `name: ${agent.name}`,
            `kind: ${agent.kind}`,
            `role: ${agent.role}`,
            `delegation_scope: ${agent.delegationScope}`,
            `allowed_skills: ${agent.allowedSkills.join(", ") || "none"}`,
            "",
            agent.content || "",
          ].join("\n")
      )
      .join("\n\n");
  }
}
