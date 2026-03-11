import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

    const manifestPath = this.getManifestPath(input.kind, name);
    const directoryPath = resolve(manifestPath, "..");
    const overwritten = existsSync(manifestPath);

    if (overwritten && !input.overwrite) {
      throw new Error(`Artifact already exists: ${manifestPath}`);
    }

    mkdirSync(directoryPath, { recursive: true });
    writeFileSync(manifestPath, this.renderContent({ ...input, name }), "utf8");

    return {
      kind: input.kind,
      name,
      directoryPath,
      manifestPath,
      overwritten,
    };
  }

  public getTemplateCatalog(): Array<{ kind: DelegationArtifactKind; path: string }> {
    return [
      { kind: "agent", path: this.getTemplatePath("agent") },
      { kind: "sub-agent", path: this.getTemplatePath("sub-agent") },
      { kind: "skill", path: this.getTemplatePath("skill") },
    ];
  }

  private renderContent(input: CreateDelegationArtifactInput & { name: string }): string {
    const template = readFileSync(this.getTemplatePath(input.kind), "utf8");

    if (input.kind === "skill") {
      return this.renderSkillTemplate(template, input);
    }

    return this.renderAgentTemplate(template, input);
  }

  private renderAgentTemplate(
    template: string,
    input: CreateDelegationArtifactInput & { name: string }
  ): string {
    const version = input.version || "1.0.0";
    const role = input.role || "specialist";
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

    return template
      .replaceAll('"agent-name"', `"${input.name}"`)
      .replaceAll('"sub-agent-name"', `"${input.name}"`)
      .replace("# agent-name", `# ${input.name}`)
      .replace("# sub-agent-name", `# ${input.name}`)
      .replace('"Descrição objetiva do agent."', input.description)
      .replace('"Descrição objetiva do sub-agent."', input.description)
      .replace('"1.0.0"', `"${version}"`)
      .replace('"specialist"', `"${role}"`)
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
  }

  private renderSkillTemplate(
    template: string,
    input: CreateDelegationArtifactInput & { name: string }
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

    return template
      .replaceAll('"skill-name"', `"${input.name}"`)
      .replace("# skill-name", `# ${input.name}`)
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
  }

  private renderInlineArray(values: string[]): string {
    return `[${values.map((value) => `"${value}"`).join(", ")}]`;
  }

  private getManifestPath(kind: DelegationArtifactKind, name: string): string {
    const directory =
      kind === "agent"
        ? this.options.agentsDirectory
        : kind === "sub-agent"
          ? this.options.subAgentsDirectory
          : this.options.skillsDirectory;
    const fileName = kind === "agent" ? "AGENT.md" : kind === "sub-agent" ? "SUB_AGENT.md" : "SKILL.md";

    return resolve(directory, name, fileName);
  }

  private getTemplatePath(kind: DelegationArtifactKind): string {
    const folder = kind === "agent" ? "agent" : kind === "sub-agent" ? "sub-agent" : "skill";
    const fileName = kind === "agent" ? "AGENT.template.md" : kind === "sub-agent" ? "SUB_AGENT.template.md" : "SKILL.template.md";

    return resolve(this.options.templatesDirectory, folder, fileName);
  }
}
