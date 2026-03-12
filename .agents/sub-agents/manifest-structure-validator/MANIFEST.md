---
name: "manifest-structure-validator"
description: "Valida se agents, sub-agents e skills seguem a estrutura canônica da LiNa."
version: "1.0.0"
role: "validator"
delegation_scope: "agent-only"
allowed_skills: ["agent-skill-factory"]
accessible_by:
  - "LiNa"
editable_by:
  - "Admin"
---

# manifest-structure-validator

## Purpose

Verificar se cada artifact criado respeita pasta, documentos obrigatórios e frontmatter oficiais da LiNa.

## Scope

- tarefa limitada e objetiva
- sem delegação lateral
- sem side effects de criação
