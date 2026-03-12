import { DelegationArtifactFactory } from "./artifact-factory";
import {
  CreatedDelegationArtifact,
  CreateDelegationArtifactInput,
  DelegationArtifactKind,
} from "./artifact-factory.types";
import {
  DelegationArtifactValidationResult,
  DelegationArtifactValidator,
} from "./artifact-validator";

type AgentSkillFactoryExecutionResult = {
  answer: string;
  provider: string;
  artifact: CreatedDelegationArtifact;
  validation: DelegationArtifactValidationResult;
};

type AgentSkillFactoryExecutorOptions = {
  artifactFactory: DelegationArtifactFactory;
  artifactValidator: DelegationArtifactValidator;
};

const toKebabCase = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export class AgentSkillFactoryExecutor {
  constructor(private readonly options: AgentSkillFactoryExecutorOptions) {}

  public canHandle(input: {
    selectedAgent?: string | null;
    selectedSkill?: string | null;
  }): boolean {
    return (
      input.selectedAgent === "agent-skill-factory-specialist" &&
      input.selectedSkill === "agent-skill-factory"
    );
  }

  public execute(text: string): AgentSkillFactoryExecutionResult {
    const plan = this.buildCreationPlan(text);
    const artifact = this.options.artifactFactory.create(plan);
    const validation = this.options.artifactValidator.validate(plan.kind, artifact.manifestPath);

    return {
      provider: "system-factory",
      artifact,
      validation,
      answer: [
        `Artifact ${artifact.overwritten ? "atualizado" : "criado"} pela LiNa.`,
        `- tipo: ${artifact.kind}`,
        `- nome: ${artifact.name}`,
        `- manifest: ${artifact.manifestPath}`,
        `- validação: ${validation.valid ? "ok" : "falhou"}`,
      ]
        .concat(
          validation.checks
            .filter((check) => !check.ok)
            .map((check) => `  - ${check.label}: ${check.details}`)
        )
        .join("\n"),
    };
  }

  private buildCreationPlan(text: string): CreateDelegationArtifactInput {
    const kind = this.detectKind(text);
    const name = this.extractName(text, kind);
    const description = this.extractDescription(text, kind, name);

    return {
      kind,
      name,
      description,
      role: kind === "skill" ? undefined : "specialist",
      delegationScope:
        kind === "agent" ? "orchestrator-only" : kind === "sub-agent" ? "agent-only" : undefined,
      allowedSkills: kind === "skill" ? undefined : ["agent-skill-factory"],
      capabilities: kind === "skill" ? ["analysis"] : undefined,
      overwrite: false,
    };
  }

  private detectKind(text: string): DelegationArtifactKind {
    const normalized = text.toLowerCase();

    if (normalized.includes("sub-agent") || normalized.includes("sub agent") || normalized.includes("subagent")) {
      return "sub-agent";
    }

    if (normalized.includes("skill")) {
      return "skill";
    }

    return "agent";
  }

  private extractName(text: string, kind: DelegationArtifactKind): string {
    const kindPatterns =
      kind === "sub-agent"
        ? ["sub-agent", "sub agent", "subagent"]
        : kind === "skill"
          ? ["skill"]
          : ["agent"];

    for (const pattern of kindPatterns) {
      const quotedRegex = new RegExp(`${pattern}\\s+["'\`]([^"'\`]+)["'\`]`, "i");
      const quotedMatch = text.match(quotedRegex);
      const quotedCandidate = toKebabCase(quotedMatch?.[1] || "");

      if (quotedCandidate) {
        return quotedCandidate;
      }

      const tokenRegex = new RegExp(`${pattern}\\s+([a-zA-Z0-9._-]+)`, "i");
      const tokenMatch = text.match(tokenRegex);
      const candidate = toKebabCase(tokenMatch?.[1] || "");

      if (candidate) {
        return candidate;
      }
    }

    throw new Error("Não consegui identificar o nome do artifact no pedido.");
  }

  private extractDescription(
    text: string,
    kind: DelegationArtifactKind,
    name: string
  ): string {
    const descriptionMatch = text.match(
      /(?:descrição|descricao)\s*(?::|=)?\s*["'`]?(.+?)["'`]?$/i
    );

    if (descriptionMatch?.[1]) {
      return descriptionMatch[1].trim();
    }

    if (kind === "skill") {
      return `Skill ${name} criada pela LiNa para fluxo especializado.`;
    }

    return `${kind === "sub-agent" ? "Sub-agent" : "Agent"} ${name} criado pela LiNa para fluxo especializado.`;
  }
}
