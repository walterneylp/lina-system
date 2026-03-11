import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SkillMetadata } from "./skill.types";
import { asString, asStringArray, parseFrontmatter } from "../catalog/manifest-parser";

export class SkillLoader {
  constructor(private readonly rootDirectory: string) {}

  public load(): SkillMetadata[] {
    if (!existsSync(this.rootDirectory)) {
      return [];
    }

    return readdirSync(this.rootDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(this.rootDirectory, entry.name, "SKILL.md"))
      .filter((skillPath) => existsSync(skillPath))
      .map((skillPath) => {
        const content = readFileSync(skillPath, "utf8");
        const metadata = parseFrontmatter(content);

        return {
          name: asString(metadata.name, "unknown-skill"),
          description: asString(metadata.description, "No description provided."),
          path: skillPath,
          version: asString(metadata.version, ""),
          capabilities: asStringArray(metadata.capabilities),
          content,
        };
      });
  }
}
