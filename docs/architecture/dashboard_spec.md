Spec: Dashboard — LiNa AI System

Version: 1.0
Status: Canonical Module Specification
Owner: Walterney
System: LiNa AI
Date: 2026-03-10

1. Purpose

This document defines the dashboard module of the LiNa AI system.

The dashboard is the visual control center of LiNa and must provide:

system visibility

task management

agent monitoring

skill management

execution observability

kanban-based orchestration

environment status monitoring

The dashboard complements the Telegram interface and must operate under the same governance rules defined by the LiNa architecture.

2. Goals

The dashboard must allow the user to:

monitor the overall health of the system

visualize active and inactive agents

inspect registered skills

manage tasks in kanban format

assign tasks to specific agents

inspect task execution history

inspect system logs

view environment metrics

understand the current state of the orchestrator

manually trigger selected actions when allowed by policy

The dashboard is not only a monitoring interface. It is also an operational interface for the LiNa system. 

spec_lina_ai_system

3. Non-Goals

The dashboard is not intended to be:

a public SaaS portal

a multi-tenant platform

a replacement for Telegram as the primary conversational channel

a raw development console for bypassing system rules

a direct executor of provider-specific calls outside the orchestrator

All task execution must still flow through the orchestrator and policy engine. 

spec_lina_ai_system

4. Core Principles

The dashboard must follow these principles.

4.1 Operational Visibility

The dashboard must make the internal state of LiNa visible in a clean and understandable way.

4.2 Governance Consistency

Any action available through the dashboard must respect the same rules as Telegram-triggered actions.

4.3 Task-Oriented Design

The dashboard must be centered around tasks, execution, and agent coordination.

4.4 Modular UI

Dashboard modules must be independent and extensible.

4.5 Real-Time Awareness

Whenever possible, the dashboard should reflect near real-time status changes for tasks, agents, and environment metrics. 

spec_lina_ai_system

5. Main Sections

The dashboard must contain the following sections.

Overview
Agents
Skills
Tasks
Kanban
Executions
Logs
Environment
Settings

These sections are canonical and should be reflected in the application structure. 

spec_lina_ai_system

6. Overview Section

The Overview page is the system summary screen.

It must display at minimum:

Telegram bot status

Supabase status

current active LLM provider

provider fallback readiness

active tasks count

failed tasks count

active agents count

enabled skills count

CPU usage

RAM usage

uptime

last critical error

current orchestrator state

Example overview widgets
Bot Status
Supabase Status
Provider Status
Active Tasks
Active Agents
Enabled Skills
CPU
RAM
Uptime
Recent Errors

This page should be the first page shown after login. 

spec_lina_ai_system

7. Agents Section

The Agents page must show all registered agents.

Each agent card or row must display:

agent name

description

enabled or disabled status

current state

current assigned tasks

last execution timestamp

last execution result

execution success rate if available

Minimum actions

enable agent

disable agent

inspect agent details

inspect agent logs

inspect assigned skills

inspect execution history

Example agents
orchestrator-agent
research-agent
coding-agent
finance-agent
automation-agent
document-agent

The dashboard must never allow an agent to bypass orchestrator rules. 

spec_lina_ai_system

8. Skills Section

The Skills page must show all registered skills.

Each skill must display:

skill name

description

enabled or disabled status

capabilities

usage count

last execution

execution success or failure trend

Minimum actions

enable skill

disable skill

inspect skill manifest

inspect skill capabilities

inspect usage history

Example capabilities
filesystem
analysis
internet
automation
research
export

Skills loaded dynamically through the LiNa skill system must appear here. 

skill-user

9. Tasks Section

The Tasks page must provide a structured table view of all tasks.

Each task must display:

task title

task description

current status

assigned agent

priority

source

created_at

updated_at

last execution result

Allowed sources
telegram
dashboard
system
automation
Allowed statuses
backlog
planning
running
review
completed
failed
cancelled
Minimum actions

create task

edit task

assign agent

change priority

open task details

view execution history

retry failed task

archive completed task

10. Kanban Section

The Kanban page is the primary task orchestration interface.

It must allow tasks to be visualized as draggable cards.

Canonical columns
Backlog
Planning
In Progress
Review
Completed
Failed

You may display translated labels in the UI, but the internal canonical status values should remain stable.

Required card fields

Each card must show:

title

short description

assigned agent

priority

status

latest update time

Required card actions

move card between columns

assign or change agent

open full task details

retry task

duplicate task

cancel task

Execution rule

When a card enters:

In Progress

the system must:

register the status change

notify the orchestrator

validate policies

start execution if allowed

create an execution record

