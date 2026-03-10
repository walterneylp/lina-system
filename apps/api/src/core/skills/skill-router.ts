import { SkillMetadata } from "./skill.types";

export class SkillRouter {
  public route(userMessage: string, skills: SkillMetadata[]): SkillMetadata | null {
    const normalizedMessage = userMessage.toLowerCase();

    for (const skill of skills) {
      const skillName = skill.name.toLowerCase();
      const description = skill.description.toLowerCase();

      if (normalizedMessage.includes(skillName) || normalizedMessage.includes(description)) {
        return skill;
      }
    }

    return null;
  }
}
