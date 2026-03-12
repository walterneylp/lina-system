import { ArtifactDocumentRole } from "../catalog/artifact-package";

export type SkillDocument = {
  role: ArtifactDocumentRole;
  fileName: string;
  path: string;
  title: string;
  content: string;
};

export type SkillMetadata = {
  name: string;
  description: string;
  directoryPath: string;
  path: string;
  version?: string;
  capabilities: string[];
  accessibleBy: string[];
  editableBy: string[];
  format: "legacy" | "package";
  content?: string;
  documents: SkillDocument[];
};
