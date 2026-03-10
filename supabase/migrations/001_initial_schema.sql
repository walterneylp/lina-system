create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'pending',
  assigned_agent text,
  created_at timestamptz not null default now()
);

create table if not exists executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  provider text,
  status text not null default 'pending',
  result_summary text,
  created_at timestamptz not null default now()
);

create table if not exists system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null,
  message text not null,
  created_at timestamptz not null default now()
);
