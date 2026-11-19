-- Reverses 20261119000000_fitcheq_core.sql
drop function if exists public.fq_mark_my_workout(uuid, text);
drop function if exists public.fq_update_my_goal(text, numeric, text);
drop table if exists public.fq_weight_logs, public.fq_diet_logs, public.fq_diet_items, public.fq_diet_plans,
  public.fq_workout_assignments, public.fq_workouts, public.fq_facilities, public.fq_events, public.fq_notices,
  public.fq_payments, public.fq_members, public.fq_trainers, public.fq_profiles, public.fq_gyms cascade;
drop function if exists public.fq_payments_sync();
drop function if exists public.fq_weight_logs_sync();
drop function if exists public.fq_is_admin();
drop function if exists public.fq_is_staff();
drop function if exists public.fq_app_role_of_me();
drop function if exists public.fq_app_gym();
drop type if exists public.fq_role;
