create table if not exists dashboard_users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists dashboard_sessions (
  id text primary key,
  user_id text not null references dashboard_users(id) on delete cascade,
  session_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists dashboard_sessions_user_id_idx
  on dashboard_sessions (user_id);

create index if not exists dashboard_sessions_expires_at_idx
  on dashboard_sessions (expires_at);

create table if not exists dashboard_settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);

insert into dashboard_settings (key, value_json)
values ('auth', '{"allowAdminBootstrap": true}'::jsonb)
on conflict (key) do nothing;
