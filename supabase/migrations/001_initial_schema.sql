-- 001_initial_schema.sql
-- TooDoo: Initial schema for cross-platform sync
-- Timezone: Asia/Seoul (KST, sole user)

set timezone = 'Asia/Seoul';

-- Tasks
create table tasks (
  id              text        primary key,
  user_id         uuid        not null references auth.users(id),
  title           text        not null,
  description     text,
  category        text        not null check (category in ('scorching', 'hot', 'warm', 'cool', 'timed')),
  is_done         boolean     not null default false,
  sort_order      text        not null,
  scheduled_date  date,
  scheduled_time  text        check (scheduled_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index idx_tasks_user_updated on tasks (user_id, updated_at);
create index idx_tasks_user_category_sort on tasks (user_id, category, sort_order);

-- Project notes (attached to timed tasks)
create table project_notes (
  id              text        primary key,
  task_id         text        not null references tasks(id),
  user_id         uuid        not null references auth.users(id),
  content         text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index idx_project_notes_task on project_notes (task_id);
create index idx_project_notes_user_updated on project_notes (user_id, updated_at);

-- Notes (Notetank)
create table notes (
  id              text        primary key,
  user_id         uuid        not null references auth.users(id),
  title           text        not null,
  content         text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index idx_notes_user_updated on notes (user_id, updated_at);

-- Row Level Security
alter table tasks enable row level security;
alter table project_notes enable row level security;
alter table notes enable row level security;

-- Tasks policies
create policy "tasks_select" on tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert" on tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update" on tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete" on tasks
  for delete using (auth.uid() = user_id);

-- Project notes policies
create policy "project_notes_select" on project_notes
  for select using (auth.uid() = user_id);
create policy "project_notes_insert" on project_notes
  for insert with check (auth.uid() = user_id);
create policy "project_notes_update" on project_notes
  for update using (auth.uid() = user_id);
create policy "project_notes_delete" on project_notes
  for delete using (auth.uid() = user_id);

-- Notes policies
create policy "notes_select" on notes
  for select using (auth.uid() = user_id);
create policy "notes_insert" on notes
  for insert with check (auth.uid() = user_id);
create policy "notes_update" on notes
  for update using (auth.uid() = user_id);
create policy "notes_delete" on notes
  for delete using (auth.uid() = user_id);
