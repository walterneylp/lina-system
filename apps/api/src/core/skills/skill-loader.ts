import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SkillMetadata } from "./skill.types";
import { asString, asStringArray, parseFrontmatter } from "../catalog/manifest-parser";
import { listArtifactPackageDocuments } from "../catalog/artifact-package";

export class SkillLoader {
  constructor(private readonly rootDirectory: string) {}

  public load(): SkillMetadata[] {
    if (!existsSync(this.rootDirectory)) {
      return [];
    }

    return readdirSync(this.rootDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(this.rootDirectory, entry.name))
      .flatMap((directoryPath) => {
        const artifactPackage = listArtifactPackageDocuments("skill", directoryPath);
        if (!artifactPackage) {
          return [];
        }

        const manifestDocument =
          artifactPackage.documents.find((document) => document.role === "manifest") ||
          artifactPackage.documents[0];
        const content = manifestDocument?.content || "";
        const metadata = parseFrontmatter(content);

        return [{
          name: asString(metadata.name, "unknown-skill"),
          description: asString(metadata.description, "No description provided."),
          directoryPath,
          path: manifestDocument.path,
          version: asString(metadata.version, ""),
          capabilities: asStringArray(metadata.capabilities),
          accessibleBy: asStringArray(metadata.accessible_by).length
            ? asStringArray(metadata.accessible_by)
            : ["LiNa"],
          editableBy: asStringArray(metadata.editable_by).length
            ? asStringArray(metadata.editable_by)
            : ["Admin"],
          format: artifactPackage.format,
          content,
          documents: artifactPackage.documents,
        }];
      });
  }
}
