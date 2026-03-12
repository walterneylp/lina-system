import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ArtifactDocumentRole,
  getArtifactPackageDefinition,
  getPrimaryArtifactDocumentPath,
} from "../catalog/artifact-package";
import { asString, asStringArray, parseFrontmatter } from "../catalog/manifest-parser";
import {
  CreateDelegationArtifactInput,
  CreatedDelegationArtifact,
  DelegationArtifactKind,
} from "./artifact-factory.types";

type DelegationArtifactFactoryOptions = {
  agentsDirectory: string;
  subAgentsDirectory: string;
  skillsDirectory: string;
  templatesDirectory: string;
};

const toKebabCase = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export class DelegationArtifactFactory {
  constructor(private readonly options: DelegationArtifactFactoryOptions) {}

  public create(input: CreateDelegationArtifactInput): CreatedDelegationArtifact {
    const name = toKebabCase(input.name);

    if (!name) {
      throw new Error("Artifact name could not be normalized to kebab-case.");
    }

    const directoryPath = this.getDirectoryPath(input.kind, name);
    const manifestPath = getPrimaryArtifactDocumentPath(input.kind, directoryPath);
    const definition = getArtifactPackageDefinition(input.kind);
    const overwritten = definition.packageDocuments.some((document) =>
      existsSync(resolve(directoryPath, document.fileName))
    );

    if (overwritten && !input.overwrite) {
      throw new Error(`Artifact already exists: ${directoryPath}`);
    }

    mkdirSync(directoryPath, { recursive: true });
    const documents = this.renderDocuments({ ...input, name });

    documents.forEach((document) => {
      writeFileSync(document.path, document.content, "utf8");
    });

    return {
      kind: input.kind,
      name,
      directoryPath,
      manifestPath,
      documents: documents.map((document) => ({
        role: document.role,
        fileName: document.fileName,
        title: document.title,
        path: document.path,
      })),
      overwritten,
    };
  }

  public getTemplateCatalog(): Array<{
    kind: DelegationArtifactKind;
    format: "package";
    documents: Array<{ role: string; title: string; path: string }>;
  }> {
    return (["agent", "sub-agent", "skill"] as const).map((kind) => ({
      kind,
      format: "package",
      documents: getArtifactPackageDefinition(kind).packageDocuments.map((document) => ({
        role: document.role,
        title: document.title,
        path: this.getTemplatePath(kind, document.fileName),
      })),
    }));
  }

  public migrateLegacyArtifact(
    kind: DelegationArtifactKind,
    directoryPath: string
  ): CreatedDelegationArtifact {
    const normalizedDirectoryPath = resolve(directoryPath);
    const definition = getArtifactPackageDefinition(kind);
    const legacyDocument = definition.legacyDocuments.find((document) =>
      existsSync(resolve(normalizedDirectoryPath, document.fileName))
    );

    if (!legacyDocument) {
      throw new Error(`Legacy artifact not found in ${normalizedDirectoryPath}`);
    }

    const legacyPath = resolve(normalizedDirectoryPath, legacyDocument.fileName);
    const legacyContent = readFileSync(legacyPath, "utf8");
    const legacyMetadata = parseFrontmatter(legacyContent);
    const name = toKebabCase(asString(legacyMetadata.name));

    if (!name) {
      throw new Error(`Legacy artifact at ${legacyPath} has no valid name.`);
    }

    const documents = this.renderLegacyMigrationDocuments(kind, name, legacyContent);
    documents.forEach((document) => {
      writeFileSync(document.path, document.content, "utf8");
    });

    return {
      kind,
      name,
      directoryPath: normalizedDirectoryPath,
      manifestPath: resolve(normalizedDirectoryPath, "MANIFEST.md"),
      documents: documents.map((document) => ({
        role: document.role,
        fileName: document.fileName,
        title: document.title,
        path: document.path,
      })),
      overwritten: true,
    };
  }

  private renderDocuments(
    input: CreateDelegationArtifactInput & { name: string }
  ): Array<{
    role: ArtifactDocumentRole;
    fileName: string;
    title: string;
    path: string;
    content: string;
  }> {
    const directoryPath = this.getDirectoryPath(input.kind, input.name);
    return getArtifactPackageDefinition(input.kind).packageDocuments.map((document) => {
      const template = readFileSync(this.getTemplatePath(input.kind, document.fileName), "utf8");
      return {
        role: document.role,
        fileName: document.fileName,
        title: document.title,
        path: resolve(directoryPath, document.fileName),
        content: this.renderDocumentTemplate(input, document.role, template),
      };
    });
  }

  private renderLegacyMigrationDocuments(
    kind: DelegationArtifactKind,
    name: string,
    legacyContent: string
  ): Array<{
    role: ArtifactDocumentRole;
    fileName: string;
    title: string;
    path: string;
    content: string;
  }> {
    const directoryPath = this.getDirectoryPath(kind, name);
    const metadata = parseFrontmatter(legacyContent);
    const body = this.extractLegacyBody(legacyContent);
    const description = asString(metadata.description, `Artifact ${name} migrado do formato legado.`);
    const version = asString(metadata.version, "1.0.0");
    const accessibleBy = asStringArray(metadata.accessible_by).length
      ? asStringArray(metadata.accessible_by)
      : ["LiNa"];
    const editableBy = asStringArray(metadata.editable_by).length
      ? asStringArray(metadata.editable_by)
      : ["Admin"];

    const manifestContent = this.buildMigratedManifest({
      kind,
      name,
      description,
      version,
      role: asString(metadata.role),
      delegationScope: asString(metadata.delegation_scope),
      allowedSkills: asStringArray(metadata.allowed_skills),
      capabilities: asStringArray(metadata.capabilities),
      accessibleBy,
      editableBy,
    });

    const packageDefinition = getArtifactPackageDefinition(kind);
    return packageDefinition.packageDocuments.map((document) => {
      const path = resolve(directoryPath, document.fileName);
      if (document.role === "manifest") {
        return {
          role: document.role,
          fileName: document.fileName,
          title: document.title,
          path,
          content: manifestContent,
        };
      }

      return {
        role: document.role,
        fileName: document.fileName,
        title: document.title,
        path,
        content: this.buildMigratedSecondaryDocument(kind, document.role, body),
      };
    });
  }

  private extractLegacyBody(legacyContent: string): string {
    const normalized = legacyContent.replace(/\r\n/g, "\n");
    const frontmatterMatch = normalized.match(/^---\n[\s\S]*?\n---\n?/);
    const body = frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized;
    return body.trim();
  }

  private buildMigratedManifest(input: {
    kind: DelegationArtifactKind;
    name: string;
    description: string;
    version: string;
    role: string;
    delegationScope: string;
    allowedSkills: string[];
    capabilities: string[];
    accessibleBy: string[];
    editableBy: string[];
  }): string {
    const frontmatterLines = [
      "---",
      `name: "${input.name}"`,
      `description: "${input.description.replace(/"/g, '\\"')}"`,
      `version: "${input.version}"`,
    ];

    if (input.kind === "skill") {
      frontmatterLines.push(`capabilities: ${this.renderInlineArray(input.capabilities.length ? input.capabilities : ["analysis"])}`);
    } else {
      frontmatterLines.push(`role: "${input.role || "specialist"}"`);
      frontmatterLines.push(`delegation_scope: "${input.delegationScope || (input.kind === "agent" ? "orchestrator-only" : "agent-only")}"`);
      frontmatterLines.push(`allowed_skills: ${this.renderInlineArray(input.allowedSkills.length ? input.allowedSkills : ["agent-skill-factory"])}`);
    }

    frontmatterLines.push("accessible_by:");
    input.accessibleBy.forEach((item) => {
      frontmatterLines.push(`  - "${item}"`);
    });
    frontmatterLines.push("editable_by:");
    input.editableBy.forEach((item) => {
      frontmatterLines.push(`  - "${item}"`);
    });
    frontmatterLines.push("---", "", `# ${input.name}`, "");

    if (input.kind === "skill") {
      frontmatterLines.push("## Purpose", "", input.description);
    } else {
      frontmatterLines.push("## Purpose", "", input.description, "", "## Boundaries", "", "- migrado do formato legado");
    }

    return frontmatterLines.join("\n");
  }

  private buildMigratedSecondaryDocument(
    kind: DelegationArtifactKind,
    role: ArtifactDocumentRole,
    legacyBody: string
  ): string {
    const safeBody = legacyBody || "Sem conteúdo legado adicional.";

    if (kind === "agent" && role === "identity") {
      return ["# Identity", "", "## Legacy Context", "", safeBody].join("\n");
    }

    if (kind === "skill" && role === "instructions") {
      return ["# Instructions", "", "## Legacy Context", "", safeBody].join("\n");
    }

    return [
      `# ${role.charAt(0).toUpperCase()}${role.slice(1)}`,
      "",
      "## Legacy Context",
      "",
      safeBody,
    ].join("\n");
  }

  private renderDocumentTemplate(
    input: CreateDelegationArtifactInput & { name: string },
    role: ArtifactDocumentRole,
    template: string
  ): string {
    if (input.kind === "skill") {
      return this.renderSkillDocument(template, input, role);
    }

    return this.renderAgentDocument(template, input, role);
  }

  private renderAgentDocument(
    template: string,
    input: CreateDelegationArtifactInput & { name: string },
    documentRole: ArtifactDocumentRole
  ): string {
    const version = input.version || "1.0.0";
    const artifactRole = input.role || "specialist";
    const delegationScope = input.delegationScope || (input.kind === "agent" ? "orchestrator-only" : "agent-only");
    const allowedSkills = input.allowedSkills?.length ? input.allowedSkills : ["agent-skill-factory"];
    const objective =
      input.objective ||
      (input.kind === "agent"
        ? "Descreva com precisão o objetivo operacional do agent."
        : "Descreva a unidade de trabalho especializada deste sub-agent.");
    const rules = input.rules?.length
      ? input.rules
      : input.kind === "agent"
        ? [
            "agir apenas dentro do escopo definido",
            "não criar formato alternativo de arquivos",
            "respeitar os templates oficiais da LiNa",
          ]
        : [
            "responder apenas com o resultado necessário",
            "respeitar os formatos oficiais da LiNa",
          ];

    const rendered = template
      .replaceAll('"agent-name"', `"${input.name}"`)
      .replaceAll('"sub-agent-name"', `"${input.name}"`)
      .replace('"Descrição objetiva do agent."', input.description)
      .replace('"Descrição objetiva do sub-agent."', input.description)
      .replace('"1.0.0"', `"${version}"`)
      .replace('"specialist"', `"${artifactRole}"`)
      .replace('"orchestrator-only"', `"${delegationScope}"`)
      .replace('"agent-only"', `"${delegationScope}"`)
      .replace('["skill-a", "skill-b"]', this.renderInlineArray(allowedSkills))
      .replace('["skill-a"]', this.renderInlineArray(allowedSkills))
      .replace("Descreva com precisão o objetivo operacional do agent.", objective)
      .replace("Descreva a unidade de trabalho especializada deste sub-agent.", objective)
      .replace(
        "- agir apenas dentro do escopo definido\n- não criar formato alternativo de arquivos\n- respeitar os templates oficiais da LiNa",
        rules.map((rule) => `- ${rule}`).join("\n")
      )
      .replace(
        "- responder apenas com o resultado necessário\n- respeitar os formatos oficiais da LiNa",
        rules.map((rule) => `- ${rule}`).join("\n")
      );

    if (documentRole === "manifest") {
      return rendered.replace("# agent-name", `# ${input.name}`).replace("# sub-agent-name", `# ${input.name}`);
    }

    return rendered;
  }

  private renderSkillDocument(
    template: string,
    input: CreateDelegationArtifactInput & { name: string },
    role: ArtifactDocumentRole
  ): string {
    const version = input.version || "1.0.0";
    const capabilities = input.capabilities?.length ? input.capabilities : ["analysis"];
    const whenToUse = input.whenToUse?.length
      ? input.whenToUse
      : ["explique em quais pedidos esta skill deve ser acionada"];
    const objective = input.objective || "Descreva o que a skill instrui ou habilita.";
    const rules = input.rules?.length
      ? input.rules
      : [
          "seguir os templates oficiais da LiNa",
          "evitar formatos paralelos",
          "produzir saída objetiva",
        ];

    const rendered = template
      .replaceAll('"skill-name"', `"${input.name}"`)
      .replace('"Descrição objetiva da skill."', input.description)
      .replace('"1.0.0"', `"${version}"`)
      .replace('["analysis"]', this.renderInlineArray(capabilities))
      .replace(
        "Explique em quais pedidos esta skill deve ser acionada.",
        whenToUse.map((item) => `- ${item}`).join("\n")
      )
      .replace("Descreva o que a skill instrui ou habilita.", objective)
      .replace(
        "- seguir os templates oficiais da LiNa\n- evitar formatos paralelos\n- produzir saída objetiva",
        rules.map((rule) => `- ${rule}`).join("\n")
      );

    if (role === "manifest") {
      return rendered.replace("# skill-name", `# ${input.name}`);
    }

    return rendered;
  }

  private renderInlineArray(values: string[]): string {
    return `[${values.map((value) => `"${value}"`).join(", ")}]`;
  }

  private getDirectoryPath(kind: DelegationArtifactKind, name: string): string {
    const directory =
      kind === "agent"
        ? this.options.agentsDirectory
        : kind === "sub-agent"
          ? this.options.subAgentsDirectory
          : this.options.skillsDirectory;

    return resolve(directory, name);
  }

  private getTemplatePath(kind: DelegationArtifactKind, fileName: string): string {
    const folder = kind === "agent" ? "agent" : kind === "sub-agent" ? "sub-agent" : "skill";

    return resolve(this.options.templatesDirectory, folder, `${fileName.replace(/\.md$/i, "")}.template.md`);
  }
}
