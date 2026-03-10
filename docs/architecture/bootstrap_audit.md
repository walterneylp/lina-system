# LiNa Bootstrap Audit

## Scope
Comparação entre `00_start_here_lina.md` e o estado real do repositório em 2026-03-10.

## Fixed in this pass
- Criado o caminho canônico `docs/architecture/`.
- Criados os diretórios base previstos no bootstrap.
- Criado scaffold mínimo do monorepo para `apps`, `packages`, `supabase` e `scripts`.
- Adicionado ponto de entrada inicial da API com `ProviderFactory`, `AgentLoop`, `SkillLoader` e `LinaOrchestrator`.

## Still pending
- Implementação real do bot Telegram com `grammy`.
- Integração real com Supabase.
- Dashboard web funcional.
- Skill router baseado em LLM em vez de heurística simples.
- Exportação real de áudio/TTS e ingestão de documentos/voz no pipeline do Telegram.
