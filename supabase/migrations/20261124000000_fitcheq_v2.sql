-- Fitcheq v2: each member gets their own day-by-day meals, gyms get fee plans and structured opening hours,
-- members get an ideal weight, and trainers can send "we missed you" reminders.
-- Additive only: existing rows keep working. Down script: supabase/rollbacks/20261124000000_fitcheq_v2.down.sql

-- opening hours, one entry per weekday (0 = Monday):
-- [{ "closed": false, "slots": [["05:30","10:30"], ["16:00","22:00"]] }, ...]
alter table public.fq_gyms add column schedule jsonb not null default '[]'::jsonb;

create table public.fq_fee_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  name text not null,
  months int not null check (months between 1 and 36),
  fee_paise bigint not null check (fee_paise >= 0),
  details text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index fq_fee_plans_gym_id_idx on public.fq_fee_plans(gym_id);

alter table public.fq_members
  add column fee_plan_id uuid references public.fq_fee_plans(id) on delete set null,
  add column ideal_weight numeric(5,1) check (ideal_weight between 20 and 350);
create index fq_members_fee_plan_id_idx on public.fq_members(fee_plan_id);

-- a member's own meals for a given date, written by their trainer
create table public.fq_member_meals (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  member_id uuid not null references public.fq_members(profile_id) on delete cascade,
  on_date date not null,
  meal text not null check (meal in ('breakfast', 'midmorning', 'lunch', 'snack', 'dinner')),
  items text not null check (length(trim(items)) > 0),
  kcal int check (kcal >= 0),
  protein_g int check (protein_g >= 0),
  updated_by uuid references public.fq_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (member_id, on_date, meal)
);
create index fq_member_meals_gym_id_idx on public.fq_member_meals(gym_id);

-- "we missed you" reminders are recorded alongside other notices
alter table public.fq_notices drop constraint fq_notices_kind_check;
alter table public.fq_notices add constraint fq_notices_kind_check check (kind in ('payment', 'event', 'general', 'attendance'));

-- members may also set their height (used for the ideal weight)
drop function public.fq_update_my_goal(text, numeric, text);
create function public.fq_update_my_goal(p_diet_type text, p_target_weight numeric, p_goal text default null, p_height_cm int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.fq_app_role_of_me() is distinct from 'member' then raise exception 'Only members can update their own goal'; end if;
  if p_diet_type not in ('veg', 'nonveg') then raise exception 'Diet must be veg or nonveg'; end if;
  if p_target_weight is not null and (p_target_weight < 20 or p_target_weight > 350) then raise exception 'Target weight looks wrong'; end if;
  if p_height_cm is not null and (p_height_cm < 100 or p_height_cm > 230) then raise exception 'Height looks wrong'; end if;
  update public.fq_members set diet_type = p_diet_type, target_weight = coalesce(p_target_weight, target_weight),
    goal = coalesce(nullif(p_goal, ''), goal), height_cm = coalesce(p_height_cm, height_cm)
  where profile_id = auth.uid();
end $$;

alter table public.fq_fee_plans enable row level security;
alter table public.fq_member_meals enable row level security;

create policy fq_fee_plans_read on public.fq_fee_plans for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_fee_plans_admin on public.fq_fee_plans for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_mm_read on public.fq_member_meals for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())));
create policy fq_mm_staff on public.fq_member_meals for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()));

revoke all on public.fq_fee_plans, public.fq_member_meals from anon;
grant select, insert, update, delete on public.fq_fee_plans, public.fq_member_meals to authenticated;
revoke execute on function public.fq_update_my_goal(text, numeric, text, int) from anon, public;
grant execute on function public.fq_update_my_goal(text, numeric, text, int) to authenticated;
