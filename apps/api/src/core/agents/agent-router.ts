import { AgentMetadata } from "./agent.types";

const normalize = (value: string): string => value.toLowerCase().trim();
const STOP_TOKENS = new Set([
  "agent",
  "agents",
  "sub",
  "specialist",
  "specialized",
  "lina",
  "skill",
  "skills",
  "role",
]);
const tokenize = (value: string): string[] =>
  normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_TOKENS.has(token));

export class AgentRouter {
  public route(userMessage: string, agents: AgentMetadata[]): AgentMetadata | null {
    const normalizedMessage = normalize(userMessage);
    const messageTokens = tokenize(userMessage);
    let bestMatch: { agent: AgentMetadata; score: number } | null = null;
    let bestPackageMatch: { agent: AgentMetadata; score: number } | null = null;

    for (const agent of agents) {
      const candidateFields = [
        agent.name,
        agent.description,
        agent.role,
        ...agent.allowedSkills,
      ]
        .map(normalize)
        .filter(Boolean);

      const candidateTokens = candidateFields.flatMap((field) => tokenize(field));
      const overlap = candidateTokens.filter((token) => messageTokens.includes(token));
      const exactFieldMatch = candidateFields.some((field) => normalizedMessage.includes(field));
      const packageBonus = agent.format === "package" ? 2 : 0;
      const score = (exactFieldMatch ? 10 : 0) + overlap.length * 3 + packageBonus;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { agent, score };
      }

      if (agent.format === "package" && (!bestPackageMatch || score > bestPackageMatch.score)) {
        bestPackageMatch = { agent, score };
      }
    }

    if (!bestMatch || bestMatch.score < 3) {
      return null;
    }

    if (bestMatch.agent.format === "legacy" && bestPackageMatch && bestPackageMatch.score >= 3) {
      return bestPackageMatch.agent;
    }

    return bestMatch.agent;
  }
}
