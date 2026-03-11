export type DelegationDecision = {
  selectedAgent: string | null;
  selectedSubAgent: string | null;
  selectedSkill: string | null;
  delegationMode: "direct" | "agent+skill" | "sub-agent+skill" | "skill-only" | "none";
  summary: string;
};
