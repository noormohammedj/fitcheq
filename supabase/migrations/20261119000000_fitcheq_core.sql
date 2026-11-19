-- Fitcheq core schema (tables prefixed fq_ so they can share a database with other apps): one gym per owner account, three roles (admin, trainer, member).
-- Every table carries gym_id with row-level security scoped to the caller's gym.
-- Money is stored in paise (bigint). Down script: supabase/rollbacks/20261119000000_fitcheq_core.down.sql

create extension if not exists pgcrypto;

create type public.fq_role as enum ('admin', 'trainer', 'member');

create table public.fq_gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  about text,
  hours text,
  created_at timestamptz not null default now()
);

create table public.fq_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  role public.fq_role not null,
  full_name text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index fq_profiles_gym_id_idx on public.fq_profiles(gym_id);
create unique index fq_profiles_phone_idx on public.fq_profiles(phone);

create table public.fq_trainers (
  profile_id uuid primary key references public.fq_profiles(id) on delete cascade,
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  speciality text,
  experience_years int,
  certifications text,
  bio text,
  slots text
);
create index fq_trainers_gym_id_idx on public.fq_trainers(gym_id);

create table public.fq_members (
  profile_id uuid primary key references public.fq_profiles(id) on delete cascade,
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  trainer_id uuid references public.fq_profiles(id) on delete set null,
  diet_type text not null default 'veg' check (diet_type in ('veg', 'nonveg')),
  goal text not null default 'lose' check (goal in ('lose', 'gain', 'fit')),
  start_weight numeric(5,1),
  current_weight numeric(5,1),
  target_weight numeric(5,1),
  height_cm int,
  plan_name text,
  fee_paise bigint check (fee_paise >= 0),
  paid_until date,
  joined_on date not null default current_date
);
create index fq_members_gym_id_idx on public.fq_members(gym_id);
create index fq_members_trainer_id_idx on public.fq_members(trainer_id);

create table public.fq_payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  member_id uuid not null references public.fq_members(profile_id) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  paid_on date not null default current_date,
  period_until date not null,
  method text,
  note text,
  recorded_by uuid references public.fq_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index fq_payments_gym_id_idx on public.fq_payments(gym_id);
create index fq_payments_member_id_idx on public.fq_payments(member_id);

create table public.fq_notices (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  member_id uuid references public.fq_members(profile_id) on delete cascade,  -- null = everyone
  kind text not null default 'general' check (kind in ('payment', 'event', 'general')),
  title text not null,
  body text,
  created_by uuid references public.fq_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index fq_notices_gym_id_idx on public.fq_notices(gym_id);
create index fq_notices_member_id_idx on public.fq_notices(member_id);

create table public.fq_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  title text not null,
  starts_on date not null,
  starts_at time,
  details text,
  created_by uuid references public.fq_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index fq_events_gym_id_idx on public.fq_events(gym_id);

create table public.fq_facilities (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  name text not null,
  category text,
  quantity int not null default 1,
  status text not null default 'ok' check (status in ('ok', 'maintenance', 'new')),
  note text
);
create index fq_facilities_gym_id_idx on public.fq_facilities(gym_id);

create table public.fq_workouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  name text not null,
  focus text,
  duration_min int,
  exercises jsonb not null default '[]'::jsonb,  -- [{ "name": "Squat", "sets": "4 x 10" }]
  created_by uuid references public.fq_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index fq_workouts_gym_id_idx on public.fq_workouts(gym_id);

create table public.fq_workout_assignments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  member_id uuid not null references public.fq_members(profile_id) on delete cascade,
  on_date date not null,
  workout_id uuid references public.fq_workouts(id) on delete set null,
  title text not null,
  exercises jsonb not null default '[]'::jsonb,
  note text,
  status text not null default 'assigned' check (status in ('assigned', 'done', 'skipped')),
  assigned_by uuid references public.fq_profiles(id) on delete set null,
  marked_by uuid references public.fq_profiles(id) on delete set null,
  marked_at timestamptz,
  created_at timestamptz not null default now()
);
create index fq_workout_assignments_gym_id_idx on public.fq_workout_assignments(gym_id);
create index fq_workout_assignments_member_date_idx on public.fq_workout_assignments(member_id, on_date);

