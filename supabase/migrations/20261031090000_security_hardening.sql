-- Security hardening ahead of launch.

-- 1. Team members are only ever added by accept_team_invite (which checks the
--    invite token and the invitee's email) and role changes go through the
--    same path. A direct insert let an owner attach any user id to their
--    workspace without an invite, and skip the plan's team limit; a direct
--    update let them swap member_id the same way. Owners keep read and
--    remove; members keep read and leave.
drop policy if exists team_members_owner_insert on public.team_members;
drop policy if exists team_members_owner_update on public.team_members;
revoke insert, update on public.team_members from anon, authenticated;

-- 2. The avatars bucket is public, so photos load from their public URL
--    without any policy. The old "anyone can view" policy also let anyone
--    list every file in the bucket, which exposes every user's id. Reading
--    through the API is now limited to your own folder (still needed for
--    replacing your photo).
drop policy if exists "Anyone can view avatars" on storage.objects;
drop policy if exists "Users can view own avatar" on storage.objects;
create policy "Users can view own avatar" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);

-- 3. The avatar update policy had no WITH CHECK, so a file could be moved
--    into someone else's folder.
drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);
