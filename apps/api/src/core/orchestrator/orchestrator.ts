import { AgentLoader } from "../agents/agent-loader";
import { AgentMetadata } from "../agents/agent.types";
import { AgentLoop } from "../agent-loop/agent-loop";
import { AgentSkillFactoryExecutor } from "../delegation/agent-skill-factory-executor";
import { DelegationEngine } from "../delegation/delegation-engine";
import { SkillLoader } from "../skills/skill-loader";
import { LlmMessage } from "../providers/provider.types";
import { SkillMetadata } from "../skills/skill.types";
import { OrchestratorResponse } from "./orchestrator.types";
import { buildLiNaBaseSystemPrompt } from "../prompts/lina-base-system-prompt";

type OrchestratorInput = {
  text: string;
  runtimeContext?: string;
};

export class LinaOrchestrator {
  private readonly delegationEngine = new DelegationEngine();

  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly skillLoader: SkillLoader,
    private readonly agentLoader: AgentLoader,
    private readonly subAgentLoader: AgentLoader,
    private readonly agentSkillFactoryExecutor: AgentSkillFactoryExecutor,
    private readonly appName: string,
    private readonly environment: string
  ) {}

  public async handle(input: OrchestratorInput): Promise<OrchestratorResponse> {
    const skills = this.skillLoader.load();
    const agents = this.agentLoader.load();
    const subAgents = this.subAgentLoader.load();
    const delegation = this.delegationEngine.decide({
      text: input.text,
      agents,
      subAgents,
      skills,
    });
    const selectedSkill = skills.find((skill) => skill.name === delegation.selectedSkill) || null;
    const selectedAgent = agents.find((agent) => agent.name === delegation.selectedAgent) || null;
    const selectedSubAgent =
      subAgents.find((agent) => agent.name === delegation.selectedSubAgent) || null;
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

    if (
      this.agentSkillFactoryExecutor.canHandle({
        selectedAgent: selectedAgent?.name || null,
        selectedSkill: selectedSkill?.name || null,
      })
    ) {
      const execution = this.agentSkillFactoryExecutor.execute(input.text);

      return {
        answer: execution.answer,
        iterations: 1,
        provider: execution.provider,
        createdArtifact: {
          kind: execution.artifact.kind,
          name: execution.artifact.name,
          manifestPath: execution.artifact.manifestPath,
          overwritten: execution.artifact.overwritten,
        },
        artifactValidation: {
          valid: execution.validation.valid,
          checks: execution.validation.checks,
        },
        validationAgentName: execution.validationAgentName,
        validationSummary: execution.validationSummary,
        skillName: selectedSkill?.name || null,
        agentName: selectedAgent?.name || null,
        subAgentName: selectedSubAgent?.name || null,
        delegationMode: delegation.delegationMode,
        delegationSummary: delegation.summary,
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
      delegationMode: delegation.delegationMode,
      delegationSummary: delegation.summary,
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
