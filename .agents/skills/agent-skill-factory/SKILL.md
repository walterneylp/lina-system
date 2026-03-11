---
name: "agent-skill-factory"
description: "Aciona a especialidade de criação padronizada de agents, sub-agents e skills da LiNa."
version: "1.0.0"
capabilities: ["analysis", "scaffolding", "agent-management", "skill-management"]
---

# agent-skill-factory

## Quando usar

Use esta skill quando o pedido envolver:

- criar um novo agent
- criar um novo sub-agent
- criar uma nova skill
- padronizar manifests em `.agents`
- corrigir estrutura canônica de agents ou skills da LiNa

## Agent preferencial

`agent-skill-factory-specialist`

## Regras

- seguir rigorosamente os templates oficiais em `.agents/templates`
- gerar arquivos apenas nos diretórios canônicos:
  - `.agents/agents`
  - `.agents/sub-agents`
  - `.agents/skills`
- evitar qualquer formato fora dos manifests oficiais
