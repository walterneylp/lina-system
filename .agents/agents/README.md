# LiNa Agents

Diretório oficial para agents delegáveis da LiNa.

## Estrutura

Cada agent deve viver em sua própria pasta:

`.agents/agents/<agent-name>/`

Arquivos canônicos:

- `MANIFEST.md`
- `IDENTITY.md`
- `OPERATIONS.md`

## Requisitos mínimos do frontmatter

- `name`
- `description`
- `version`
- `role`
- `delegation_scope`
- `allowed_skills`
