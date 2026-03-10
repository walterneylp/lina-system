export type OrchestratorResponse = {
  answer: string;
  iterations: number;
  provider: string;
  skillName?: string | null;
  availableSkills: Array<{
    name: string;
    description: string;
  }>;
};
