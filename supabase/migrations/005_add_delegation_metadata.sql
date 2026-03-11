alter table if exists tasks
  add column if not exists target_agent text,
  add column if not exists target_sub_agent text,
  add column if not exists target_skill text,
  add column if not exists delegation_mode text,
  add column if not exists delegated_by text;

alter table if exists executions
  add column if not exists selected_agent text,
  add column if not exists selected_sub_agent text,
  add column if not exists selected_skill text,
  add column if not exists delegation_summary text;
