import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asString, asStringArray, parseFrontmatter } from "../catalog/manifest-parser";
import { AgentKind, AgentMetadata } from "./agent.types";

export class AgentLoader {
  constructor(
    private readonly rootDirectory: string,
    private readonly manifestName: "AGENT.md" | "SUB_AGENT.md",
    private readonly kind: AgentKind
  ) {}

  public load(): AgentMetadata[] {
    if (!existsSync(this.rootDirectory)) {
      return [];
    }

    return readdirSync(this.rootDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(this.rootDirectory, entry.name, this.manifestName))
      .filter((manifestPath) => existsSync(manifestPath))
      .map((manifestPath) => {
        const content = readFileSync(manifestPath, "utf8");
        const metadata = parseFrontmatter(content);

        return {
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
          path: manifestPath,
          version: asString(metadata.version, ""),
          content,
        };
      });
  }
}
