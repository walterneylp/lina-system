export type SkillMetadata = {
  name: string;
  description: string;
  path: string;
  version?: string;
  capabilities: string[];
  accessibleBy: string[];
  editableBy: string[];
  content?: string;
};
