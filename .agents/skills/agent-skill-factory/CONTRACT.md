# Contract

## Input

- kind: `agent | sub-agent | skill`
- name
- description
- opções de overwrite, quando aplicável

## Output

- artifact criado ou atualizado
- caminhos dos documentos gerados
- resultado da validação estrutural

## Side Effects

- cria diretórios canônicos
- grava documentos do pacote oficial
- pode sobrescrever artifact existente quando autorizado
