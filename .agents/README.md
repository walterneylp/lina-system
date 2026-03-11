# LiNa Agent Registry

Estrutura canônica local para delegação da LiNa.

## Diretórios

- `.agents/agents`
  Agents principais delegáveis apenas pelo orchestrator.

- `.agents/sub-agents`
  Unidades especializadas de execução subordinadas a um agent.

- `.agents/skills`
  Skills carregadas pelo `SkillLoader`.

- `.agents/templates`
  Templates oficiais para criação padronizada dos manifests.

## Convenções

- Cada `agent` deve ter `AGENT.md`
- Cada `sub-agent` deve ter `SUB_AGENT.md`
- Cada `skill` deve ter `SKILL.md`
- Todos os manifests devem usar frontmatter com pelo menos:
  - `name`
  - `description`
  - `version`

## Regras operacionais

- Apenas o orchestrator delega para `agents`
- `sub-agents` não chamam outros `sub-agents` diretamente
- `skills` continuam sendo plugins instrucionais e/ou operacionais
- A criação de novos manifests deve reutilizar os templates deste diretório
