-- A monthly revenue goal for the workspace, shown on the dashboard against
-- the month so far and the month-end forecast. Set by the owner on their
-- own settings row (the existing update policy already limits that row to
-- them); everyone in the workspace can read it. Empty means no goal.

alter table public.user_settings add column if not exists monthly_revenue_goal numeric;
alter table public.user_settings drop constraint if exists user_settings_monthly_goal_positive;
alter table public.user_settings add constraint user_settings_monthly_goal_positive
  check (monthly_revenue_goal is null or (monthly_revenue_goal > 0 and monthly_revenue_goal < 1e12));
