import { AgentRouter } from "../agents/agent-router";
import { AgentMetadata } from "../agents/agent.types";
import { SkillRouter } from "../skills/skill-router";
import { SkillMetadata } from "../skills/skill.types";
import { DelegationDecision } from "./delegation.types";

export class DelegationEngine {
  private readonly skillRouter = new SkillRouter();
  private readonly agentRouter = new AgentRouter();

  public decide(input: {
    text: string;
    agents: AgentMetadata[];
    subAgents: AgentMetadata[];
    skills: SkillMetadata[];
  }): DelegationDecision {
    const selectedSkill = this.skillRouter.route(input.text, input.skills);
    const selectedAgent = this.agentRouter.route(input.text, input.agents);
    const selectedSubAgent = this.agentRouter.route(input.text, input.subAgents);

    let delegationMode: DelegationDecision["delegationMode"] = "none";

    if (selectedAgent && selectedSkill) {
      delegationMode = "agent+skill";
    } else if (selectedSubAgent && selectedSkill) {
      delegationMode = "sub-agent+skill";
    } else if (selectedSkill) {
      delegationMode = "skill-only";
    } else if (selectedAgent || selectedSubAgent) {
      delegationMode = "direct";
    }

    const summaryParts = [
      `mode=${delegationMode}`,
      `agent=${selectedAgent?.name || "none"}`,
      `subAgent=${selectedSubAgent?.name || "none"}`,
      `skill=${selectedSkill?.name || "none"}`,
    ];

    return {
      selectedAgent: selectedAgent?.name || null,
      selectedSubAgent: selectedSubAgent?.name || null,
      selectedSkill: selectedSkill?.name || null,
      delegationMode,
      summary: summaryParts.join(" | "),
    };
  }
}
