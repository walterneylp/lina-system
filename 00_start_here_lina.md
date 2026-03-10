# 00_start_here_lina.md

# LiNa AI System — Project Bootstrap

Version: 1.0
Owner: Walterney
Date: 2026-03-10

This document is the entry point for the LiNa AI System repository.

It defines:

- the project structure
- document reading order
- configuration strategy
- multi-LLM environment rules
- external API integrations

All agents, developers, and automated tools must begin with this file before implementing the system.

---

# 1. Main Architecture Document

Primary architecture specification:

docs/architecture/spec_lina_ai_system.md

Legacy note:

The previous `docs/architeture/` path is considered deprecated. The canonical path is now `docs/architecture/`.

This document defines:

- system architecture
- orchestrator behavior
- agents
- skills
- integrations
- memory
- dashboard
- execution loop

---

# 2. Document Reading Order

1. docs/architecture/spec_lina_ai_system.md
2. docs/architecture/agent_constitution.md
3. docs/architecture/agent_loop_spec.md
4. docs/architecture/skill_system_spec.md
5. docs/architecture/telegram_input_spec.md
6. docs/architecture/telegram_output_spec.md
7. docs/architecture/dashboard_spec.md

---

# 3. Core Directory Structure

lina/
apps/
    api/
    dashboard/

packages/
    lina-sdk/
    config/
    ui/

supabase/
    migrations/
    seeds/

docs/
    architecture/
    adr/
    prompts/

scripts/
    dev/
    db/
    ops/

logs/
tmp/

.env
.env.example

---

# 4. Multi-LLM Strategy

The LiNa system must support multiple LLM providers simultaneously.

The system must allow:

• multiple API keys per provider  
• automatic key rotation  
• provider fallback  
• configurable provider priority  

Supported providers:

- Gemini
- OpenAI
- DeepSeek
- OpenRouter
- Anthropic
- Groq
- Ollama (local)

Example configuration:

DEFAULT_LLM_PROVIDER=gemini  
LLM_FALLBACK_ORDER=gemini,openai,deepseek,openrouter,groq,ollama

---

# 5. External API Integrations

The system supports additional APIs for knowledge retrieval and web access.

Examples:

- Brave Search
- Tavily
- SerpAPI
- Firecrawl
- Jina Reader

These integrations must live inside:

apps/api/src/integrations/

Example:

integrations/
    brave-search/
    tavily/
    serpapi/
    firecrawl/

---

# 6. Environment Configuration

Example .env structure:

APP_NAME=LiNa  
APP_ENV=development  

TELEGRAM_BOT_TOKEN=  
TELEGRAM_ALLOWED_USER_IDS=  

SUPABASE_URL=  
SUPABASE_SERVICE_ROLE_KEY=  

GEMINI_API_KEYS=  
OPENAI_API_KEYS=  
DEEPSEEK_API_KEYS=  

BRAVE_SEARCH_API_KEYS=  

MAX_ITERATIONS=5  
MAX_EXECUTION_TIME_MS=60000  

---

# 7. Implementation Order

Recommended development order:

1. Project directories
2. Environment configuration
3. ProviderFactory (multi-LLM)
4. Agent Orchestrator
5. Agent Loop
6. Supabase Memory
7. Telegram Integration
8. Skills system
9. Agents
10. Dashboard

---

# 8. Final Rule

If any conflict occurs between documents:

1. This file defines project bootstrap rules
2. spec_lina_ai_system.md defines architecture
3. module specifications refine implementation