create table public.fq_diet_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),  -- always a Monday
  diet_type text not null check (diet_type in ('veg', 'nonveg')),
  created_by uuid references public.fq_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (gym_id, week_start, diet_type)
);
create index fq_diet_plans_gym_id_idx on public.fq_diet_plans(gym_id);

create table public.fq_diet_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.fq_diet_plans(id) on delete cascade,
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  day smallint not null check (day between 0 and 6),  -- 0 = Monday
  meal text not null check (meal in ('breakfast', 'midmorning', 'lunch', 'snack', 'dinner')),
  items text not null,
  kcal int,
  protein_g int,
  unique (plan_id, day, meal)
);
create index fq_diet_items_gym_id_idx on public.fq_diet_items(gym_id);

create table public.fq_diet_logs (
  member_id uuid not null references public.fq_members(profile_id) on delete cascade,
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  on_date date not null,
  meal text not null check (meal in ('breakfast', 'midmorning', 'lunch', 'snack', 'dinner')),
  status text not null check (status in ('done', 'skipped')),
  updated_at timestamptz not null default now(),
  primary key (member_id, on_date, meal)
);
create index fq_diet_logs_gym_id_idx on public.fq_diet_logs(gym_id);

create table public.fq_weight_logs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.fq_gyms(id) on delete cascade,
  member_id uuid not null references public.fq_members(profile_id) on delete cascade,
  on_date date not null default current_date,
  weight numeric(5,1) not null check (weight between 20 and 350),
  recorded_by uuid references public.fq_profiles(id) on delete set null,
  unique (member_id, on_date)
);
create index fq_weight_logs_gym_id_idx on public.fq_weight_logs(gym_id);

-- ---------- helpers (run once per query inside policies) ----------
create function public.fq_app_gym() returns uuid
language sql stable security definer set search_path = public as $$
  select gym_id from public.fq_profiles where id = auth.uid() and active
$$;

create function public.fq_app_role_of_me() returns public.fq_role
language sql stable security definer set search_path = public as $$
  select role from public.fq_profiles where id = auth.uid() and active
$$;

create function public.fq_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'trainer') from public.fq_profiles where id = auth.uid() and active), false)
$$;

create function public.fq_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.fq_profiles where id = auth.uid() and active), false)
$$;

-- a new weigh-in updates the member's current weight
create function public.fq_weight_logs_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.fq_members m set current_weight = new.weight
  where m.profile_id = new.member_id
    and new.on_date >= coalesce((select max(on_date) from public.fq_weight_logs w where w.member_id = new.member_id and w.id <> new.id), new.on_date);
  return new;
end $$;
create trigger fq_weight_logs_sync after insert or update on public.fq_weight_logs for each row execute function public.fq_weight_logs_sync();

-- a recorded payment extends the membership
create function public.fq_payments_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.fq_members set paid_until = greatest(coalesce(paid_until, new.period_until), new.period_until)
  where profile_id = new.member_id;
  return new;
end $$;
create trigger fq_payments_sync after insert on public.fq_payments for each row execute function public.fq_payments_sync();

-- members change only their own preferences through this function
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

