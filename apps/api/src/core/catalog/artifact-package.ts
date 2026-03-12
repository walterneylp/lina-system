import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ArtifactKind = "agent" | "sub-agent" | "skill";

export type ArtifactDocumentRole =
  | "manifest"
  | "identity"
  | "operations"
  | "instructions"
  | "contract";

export type ArtifactDocument = {
  role: ArtifactDocumentRole;
  fileName: string;
  path: string;
  title: string;
  content: string;
};

export type ArtifactPackageFormat = "legacy" | "package";

type ArtifactPackageDefinition = {
  packageDocuments: Array<{ role: ArtifactDocumentRole; fileName: string; title: string }>;
  legacyDocuments: Array<{ role: ArtifactDocumentRole; fileName: string; title: string }>;
};

const ARTIFACT_DEFINITIONS: Record<ArtifactKind, ArtifactPackageDefinition> = {
  agent: {
    packageDocuments: [
      { role: "manifest", fileName: "MANIFEST.md", title: "Manifest" },
      { role: "identity", fileName: "IDENTITY.md", title: "Identity" },
      { role: "operations", fileName: "OPERATIONS.md", title: "Operations" },
    ],
    legacyDocuments: [{ role: "manifest", fileName: "AGENT.md", title: "Agent" }],
  },
  "sub-agent": {
    packageDocuments: [
      { role: "manifest", fileName: "MANIFEST.md", title: "Manifest" },
      { role: "operations", fileName: "OPERATIONS.md", title: "Operations" },
      { role: "contract", fileName: "CONTRACT.md", title: "Contract" },
    ],
    legacyDocuments: [{ role: "manifest", fileName: "SUB_AGENT.md", title: "Sub-Agent" }],
  },
  skill: {
    packageDocuments: [
      { role: "manifest", fileName: "MANIFEST.md", title: "Manifest" },
      { role: "instructions", fileName: "INSTRUCTIONS.md", title: "Instructions" },
      { role: "contract", fileName: "CONTRACT.md", title: "Contract" },
    ],
    legacyDocuments: [{ role: "manifest", fileName: "SKILL.md", title: "Skill" }],
  },
};

export const getArtifactPackageDefinition = (kind: ArtifactKind): ArtifactPackageDefinition =>
  ARTIFACT_DEFINITIONS[kind];

export const getPrimaryArtifactDocumentPath = (kind: ArtifactKind, directoryPath: string): string =>
  join(directoryPath, ARTIFACT_DEFINITIONS[kind].packageDocuments[0].fileName);

export const listArtifactPackageDocuments = (
  kind: ArtifactKind,
  directoryPath: string
): { format: ArtifactPackageFormat; documents: ArtifactDocument[] } | null => {
  const definition = ARTIFACT_DEFINITIONS[kind];
  const packageDocuments = definition.packageDocuments
    .map((document) => ({
      ...document,
      path: join(directoryPath, document.fileName),
    }))
    .filter((document) => existsSync(document.path))
    .map((document) => ({
      role: document.role,
      fileName: document.fileName,
      path: document.path,
      title: document.title,
      content: readFileSync(document.path, "utf8"),
    }));

  const hasCompletePackage = definition.packageDocuments.every((document) =>
    existsSync(join(directoryPath, document.fileName))
  );

  if (hasCompletePackage) {
    return {
      format: "package",
      documents: packageDocuments,
    };
  }

  const legacyDocuments = definition.legacyDocuments
    .map((document) => ({
      ...document,
      path: join(directoryPath, document.fileName),
    }))
    .filter((document) => existsSync(document.path))
    .map((document) => ({
      role: document.role,
      fileName: document.fileName,
      path: document.path,
      title: document.title,
      content: readFileSync(document.path, "utf8"),
    }));

  if (!legacyDocuments.length) {
    return null;
  }

  return {
    format: "legacy",
    documents: legacyDocuments,
  };
};

export const inferArtifactKindFromDocumentPath = (kind: ArtifactKind, path: string): boolean => {
  const definition = ARTIFACT_DEFINITIONS[kind];
  return [...definition.packageDocuments, ...definition.legacyDocuments].some((document) =>
    path.endsWith(`/${document.fileName}`)
  );
};
