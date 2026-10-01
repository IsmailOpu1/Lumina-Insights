-- Fix 1: workspace access helper — owner, or an active team member (optionally write-capable)
create or replace function public.has_workspace_access(target_owner uuid, require_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_owner = auth.uid()
     or exists (
       select 1 from team_members tm
       where tm.owner_id = target_owner
         and tm.member_id = auth.uid()
         and tm.status = 'active'
         and (not require_write or tm.role <> 'viewer')
     );
$$;

-- Fix 2: replace owner_id-only RLS on every workspace data table with the helper above,
-- so invited managers/viewers can actually see and (for managers) write the owner's data.
do $$
declare
  t text;
begin
  for t in select unnest(array['inventory','orders','expenses','notes','marketing_outputs','notifications'])
  loop
    execute format('drop policy if exists workspace_select_%1$s on %1$s', t);
    execute format('drop policy if exists workspace_insert_%1$s on %1$s', t);
    execute format('drop policy if exists workspace_update_%1$s on %1$s', t);
    execute format('drop policy if exists workspace_delete_%1$s on %1$s', t);

    execute format('create policy workspace_select_%1$s on %1$s for select using (public.has_workspace_access(owner_id, false))', t);
    execute format('create policy workspace_insert_%1$s on %1$s for insert with check (public.has_workspace_access(owner_id, true))', t);
    execute format('create policy workspace_update_%1$s on %1$s for update using (public.has_workspace_access(owner_id, true)) with check (public.has_workspace_access(owner_id, true))', t);
    execute format('create policy workspace_delete_%1$s on %1$s for delete using (public.has_workspace_access(owner_id, true))', t);
  end loop;
end $$;

-- Fix 3: close the team_members self-insert hole. Previously "owner_id = auth.uid() OR member_id = auth.uid()"
-- applied to ALL commands, including INSERT — meaning any authenticated user could insert themselves
-- as an active member of ANY business by guessing/knowing that owner's uid, without a real invite.
-- Split into granular policies; direct client INSERT is now owner-only. Member rows are instead created
-- by accept_team_invite() below, which runs as SECURITY DEFINER and bypasses this policy safely because
-- it validates a real, unexpired, unused invite first.
drop policy if exists owner_manages_team on team_members;

create policy team_members_select on team_members
  for select using (owner_id = auth.uid() or member_id = auth.uid());

create policy team_members_owner_insert on team_members
  for insert with check (owner_id = auth.uid());

create policy team_members_owner_update on team_members
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy team_members_owner_or_self_delete on team_members
  for delete using (owner_id = auth.uid() or member_id = auth.uid());

-- Needed for the upsert in accept_team_invite()
alter table team_members
  add constraint team_members_owner_member_unique unique (owner_id, member_id);

-- Fix 4: single atomic, server-side invite acceptance. Replaces the duplicated client-side logic
-- in Signup.tsx and Login.tsx (team_members insert + user_settings upsert + mark-used, done as three
-- separate unguarded client calls in two different files). Runs as the authenticated user, but as
-- SECURITY DEFINER so it can safely write team_members on their behalf after verifying the invite.
create or replace function public.accept_team_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_uid uuid := auth.uid();
  v_full_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_invite
  from invites
  where token = p_token and used = false
  for update;

  if not found then
    raise exception 'invite_not_found_or_used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  select raw_user_meta_data->>'full_name' into v_full_name
  from auth.users where id = v_uid;

  insert into team_members (owner_id, member_id, email, role, status)
  values (v_invite.owner_id, v_uid, coalesce((select email from auth.users where id = v_uid), v_invite.email), v_invite.role, 'active')
  on conflict (owner_id, member_id) do update
    set status = 'active', role = excluded.role;

  insert into user_settings (user_id, owner_id, role, onboarding_complete, full_name)
  values (v_uid, v_invite.owner_id, v_invite.role, true, coalesce(v_full_name, ''))
  on conflict (user_id) do update
    set owner_id = excluded.owner_id,
        role = excluded.role,
        onboarding_complete = true;

  update invites set used = true where id = v_invite.id;
end;
$$;

grant execute on function public.accept_team_invite(text) to authenticated;
