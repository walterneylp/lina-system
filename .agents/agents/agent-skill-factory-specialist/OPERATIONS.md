# Operations

## Inputs

- tipo de artifact
- nome normalizado em kebab-case
- descrição objetiva
- restrições adicionais

## Workflow

1. identificar se o pedido é para `agent`, `sub-agent` ou `skill`
2. escolher os templates oficiais correspondentes
3. criar a pasta canônica do artifact
4. gerar os documentos exigidos pelo pacote
5. validar o artifact criado
6. responder com os caminhos exatos dos arquivos criados ou alterados

## Rules

- nunca criar formatos paralelos fora dos templates oficiais
- sempre usar nomes de pasta em kebab-case
- sempre preencher frontmatter com `name`, `description` e `version`
- para agents e sub-agents, sempre preencher `role`, `delegation_scope` e `allowed_skills`
- para skills, sempre preencher `capabilities`
- quando necessário, criar `README.md` de apoio apenas dentro da pasta do artifact
