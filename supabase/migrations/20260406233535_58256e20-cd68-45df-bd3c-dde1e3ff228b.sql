
-- 1. Create helper function for workspace-based RLS
CREATE OR REPLACE FUNCTION public.get_my_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE WHEN EXISTS (
      SELECT 1 FROM public.user_settings
      WHERE user_id = auth.uid()
      AND role = 'owner'
    ) THEN auth.uid()
    ELSE (
      SELECT owner_id
      FROM public.team_members
      WHERE member_id = auth.uid()
      AND status = 'active'
      LIMIT 1
    )
    END,
    auth.uid()
  );
$$;

-- 2. Drop all existing permissive policies
DROP POLICY IF EXISTS "Allow all on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow all on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow all on notes" ON public.notes;
DROP POLICY IF EXISTS "Allow all on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow all on marketing_outputs" ON public.marketing_outputs;
DROP POLICY IF EXISTS "Allow all on user_settings" ON public.user_settings;

-- 3. Workspace RLS for orders
CREATE POLICY "workspace_select_orders" ON public.orders FOR SELECT TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_update_orders" ON public.orders FOR UPDATE TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_delete_orders" ON public.orders FOR DELETE TO authenticated USING (owner_id = public.get_my_owner_id());

-- 4. Workspace RLS for inventory
CREATE POLICY "workspace_select_inventory" ON public.inventory FOR SELECT TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_insert_inventory" ON public.inventory FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_update_inventory" ON public.inventory FOR UPDATE TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_delete_inventory" ON public.inventory FOR DELETE TO authenticated USING (owner_id = public.get_my_owner_id());

-- 5. Workspace RLS for expenses
CREATE POLICY "workspace_select_expenses" ON public.expenses FOR SELECT TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_insert_expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_update_expenses" ON public.expenses FOR UPDATE TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_delete_expenses" ON public.expenses FOR DELETE TO authenticated USING (owner_id = public.get_my_owner_id());

-- 6. Workspace RLS for notes
CREATE POLICY "workspace_select_notes" ON public.notes FOR SELECT TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_insert_notes" ON public.notes FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_update_notes" ON public.notes FOR UPDATE TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_delete_notes" ON public.notes FOR DELETE TO authenticated USING (owner_id = public.get_my_owner_id());

-- 7. Workspace RLS for notifications
CREATE POLICY "workspace_select_notifications" ON public.notifications FOR SELECT TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_insert_notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_update_notifications" ON public.notifications FOR UPDATE TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_delete_notifications" ON public.notifications FOR DELETE TO authenticated USING (owner_id = public.get_my_owner_id());

-- 8. Workspace RLS for marketing_outputs
CREATE POLICY "workspace_select_marketing" ON public.marketing_outputs FOR SELECT TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_insert_marketing" ON public.marketing_outputs FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_update_marketing" ON public.marketing_outputs FOR UPDATE TO authenticated USING (owner_id = public.get_my_owner_id());
CREATE POLICY "workspace_delete_marketing" ON public.marketing_outputs FOR DELETE TO authenticated USING (owner_id = public.get_my_owner_id());

-- 9. user_settings RLS
CREATE POLICY "own_settings_select" ON public.user_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_settings_insert" ON public.user_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_settings_update" ON public.user_settings FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_settings_delete" ON public.user_settings FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 10. team_members RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_manages_team" ON public.team_members FOR ALL TO authenticated USING (owner_id = auth.uid() OR member_id = auth.uid());

-- 11. invites RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_manages_invites" ON public.invites FOR ALL TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "public_read_invite" ON public.invites FOR SELECT USING (true);

-- 12. Add unique constraint on user_settings.user_id for upsert
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);
