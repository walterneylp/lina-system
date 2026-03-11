export type DelegationArtifactKind = "agent" | "sub-agent" | "skill";

export type CreateDelegationArtifactInput = {
  kind: DelegationArtifactKind;
  name: string;
  description: string;
  version?: string;
  role?: string;
  delegationScope?: string;
  allowedSkills?: string[];
  capabilities?: string[];
  objective?: string;
  whenToUse?: string[];
  rules?: string[];
  overwrite?: boolean;
};

export type CreatedDelegationArtifact = {
  kind: DelegationArtifactKind;
  name: string;
  directoryPath: string;
  manifestPath: string;
  overwritten: boolean;
};
