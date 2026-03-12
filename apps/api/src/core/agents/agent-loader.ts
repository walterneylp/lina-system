import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { asString, asStringArray, parseFrontmatter } from "../catalog/manifest-parser";
import { AgentKind, AgentMetadata } from "./agent.types";
import { listArtifactPackageDocuments } from "../catalog/artifact-package";

export class AgentLoader {
  constructor(private readonly rootDirectory: string, private readonly kind: AgentKind) {}

  public load(): AgentMetadata[] {
    if (!existsSync(this.rootDirectory)) {
      return [];
    }

    return readdirSync(this.rootDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(this.rootDirectory, entry.name))
      .flatMap((directoryPath) => {
        const artifactPackage = listArtifactPackageDocuments(this.kind, directoryPath);
        if (!artifactPackage) {
          return [];
        }

        const manifestDocument =
          artifactPackage.documents.find((document) => document.role === "manifest") ||
          artifactPackage.documents[0];
        const content = manifestDocument?.content || "";
        const metadata = parseFrontmatter(content);

        return [{
          name: asString(metadata.name, "unknown-agent"),
          description: asString(metadata.description, "No description provided."),
          kind: this.kind,
          role: asString(metadata.role, "specialist"),
          delegationScope: asString(
            metadata.delegation_scope,
            this.kind === "agent" ? "orchestrator-only" : "agent-only"
          ),
          allowedSkills: asStringArray(metadata.allowed_skills),
          accessibleBy: asStringArray(metadata.accessible_by).length
            ? asStringArray(metadata.accessible_by)
            : ["LiNa"],
          editableBy: asStringArray(metadata.editable_by).length
            ? asStringArray(metadata.editable_by)
            : ["Admin"],
          format: artifactPackage.format,
          directoryPath,
          path: manifestDocument.path,
          version: asString(metadata.version, ""),
          content,
          documents: artifactPackage.documents,
        }];
      });
  }
}
