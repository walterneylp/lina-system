export type OrchestratorResponse = {
  answer: string;
  iterations: number;
  provider: string;
  createdArtifact?: {
    kind: string;
    name: string;
    manifestPath: string;
    overwritten: boolean;
  } | null;
  artifactValidation?: {
    valid: boolean;
    checks: Array<{
      label: string;
      ok: boolean;
      details: string;
    }>;
  } | null;
  skillName?: string | null;
  agentName?: string | null;
  subAgentName?: string | null;
  delegationMode?: string | null;
  delegationSummary?: string | null;
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
