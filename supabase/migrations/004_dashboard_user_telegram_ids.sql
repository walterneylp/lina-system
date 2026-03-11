alter table if exists dashboard_users
  add column if not exists telegram_user_ids text[] not null default '{}'::text[];
