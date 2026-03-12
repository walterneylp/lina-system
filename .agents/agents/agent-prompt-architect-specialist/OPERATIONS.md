# Operations

## Inputs

- objetivo do novo agent ou skill
- problema que ele resolve
- tipo do artifact desejado
- contexto operacional e exemplos de uso

## Workflow

1. identificar se o pedido realmente exige um novo artifact
2. definir o tipo correto: `agent`, `sub-agent` ou `skill`
3. refinar o papel com foco em utilidade real
4. estruturar:
   - objetivo
   - responsabilidades
   - limites
   - gatilhos de uso
   - input/output
5. propor um prompt-base mais forte e menos genérico
6. entregar a especificação pronta para criação no padrão oficial

## Quality Gate

Antes de aprovar a criação, validar:

- o artifact tem escopo claro
- não duplica outro artifact já existente
- o nome comunica bem a função
- o prompt evita vagueza e “faz tudo”
- há contrato operacional suficiente para execução

## Rules

- priorizar qualidade do artifact sobre velocidade
- usar linguagem clara e operacional
- preparar o artifact para ser criado no pacote canônico da LiNa
- quando fizer sentido, encaminhar a criação final usando `agent-skill-factory`
