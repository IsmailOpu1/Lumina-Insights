-- The weekly AI summary on the dashboard: a few sentences on how last week
-- went, why, and one thing to do. Written once per workspace, week and
-- language by the weekly-summary function (service role), then read by
-- everyone in the workspace. Clients can only read.

create table if not exists public.weekly_summaries (
  owner_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,                 -- Monday of the week it was written for
  language text not null check (language in ('en', 'bn')),
  summary text not null check (char_length(summary) between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key (owner_id, week_start, language)
);

alter table public.weekly_summaries enable row level security;

drop policy if exists weekly_summaries_select on public.weekly_summaries;
create policy weekly_summaries_select on public.weekly_summaries
  for select to authenticated using (has_workspace_access(owner_id, false));

revoke insert, update, delete on public.weekly_summaries from anon, authenticated;
