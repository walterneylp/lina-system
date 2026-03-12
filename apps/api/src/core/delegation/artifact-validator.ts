import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { asString, asStringArray, parseFrontmatter } from "../catalog/manifest-parser";
import { DelegationArtifactKind } from "./artifact-factory.types";

export type DelegationArtifactValidationCheck = {
  label: string;
  ok: boolean;
  details: string;
};

export type DelegationArtifactValidationResult = {
  valid: boolean;
  manifestPath: string;
  checks: DelegationArtifactValidationCheck[];
};

type DelegationArtifactValidatorOptions = {
  agentsDirectory: string;
  subAgentsDirectory: string;
  skillsDirectory: string;
};

export class DelegationArtifactValidator {
  constructor(private readonly options: DelegationArtifactValidatorOptions) {}

  public validate(kind: DelegationArtifactKind, manifestPath: string): DelegationArtifactValidationResult {
    const checks: DelegationArtifactValidationCheck[] = [];
    const resolvedPath = resolve(manifestPath);

    checks.push({
      label: "manifest-exists",
      ok: existsSync(resolvedPath),
      details: existsSync(resolvedPath) ? "Manifest encontrado." : "Manifest não encontrado.",
    });

    if (!existsSync(resolvedPath)) {
      return {
        valid: false,
        manifestPath: resolvedPath,
        checks,
      };
    }

    const content = readFileSync(resolvedPath, "utf8");
    const metadata = parseFrontmatter(content);
    const folderName = basename(dirname(resolvedPath));
    const expectedRoot =
      kind === "agent"
        ? resolve(this.options.agentsDirectory)
        : kind === "sub-agent"
          ? resolve(this.options.subAgentsDirectory)
          : resolve(this.options.skillsDirectory);
    const normalizedRoot = dirname(dirname(resolvedPath));
    const expectedManifestName =
      kind === "agent" ? "AGENT.md" : kind === "sub-agent" ? "SUB_AGENT.md" : "SKILL.md";
    const titleLine = content.split("\n").find((line) => line.startsWith("# ")) || "";

    checks.push({
      label: "canonical-root",
      ok: normalizedRoot === expectedRoot,
      details: `Esperado: ${expectedRoot}`,
    });
    checks.push({
      label: "canonical-filename",
      ok: basename(resolvedPath) === expectedManifestName,
      details: `Esperado: ${expectedManifestName}`,
    });
    checks.push({
      label: "folder-name-matches-manifest-name",
      ok: asString(metadata.name) === folderName,
      details: `Manifest name: ${asString(metadata.name, "vazio")} | pasta: ${folderName}`,
    });
    checks.push({
      label: "description-present",
      ok: Boolean(asString(metadata.description)),
      details: "Frontmatter precisa ter description.",
    });
    checks.push({
      label: "version-present",
      ok: Boolean(asString(metadata.version)),
      details: "Frontmatter precisa ter version.",
    });
    checks.push({
      label: "title-matches-name",
      ok: titleLine.trim() === `# ${folderName}`,
      details: `Título encontrado: ${titleLine || "ausente"}`,
    });

    if (kind === "skill") {
      checks.push({
        label: "capabilities-present",
        ok: asStringArray(metadata.capabilities).length > 0,
        details: "Skill precisa declarar capabilities.",
      });
    } else {
      checks.push({
        label: "role-present",
        ok: Boolean(asString(metadata.role)),
        details: "Agent/sub-agent precisa declarar role.",
      });
      checks.push({
        label: "delegation-scope-present",
        ok: Boolean(asString(metadata.delegation_scope)),
        details: "Agent/sub-agent precisa declarar delegation_scope.",
      });
      checks.push({
        label: "allowed-skills-present",
        ok: asStringArray(metadata.allowed_skills).length > 0,
        details: "Agent/sub-agent precisa declarar allowed_skills.",
      });
    }

    return {
      valid: checks.every((check) => check.ok),
      manifestPath: resolvedPath,
      checks,
    };
  }
}
