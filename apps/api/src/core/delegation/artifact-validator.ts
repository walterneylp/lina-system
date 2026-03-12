import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { getArtifactPackageDefinition, listArtifactPackageDocuments } from "../catalog/artifact-package";
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
    const directoryPath = dirname(resolvedPath);
    const artifactPackage = listArtifactPackageDocuments(kind, directoryPath);
    const definition = getArtifactPackageDefinition(kind);

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

    if (!artifactPackage) {
      return {
        valid: false,
        manifestPath: resolvedPath,
        checks: checks.concat({
          label: "artifact-package-detected",
          ok: false,
          details: "Não foi possível detectar o pacote do artifact.",
        }),
      };
    }

    const manifestDocument =
      artifactPackage.documents.find((document) => document.role === "manifest") ||
      artifactPackage.documents[0];
    const content = manifestDocument?.content || "";
    const metadata = parseFrontmatter(content);
    const folderName = basename(directoryPath);
    const expectedRoot =
      kind === "agent"
        ? resolve(this.options.agentsDirectory)
        : kind === "sub-agent"
          ? resolve(this.options.subAgentsDirectory)
          : resolve(this.options.skillsDirectory);
    const normalizedRoot = dirname(directoryPath);
    const expectedManifestName = artifactPackage.format === "package"
      ? "MANIFEST.md"
      : kind === "agent"
        ? "AGENT.md"
        : kind === "sub-agent"
          ? "SUB_AGENT.md"
          : "SKILL.md";
    const titleLine = content.split("\n").find((line) => line.startsWith("# ")) || "";

    checks.push({
      label: "canonical-root",
      ok: normalizedRoot === expectedRoot,
      details: `Esperado: ${expectedRoot}`,
    });
    checks.push({
      label: "artifact-format",
      ok: true,
      details: `Formato detectado: ${artifactPackage.format}`,
    });
    checks.push({
      label: "canonical-filename",
      ok: basename(manifestDocument.path) === expectedManifestName,
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

    if (artifactPackage.format === "package") {
      definition.packageDocuments.forEach((document) => {
        const packageDocument = artifactPackage.documents.find((item) => item.role === document.role);
        checks.push({
          label: `document-${document.role}-present`,
          ok: Boolean(packageDocument),
          details: `Arquivo esperado: ${document.fileName}`,
        });
        checks.push({
          label: `document-${document.role}-non-empty`,
          ok: Boolean(packageDocument?.content.trim()),
          details: `${document.fileName} precisa ter conteúdo.`,
        });
      });
    }

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
      manifestPath: manifestDocument.path,
      checks,
    };
  }
}
