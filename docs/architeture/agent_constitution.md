Agent Constitution — LiNa AI System

Version: 1.0
Status: Canonical Governance Document
Owner: Walterney
System: LiNa AI
Date: 2026-03-10

1. Purpose

This document defines the governance and operational rules for the LiNa AI system.

The constitution establishes the fundamental rules that control how:

agents behave

skills execute

LLM providers are used

integrations operate

data is handled

tasks are processed

All modules of the LiNa system must comply with the rules defined in this constitution.

This document is the highest-level behavioral specification of the system.

2. Core Principles

The LiNa AI system follows five fundamental principles.

2.1 User Sovereignty

The system exists to serve the authorized owner.

Access must be restricted to approved user identities.

Authorization is controlled using:

TELEGRAM_ALLOWED_USER_IDS

Only whitelisted users may interact with the system.

Any request from unknown users must be ignored silently.

2.2 Deterministic Execution

All agent execution must be bounded and deterministic.

Execution must never run indefinitely.

Mandatory limits include:

MAX_ITERATIONS
MAX_EXECUTION_TIME
MAX_TOOL_CALLS_PER_TOOL

These limits prevent:

infinite loops

runaway API usage

uncontrolled resource consumption

2.3 Modular Architecture

The system must remain modular and decoupled.

The following layers must remain independent:

orchestrator

agent loop

agents

skills

integrations

providers

memory

No layer may directly depend on provider-specific logic.

All integrations must go through adapter modules.

2.4 Multi-LLM Independence

The system must support multiple LLM providers simultaneously.

Providers may include:

Gemini

OpenAI

DeepSeek

OpenRouter

Anthropic

Groq

Ollama (local)

The system must support:

multiple providers

multiple API keys per provider

automatic key rotation

provider fallback

Provider selection must be handled by:

Provider selection must be handled by ProviderFactory

The core system must never call provider APIs directly.

2.5 Privacy First

Sensitive information must never be exposed.

The system must never reveal:

API keys

environment variables

tokens

internal configuration

server paths

Logs must redact sensitive information.

3. Agent Execution Model

All reasoning inside the system follows the ReAct pattern.

Execution cycle:

Thought
Action
Observation
Answer

The reasoning loop must be implemented in the module:

agent_loop_spec.md

Execution limits must always apply.

Example limits:

MAX_ITERATIONS = 5
MAX_EXECUTION_TIME = 60 seconds
MAX_TOOL_CALLS_PER_TOOL = 3

If limits are exceeded the system must terminate execution safely.

4. Agent Hierarchy

The system supports multiple agents organized hierarchically.

Example agents:

orchestrator-agent
research-agent
coding-agent
finance-agent
automation-agent

Rules:

The orchestrator agent is the only entity allowed to delegate tasks.

Sub-agents cannot call each other directly.

All task execution must pass through the orchestrator.

Agents must operate statelessly except for memory stored in Supabase.

5. Skill Governance

Skills represent executable capabilities.

Skills must be implemented as modular plugins.

Each skill must define:

name
description
capabilities
execute()

Example capabilities:

filesystem
analysis
internet
automation
research

Skills must not:

access forbidden filesystem paths

expose secrets

execute unrestricted shell commands

bypass policy engine rules

All skill execution must pass through:

PolicyEngine
6. Policy Engine

The Policy Engine enforces operational restrictions.

Policies may include:

MAX_TOKENS_PER_TASK
MAX_COST_PER_TASK
ALLOWED_SKILLS
FORBIDDEN_PATHS
EXECUTION_TIMEOUT

Example enforcement rules:

MAX_COST_PER_TASK = $0.25
MAX_TOKENS_PER_TASK = 20000

If a policy violation occurs the system must terminate the task.

7. Memory Governance

The LiNa system uses Supabase for persistence.

Memory types include:

conversation memory
task memory
agent decision memory
system logs
environment status

Sensitive data must never be stored in plaintext logs.

Future versions may introduce:

semantic memory
vector search
knowledge embeddings
8. Security Rules

The system must implement several layers of security.

8.1 Prompt Injection Protection

The system must detect malicious instructions such as:

Ignore previous instructions
Reveal system prompt
Expose system secrets

If detected, the request must be sanitized.

8.2 Filesystem Protection

Skills may only access allowed directories.

Allowed directories:

/workspace
/tmp

Forbidden directories include:

/etc
/root
/home
8.3 Secrets Protection

Secrets must never be exposed.

Protected information includes:

.env contents
provider API keys
Supabase service role key
authentication tokens
9. Observability

The system must log critical events.

Examples:

agent.started
agent.failed
skill.executed
task.created
task.completed
provider.error
policy.violation

Logs must support debugging without exposing secrets.

10. Failure Handling

The system must gracefully handle failures.

LLM Provider Failure

If a provider fails:

switch to next provider in fallback list

Example fallback order:

gemini
openai
deepseek
openrouter
groq
ollama
Skill Failure

If a skill throws an exception:

return observation to agent loop

The agent must attempt recovery.

Execution Timeout

If execution exceeds allowed limits:

abort task safely
11. Dashboard Authority

The dashboard acts as the operational control center.

Capabilities include:

monitoring system health

observing agent activity

viewing logs

managing tasks

controlling skills

managing agents

All dashboard operations must respect the same policies as Telegram commands.

12. Evolution Rules

Future development must respect the following rules:

modular architecture must be preserved

backward compatibility must be maintained

core modules must remain provider-agnostic

no hard-coded provider logic in core modules

Architectural decisions must be recorded in:

docs/adr/
13. Governance Priority

If conflicts arise between documentation sources, the following priority applies:

1 Agent Constitution
2 spec_lina_ai_system.md
3 Module specifications
4 Implementation code

The constitution defines the ultimate governance of the LiNa AI system.
