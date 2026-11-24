-- Reverses 20261124000000_fitcheq_v2.sql
drop function if exists public.fq_update_my_goal(text, numeric, text, int);
create function public.fq_update_my_goal(p_diet_type text, p_target_weight numeric, p_goal text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.fq_app_role_of_me() is distinct from 'member' then raise exception 'Only members can update their own goal'; end if;
  if p_diet_type not in ('veg', 'nonveg') then raise exception 'Diet must be veg or nonveg'; end if;
  if p_target_weight is not null and (p_target_weight < 20 or p_target_weight > 350) then raise exception 'Target weight looks wrong'; end if;
  update public.fq_members set diet_type = p_diet_type, target_weight = coalesce(p_target_weight, target_weight),
    goal = coalesce(nullif(p_goal, ''), goal)
  where profile_id = auth.uid();
end $$;
revoke execute on function public.fq_update_my_goal(text, numeric, text) from anon, public;
grant execute on function public.fq_update_my_goal(text, numeric, text) to authenticated;

delete from public.fq_notices where kind = 'attendance';
alter table public.fq_notices drop constraint fq_notices_kind_check;
alter table public.fq_notices add constraint fq_notices_kind_check check (kind in ('payment', 'event', 'general'));

drop table if exists public.fq_member_meals;
alter table public.fq_members drop column if exists ideal_weight, drop column if exists fee_plan_id;
drop table if exists public.fq_fee_plans;
alter table public.fq_gyms drop column if exists schedule;
