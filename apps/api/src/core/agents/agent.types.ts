export type AgentKind = "agent" | "sub-agent";

export type AgentMetadata = {
  name: string;
  description: string;
  kind: AgentKind;
  role: string;
  delegationScope: string;
  allowedSkills: string[];
  path: string;
  version?: string;
  content?: string;
};
