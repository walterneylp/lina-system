import { ArtifactDocumentRole } from "../catalog/artifact-package";

export type AgentKind = "agent" | "sub-agent";

export type AgentDocument = {
  role: ArtifactDocumentRole;
  fileName: string;
  path: string;
  title: string;
  content: string;
};

export type AgentMetadata = {
  name: string;
  description: string;
  kind: AgentKind;
  role: string;
  delegationScope: string;
  allowedSkills: string[];
  accessibleBy: string[];
  editableBy: string[];
  format: "legacy" | "package";
  directoryPath: string;
  path: string;
  version?: string;
  content?: string;
  documents: AgentDocument[];
};
