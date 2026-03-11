import { AgentMetadata } from "./agent.types";

const normalize = (value: string): string => value.toLowerCase().trim();
const tokenize = (value: string): string[] =>
  normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

export class AgentRouter {
  public route(userMessage: string, agents: AgentMetadata[]): AgentMetadata | null {
    const normalizedMessage = normalize(userMessage);
    const messageTokens = tokenize(userMessage);

    for (const agent of agents) {
      const candidateFields = [
        agent.name,
        agent.description,
        agent.role,
        ...agent.allowedSkills,
      ]
        .map(normalize)
        .filter(Boolean);

      if (candidateFields.some((field) => normalizedMessage.includes(field))) {
        return agent;
      }

      const candidateTokens = candidateFields.flatMap((field) => tokenize(field));
      const overlap = candidateTokens.filter((token) => messageTokens.includes(token));

      if (overlap.length >= 2) {
        return agent;
      }
    }

    return null;
  }
}