-- members mark their own workout as done or skipped
create function public.fq_mark_my_workout(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('assigned', 'done', 'skipped') then raise exception 'Bad status'; end if;
  update public.fq_workout_assignments set status = p_status, marked_by = auth.uid(), marked_at = now()
  where id = p_id and member_id = auth.uid();
  if not found then raise exception 'Workout not found'; end if;
end $$;

-- ---------- row-level security ----------
alter table public.fq_gyms enable row level security;
alter table public.fq_profiles enable row level security;
alter table public.fq_trainers enable row level security;
alter table public.fq_members enable row level security;
alter table public.fq_payments enable row level security;
alter table public.fq_notices enable row level security;
alter table public.fq_events enable row level security;
alter table public.fq_facilities enable row level security;
alter table public.fq_workouts enable row level security;
alter table public.fq_workout_assignments enable row level security;
alter table public.fq_diet_plans enable row level security;
alter table public.fq_diet_items enable row level security;
alter table public.fq_diet_logs enable row level security;
alter table public.fq_weight_logs enable row level security;

create policy fq_gyms_read on public.fq_gyms for select to authenticated using (id = (select public.fq_app_gym()));
create policy fq_gyms_admin on public.fq_gyms for update to authenticated using (id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_profiles_read on public.fq_profiles for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or role <> 'member' or id = (select auth.uid())));
create policy fq_profiles_admin_update on public.fq_profiles for update to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()))
  with check (gym_id = (select public.fq_app_gym()));

create policy fq_trainers_read on public.fq_trainers for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_trainers_admin on public.fq_trainers for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_members_read on public.fq_members for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or profile_id = (select auth.uid())));
create policy fq_members_staff_update on public.fq_members for update to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()))
  with check (gym_id = (select public.fq_app_gym()));

create policy fq_payments_read on public.fq_payments for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_admin()) or member_id = (select auth.uid())));
create policy fq_payments_admin on public.fq_payments for insert to authenticated
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));
create policy fq_payments_admin_delete on public.fq_payments for delete to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_notices_read on public.fq_notices for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id is null or member_id = (select auth.uid())));
create policy fq_notices_staff on public.fq_notices for insert to authenticated
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()));
create policy fq_notices_admin_delete on public.fq_notices for delete to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_events_read on public.fq_events for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_events_admin on public.fq_events for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_facilities_read on public.fq_facilities for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_facilities_admin on public.fq_facilities for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_admin()));

create policy fq_workouts_read on public.fq_workouts for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_workouts_staff on public.fq_workouts for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()));

create policy fq_wa_read on public.fq_workout_assignments for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())));
create policy fq_wa_staff on public.fq_workout_assignments for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()));

create policy fq_dp_read on public.fq_diet_plans for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_dp_staff on public.fq_diet_plans for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()));

create policy fq_di_read on public.fq_diet_items for select to authenticated using (gym_id = (select public.fq_app_gym()));
create policy fq_di_staff on public.fq_diet_items for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()))
  with check (gym_id = (select public.fq_app_gym()) and (select public.fq_is_staff()));

create policy fq_dl_read on public.fq_diet_logs for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())));
create policy fq_dl_write on public.fq_diet_logs for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())))
  with check (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())));

create policy fq_wl_read on public.fq_weight_logs for select to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())));
create policy fq_wl_write on public.fq_weight_logs for all to authenticated
  using (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())))
  with check (gym_id = (select public.fq_app_gym()) and ((select public.fq_is_staff()) or member_id = (select auth.uid())));

-- grants only on Fitcheq tables; other apps in this database are untouched
do $$
declare t text;
begin
  foreach t in array array['fq_gyms','fq_profiles','fq_trainers','fq_members','fq_payments','fq_notices','fq_events','fq_facilities','fq_workouts','fq_workout_assignments','fq_diet_plans','fq_diet_items','fq_diet_logs','fq_weight_logs'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke execute on function public.fq_update_my_goal(text, numeric, text), public.fq_mark_my_workout(uuid, text) from anon, public;
grant execute on function public.fq_update_my_goal(text, numeric, text), public.fq_mark_my_workout(uuid, text) to authenticated;
revoke execute on function public.fq_app_gym(), public.fq_app_role_of_me(), public.fq_is_staff(), public.fq_is_admin() from anon, public;
grant execute on function public.fq_app_gym(), public.fq_app_role_of_me(), public.fq_is_staff(), public.fq_is_admin() to authenticated;
revoke execute on function public.fq_weight_logs_sync(), public.fq_payments_sync() from anon, public, authenticated;
