-- Pin the search_path of the date helper (Supabase security advisor 0011).
alter function public.dhaka_today() set search_path = public;
