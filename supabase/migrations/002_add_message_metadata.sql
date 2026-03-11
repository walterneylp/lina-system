alter table if exists messages
  add column if not exists source text,
  add column if not exists channel text,
  add column if not exists chat_id text,
  add column if not exists chat_type text,
  add column if not exists user_id text,
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists message_type text,
  add column if not exists transport_message_id text;