update logs and status continuously

This behavior must be auditable. 

spec_lina_ai_system

11. Executions Section

The Executions page must expose execution history.

Each execution record must include:

execution id

task id

executor type

executor name

start time

end time

duration

result status

failure reason if any

provider used

cost estimate if available

token estimate if available

Executor types
agent
skill
orchestrator
system

This page is essential for debugging and traceability.

12. Logs Section

The Logs page must display system logs in a filterable format.

The log stream should include events such as:

agent.started
agent.completed
agent.failed
skill.executed
skill.failed
task.created
task.updated
task.completed
provider.error
policy.violation
system.warning
system.error
Filters

The dashboard must allow filtering by:

level

component

agent

skill

task id

provider

date range

Security rule

Logs displayed in the dashboard must never expose secrets or unredacted credentials. 

telegram-output

13. Environment Section

The Environment page must show infrastructure health and runtime metrics.

Minimum metrics:

CPU usage

RAM usage

process uptime

queue size

active executions

temp storage usage

network or API error rates if available

Telegram connection health

Supabase connection health

provider readiness

Example widgets
CPU
RAM
Uptime
Temp Disk Usage
Bot Connectivity
Supabase Connectivity
Provider Pool Health
Queue Depth

This page exists to reduce invisible failures and improve operational confidence. 

spec_lina_ai_system

14. Settings Section

The Settings page must provide controlled access to configuration-level toggles.

It should allow viewing or editing only safe configuration values.

Example configurable values

default provider

provider fallback order

enable or disable dashboard actions

default task priority

max retries

audio reply default

environment thresholds

polling intervals

UI preferences

Forbidden behavior

The dashboard must not expose raw secrets such as:

provider API keys

Supabase service role key

bot token

full .env contents

Only masked or abstracted configuration views are allowed.

15. Authentication and Authorization

The dashboard must require authenticated access.

At minimum, the dashboard must support:

owner-only access

session protection

restricted control actions

If additional users are supported in the future, role-based access control must be added.

Minimum authorization model
owner
readonly

Owner can manage tasks, agents, and skills.
Readonly can inspect state but cannot trigger actions.

16. Interaction Model

The dashboard does not directly execute arbitrary logic.

All significant actions must flow through the LiNa backend.

Example flow

user moves task card

dashboard sends action request to backend

backend validates authorization

backend validates policy engine

orchestrator receives task update

execution starts if allowed

dashboard reflects state updates

This preserves architecture consistency. 

spec_lina_ai_system

17. Real-Time Updates

The dashboard should support real-time or near real-time updates.

Preferred mechanisms may include:

websocket updates

polling fallback

event-driven refresh

The following events should update the dashboard automatically when possible:

task status changes

execution completion

agent enable or disable changes

provider failures

policy violations

environment metric updates

18. Data Dependencies

The dashboard depends on the following data domains:

tasks
executions
agents
skills
system_logs
environment_status
conversations
messages
agent_decisions

These domains are defined by the LiNa master architecture. 

spec_lina_ai_system

19. Error Handling

The dashboard must gracefully handle errors.

Examples
Backend unavailable

Display a clear degraded-state message and pause live controls.

Supabase unavailable

Show read or write degradation notice.

Provider outage

Show provider health warnings without breaking the rest of the dashboard.

Unauthorized action

Show permission error and block execution.

The UI must never fail silently.

20. Observability Requirements

The dashboard itself must be observable.

Track at minimum:

failed API calls

page load issues

realtime connection failures

task update latency

execution refresh latency

These dashboard-level metrics should help distinguish UI problems from backend problems.

21. Design Requirements

The dashboard should present a professional operational look.

Design goals:

clean dark-first interface

high readability

strong status signaling

compact but understandable cards

minimal visual noise

easy navigation across system modules

The interface should feel like a control center rather than a generic admin panel.

22. Future Evolutions

Future versions may include:

timeline view of tasks

dependency graph between tasks

advanced analytics

provider cost dashboard

semantic search panel

document workspace

multi-user collaboration

approval workflows

task templates

automation recipes

These are not required for version 1.0.

23. Governance Rules

The dashboard must obey the LiNa constitutional model.

If any dashboard action conflicts with:

Agent Constitution

spec_lina_ai_system.md

Policy Engine

the dashboard action must be denied.

The dashboard is an interface, not a bypass layer. 

spec_lina_ai_system

24. Final Authority

If conflicts arise involving the dashboard, the following priority applies:

1 Agent Constitution
2 spec_lina_ai_system.md
3 dashboard_spec.md
4 UI implementation

This file defines the canonical behavior of the dashboard module.
