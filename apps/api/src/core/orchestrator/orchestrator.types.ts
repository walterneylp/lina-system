export type OrchestratorResponse = {
  answer: string;
  iterations: number;
  provider: string;
  skillName?: string | null;
  agentName?: string | null;
  subAgentName?: string | null;
  availableSkills: Array<{
    name: string;
    description: string;
  }>;
  availableAgents: Array<{
    name: string;
    description: string;
    role: string;
  }>;
  availableSubAgents: Array<{
    name: string;
    description: string;
    role: string;
  }>;
};
