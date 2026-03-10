Spec: MASTER ARCHITECTURE — LiNa AI System

Versão: 1.0
Status: Canonical Architecture Document
Autor: LiNa Agent
Owner: Walterney
Data: 2026-03-10

1. Visão Geral

A LiNa é um sistema de agentes de inteligência artificial projetado para operar como um orquestrador de tarefas inteligentes, integrando:

LLMs

Skills

Sub-Agents

Memória persistente

Kanban de tarefas

Dashboard de observabilidade

A LiNa atua como um Agent Orchestrator, responsável por:

interpretar solicitações do usuário

planejar tarefas

delegar execução a Skills ou Agents

registrar resultados e estado do sistema

2. Interfaces do Sistema

A LiNa pode ser controlada por dois canais.

Interface Conversacional

Telegram Bot

Suporta:

texto

voz

documentos

Interface Visual

Dashboard Web

Funções:

monitoramento do ambiente

gerenciamento de agentes

kanban de tarefas

logs e observabilidade

3. Arquitetura Geral
flowchart TD

User[Usuário]

Telegram[Telegram Bot]
Dashboard[Dashboard Web]

InputHandler[Input Handler]
Orchestrator[LiNa Orchestrator]

Planner[Task Planner]
Router[Skill Router]

Skills[Skills Engine]
Agents[Sub Agents]

Supabase[(Supabase Memory)]

Providers[LLM Providers]

OutputHandler[Output Handler]

User --> Telegram
User --> Dashboard

Telegram --> InputHandler
InputHandler --> Orchestrator

Orchestrator --> Planner
Planner --> Router

Router --> Skills
Router --> Agents

Skills --> Providers
Agents --> Providers

Skills --> Supabase
Agents --> Supabase

Orchestrator --> Supabase

Orchestrator --> OutputHandler
OutputHandler --> Telegram
4. Componentes Principais
4.1 Agent Orchestrator

O Orchestrator é o cérebro da LiNa.

Responsável por:

interpretação da intenção

planejamento de tarefas

delegação para skills ou agents

controle de execução

4.2 Agent Loop (Reasoning Engine)

A execução do agente segue o padrão ReAct.

Ciclo:

Thought → Action → Observation → Answer

Proteções do Loop:

MAX_ITERATIONS = 5
MAX_EXECUTION_TIME = 60s
MAX_TOOL_CALLS_PER_TOOL = 3

Isso evita:

loops infinitos

consumo excessivo de tokens

falhas de execução.

4.3 Skill System

Skills são plugins de capacidade executável.

Estrutura:

skills/
   summarize
   filesystem
   research
   automation

Cada skill define:

name
description
capabilities
execute()
Skill Capabilities

Exemplo:

capabilities:
- filesystem
- analysis
- internet

Isso permite melhor decisão do Router.

4.4 Sub Agents

Sub-agents executam tarefas complexas.

Exemplos:

research-agent
coding-agent
finance-agent
automation-agent

Cada agent possui:

system prompt próprio

acesso a determinadas skills

4.5 Memory System

Memória persistente utiliza Supabase.

Tipos de memória:

Conversational Memory

Histórico de chat.

Task Memory

Histórico de execuções.

System Memory

Logs do sistema.

Semantic Memory (Futuro)

Memória vetorial.

5. Schema de Banco (Supabase)

Principais tabelas:

conversations
messages
tasks
skills
agents
executions
system_logs
environment_status
agent_decisions
6. Dashboard

O Dashboard é o centro de controle da LiNa.

Estrutura

Menu lateral:

Overview
Agents
Skills
Tasks
Kanban
Logs
Environment
Settings
Overview

Exibe:

status do bot

status LLM

estado Supabase

CPU

RAM

tasks em execução

Kanban

Sistema de tarefas estilo Trello.

Colunas:

Backlog
Planejamento
Em Execução
Revisão
Concluído
Execução automática

Quando um card entra em:

Em Execução

O sistema:

aciona Orchestrator

executa agent designado

registra execução

atualiza status

7. Input System

O Input Handler processa mensagens do Telegram.

Suporta:

texto
pdf
markdown
voz
áudio

Processamento:

PDF → pdf-parse

áudio → Whisper local

texto → direto para pipeline

Proteções
MAX_AUDIO_SIZE = 25MB
MAX_PDF_SIZE = 20MB

Arquivos temporários são removidos após uso.

8. Output System

Output Handler controla respostas.

Estratégias:

TextOutputStrategy
FileOutputStrategy
AudioOutputStrategy
ErrorOutputStrategy
Proteções

Telegram limita mensagens a 4096 caracteres.

O sistema faz chunk automático.

9. Segurança

Sistema implementa várias camadas de proteção.

Autenticação

Whitelist baseada em Telegram User ID.

Prompt Injection Guard

Detecta comandos como:

Ignore previous instructions
Skill Permissions

Exemplo:

filesystem → permitido
shell execution → bloqueado
Secrets Protection

Nunca expor:

API keys
tokens
.env
10. Observabilidade

Sistema registra eventos críticos.

Logs:

agent.started
agent.failed
skill.executed
task.created
task.completed
11. Event Bus

Sistema interno de eventos.

Exemplo:

task.created
task.started
skill.executed
agent.completed

Isso desacopla módulos.

12. Environment Monitor

Monitora:

CPU
RAM
Uptime
Active agents
Active tasks

Exibido no dashboard.

13. Agent State Machine

Estados do agente:

IDLE
PLANNING
EXECUTING
WAITING_TOOL
COMPLETED
FAILED
14. Policy Engine

Define regras operacionais.

Exemplo:

MAX_TOKENS_PER_TASK
ALLOWED_SKILLS
FORBIDDEN_PATHS
EXECUTION_BUDGET
15. Fail Safe Mechanisms

Sistema inclui proteções:

LLM fallback
Retry policy
Dead letter queue
Task retry limit
16. Roadmap Futuro

Evoluções planejadas:

memória vetorial
workflow automation
integração n8n
aprendizado de rotas de tasks
multi-agents cooperativos
ProviderFactory
  ├─ ProviderRegistry
  ├─ ProviderKeyPool
  ├─ Providers concretos
  └─ Fallback chain
17. Resultado Final

A LiNa torna-se um sistema com:

agente orquestrador

sistema de plugins

memória persistente

dashboard operacional

sistema de tarefas

automação inteligente

Arquitetura comparável a:

CrewAI
AutoGPT
LangGraph Agents

mas com controle total do usuário.
