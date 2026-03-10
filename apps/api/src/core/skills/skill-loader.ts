import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SkillMetadata } from "./skill.types";

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;

const parseFrontmatter = (markdownContent: string): Record<string, string> => {
  const match = markdownContent.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((metadata, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex < 0) {
        return metadata;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");
      metadata[key] = value;
      return metadata;
    }, {});
};

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
          name: metadata.name || "unknown-skill",
          description: metadata.description || "No description provided.",
          path: skillPath,
          content,
        };
      });
  }
}
