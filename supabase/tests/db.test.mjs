// Applies the migrations to an in-memory Postgres (PGlite), checks the access rules for each role,
// rolls back, and applies again.  Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url), RB = new URL('../rollbacks/', import.meta.url);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
`);
const files = readdirSync(MIG).filter((n) => n.endsWith('.sql')).sort();
const up = async () => { for (const f of files) await db.exec(readFileSync(new URL(f, MIG), 'utf8').replace(/^create extension.*$/gm, '')); };
const down = async () => { for (const f of files.slice().reverse()) await db.exec(readFileSync(new URL(f.replace('.sql', '.down.sql'), RB), 'utf8')); };
await db.exec(`create table public.profiles(id uuid primary key, email text); grant select on public.profiles to anon; create table public.plots(id int)`);
await up(); console.log('migrations applied');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const U = { a: '00000000-0000-0000-0000-0000000000a1', t: '00000000-0000-0000-0000-0000000000b1', m: '00000000-0000-0000-0000-0000000000c1', m2: '00000000-0000-0000-0000-0000000000c2', x: '00000000-0000-0000-0000-0000000000d1' };
const G1 = '10000000-0000-0000-0000-000000000001', G2 = '10000000-0000-0000-0000-000000000002';

async function seed() {
  await db.exec('reset role');
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1, $2)', [id, id + '@x']);
  await db.query(`insert into fq_gyms(id, name) values ($1, 'FitFirm'), ($2, 'Other gym')`, [G1, G2]);
  await db.query(`insert into fq_profiles(id, gym_id, role, full_name, phone) values
    ($1,$6,'admin','Owner','1'), ($2,$6,'trainer','Coach','2'), ($3,$6,'member','Ravi','3'), ($4,$6,'member','Sita','4'), ($5,$7,'admin','Other','5')`, [U.a, U.t, U.m, U.m2, U.x, G1, G2]);
  await db.query(`insert into fq_members(profile_id, gym_id, trainer_id, start_weight, current_weight, target_weight, fee_paise) values ($1,$3,$4,90,90,80,250000), ($2,$3,$4,70,70,62,250000)`, [U.m, U.m2, G1, U.t]);
}
async function as(who, q, p = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who ? U[who] : '']);
  await db.exec('set role authenticated');
  try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec('reset role'); }
}

async function checks() {
  await seed();
  ok((await db.query(`select has_table_privilege('anon', 'public.profiles', 'select') as x`)).rows[0].x === true, 'another app\u2019s table keeps its grants');
  ok((await as('m', 'select * from fq_members')).rows.length === 1, 'member sees only their own member row');
  ok((await as('t', 'select * from fq_members')).rows.length === 2, 'trainer sees all fq_members of the gym');
  ok((await as('x', 'select * from fq_members')).rows.length === 0, 'admin of another gym sees no fq_members');
  ok((await as('m', `update fq_members set paid_until = '2030-01-01'`)).rows !== undefined && (await as('a', `select paid_until from fq_members where profile_id = $1`, [U.m])).rows[0].paid_until === null, 'member cannot mark themselves paid');
  ok(!(await as('m', `select fq_update_my_goal('nonveg', 78)`)).error, 'member can set diet type and target');
  ok((await as('m', `select diet_type, target_weight from fq_members`)).rows[0].diet_type === 'nonveg', 'diet type saved');
  ok(!!(await as('t', `select fq_update_my_goal('veg', 70)`)).error, 'trainer cannot call the member-only goal function');
  ok(!(await as('a', `insert into fq_payments(gym_id, member_id, amount_paise, period_until) values ($1,$2,250000,'2027-01-31')`, [G1, U.m])).error, 'admin records a payment');
  ok((await as('a', `select paid_until from fq_members where profile_id = $1`, [U.m])).rows[0].paid_until.toISOString().slice(0, 10) === '2027-01-31', 'payment extends paid_until');
  ok(!!(await as('t', `insert into fq_payments(gym_id, member_id, amount_paise, period_until) values ($1,$2,100,'2027-01-31')`, [G1, U.m])).error, 'trainer cannot record fq_payments');
  ok((await as('m2', 'select * from fq_payments')).rows.length === 0, 'member cannot see another member’s fq_payments');
  const plan = await as('t', `insert into fq_diet_plans(gym_id, week_start, diet_type) values ($1, '2026-11-16', 'veg') returning id`, [G1]);
  ok(!plan.error, 'trainer loads a weekly veg plan');
  ok(!(await as('t', `insert into fq_diet_items(plan_id, gym_id, day, meal, items, kcal) values ($1,$2,0,'breakfast','Idli x3',300)`, [plan.rows[0].id, G1])).error, 'trainer adds a meal');
  ok(!!(await as('m', `insert into fq_diet_items(plan_id, gym_id, day, meal, items) values ($1,$2,1,'lunch','x')`, [plan.rows[0].id, G1])).error, 'member cannot edit the plan');
  ok((await as('m', 'select * from fq_diet_items')).rows.length === 1, 'member reads the gym plan');
  ok(!!(await as('t', `insert into fq_diet_plans(gym_id, week_start, diet_type) values ($1, '2026-11-17', 'veg')`, [G1])).error, 'plan week must start on Monday');
  ok(!(await as('m', `insert into fq_diet_logs(member_id, gym_id, on_date, meal, status) values ($1,$2,'2026-11-16','breakfast','done')`, [U.m, G1])).error, 'member logs a meal');
  ok(!!(await as('m', `insert into fq_diet_logs(member_id, gym_id, on_date, meal, status) values ($1,$2,'2026-11-16','breakfast','done')`, [U.m2, G1])).error, 'member cannot log for someone else');
  ok(!(await as('m', `insert into fq_weight_logs(member_id, gym_id, weight) values ($1,$2,88.4)`, [U.m, G1])).error, 'member logs weight');
  ok(Number((await as('m', 'select current_weight from fq_members')).rows[0].current_weight) === 88.4, 'weigh-in updates current weight');
  const wa = await as('t', `insert into fq_workout_assignments(gym_id, member_id, on_date, title) values ($1,$2,current_date,'Legs') returning id`, [G1, U.m]);
  ok(!wa.error, 'trainer assigns a workout');
  ok(!(await as('m', `select fq_mark_my_workout($1, 'done')`, [wa.rows[0].id])).error, 'member marks own workout done');
  ok(!!(await as('m2', `select fq_mark_my_workout($1, 'done')`, [wa.rows[0].id])).error, 'another member cannot mark it');
  ok(!!(await as('m', `update fq_workout_assignments set title = 'x'`)).rows && (await as('t', `select title from fq_workout_assignments`)).rows[0].title === 'Legs', 'member cannot rename a workout');
  ok(!(await as('t', `insert into fq_notices(gym_id, member_id, kind, title) values ($1,$2,'payment','Fee due')`, [G1, U.m])).error, 'staff sends a payment reminder');
  ok((await as('m2', 'select * from fq_notices')).rows.length === 0, 'reminder is private to its member');
  ok(!!(await as('t', `insert into fq_events(gym_id, title, starts_on) values ($1,'Zumba','2026-12-01')`, [G1])).error, 'trainer cannot create fq_events');
  ok(!(await as('a', `insert into fq_events(gym_id, title, starts_on) values ($1,'Zumba','2026-12-01')`, [G1])).error, 'admin creates fq_events');
  ok((await as('x', 'select * from fq_events')).rows.length === 0, 'other gym cannot see fq_events');
  ok((await as(null, 'select * from fq_gyms')).error !== undefined || (await as(null, 'select * from fq_gyms')).rows.length === 0, 'signed-out users see nothing');

  // ---------- v2: owner settings ----------
  const sched = JSON.stringify([{ closed: false, slots: [['05:30', '10:30'], ['16:00', '22:00']] }]);
  ok(!(await as('a', `update fq_gyms set schedule = $1::jsonb, hours = 'Mon 5:30-10:30' where id = $2`, [sched, G1])).error, 'owner saves opening hours');
  ok((await as('m', 'select schedule from fq_gyms')).rows[0].schedule[0].slots[1][1] === '22:00', 'member reads opening hours');
  await as('t', `update fq_gyms set schedule = '[]'::jsonb`);
  ok((await as('a', 'select schedule from fq_gyms')).rows[0].schedule.length === 1, 'trainer cannot change opening hours');
  const fp = await as('a', `insert into fq_fee_plans(gym_id, name, months, fee_paise) values ($1, 'Quarterly', 3, 750000) returning id`, [G1]);
  ok(!fp.error, 'owner adds a fee plan');
  ok(!!(await as('t', `insert into fq_fee_plans(gym_id, name, months, fee_paise) values ($1, 'Cheap', 1, 100)`, [G1])).error, 'trainer cannot add a fee plan');
  ok(!!(await as('a', `insert into fq_fee_plans(gym_id, name, months, fee_paise) values ($1, 'Bad', 0, 100)`, [G1])).error, 'fee plan needs at least one month');
  ok((await as('m', 'select * from fq_fee_plans')).rows.length === 1, 'member sees the gym’s fee plans');
  ok((await as('x', 'select * from fq_fee_plans')).rows.length === 0, 'other gym cannot see the fee plans');
  ok(!(await as('a', `update fq_members set fee_plan_id = $1, plan_name = 'Quarterly', fee_paise = 750000 where profile_id = $2`, [fp.rows[0].id, U.m])).error, 'owner puts a member on a fee plan');
  await as('a', `delete from fq_fee_plans where id = $1`, [fp.rows[0].id]);
  ok((await as('a', `select fee_plan_id, plan_name from fq_members where profile_id = $1`, [U.m])).rows[0].fee_plan_id === null, 'deleting a plan keeps the member, clears the link');
  ok(!(await as('a', `update fq_trainers set speciality = 'Yoga' where profile_id = $1`, [U.t])).error, 'owner edits trainer details');
  ok(!(await as('a', `update fq_profiles set full_name = 'Coach Ravi' where id = $1`, [U.t])).error && (await as('a', `select full_name from fq_profiles where id = $1`, [U.t])).rows[0].full_name === 'Coach Ravi', 'owner renames a trainer');
  await as('t', `update fq_profiles set full_name = 'Hacked' where id = $1`, [U.a]);
  ok((await as('a', `select full_name from fq_profiles where id = $1`, [U.a])).rows[0].full_name === 'Owner', 'trainer cannot rename the owner');
  ok(!!(await as('t', `insert into fq_trainers(profile_id, gym_id) values ($1, $2)`, [U.m2, G1])).error, 'trainer cannot add trainers');

  // ---------- v2: per-member daily meals ----------
  const meal = await as('t', `insert into fq_member_meals(gym_id, member_id, on_date, meal, items, kcal, protein_g) values ($1,$2,'2026-11-25','breakfast','Ragi dosa x2',340,11) returning id`, [G1, U.m]);
  ok(!meal.error, 'trainer sets a member’s breakfast for a day');
  ok(!!(await as('t', `insert into fq_member_meals(gym_id, member_id, on_date, meal, items) values ($1,$2,'2026-11-25','breakfast','Idli')`, [G1, U.m])).error, 'one entry per member, day and meal');
  ok(!(await as('t', `insert into fq_member_meals(gym_id, member_id, on_date, meal, items) values ($1,$2,'2026-11-25','breakfast','Idli x3') on conflict (member_id, on_date, meal) do update set items = excluded.items`, [G1, U.m])).error, 'trainer changes that meal');
  ok((await as('m', `select items from fq_member_meals`)).rows[0].items === 'Idli x3', 'member sees the changed meal');
  ok((await as('m2', `select * from fq_member_meals`)).rows.length === 0, 'another member cannot see it');
  ok((await as('x', `select * from fq_member_meals`)).rows.length === 0, 'another gym cannot see it');
  ok(!!(await as('m', `insert into fq_member_meals(gym_id, member_id, on_date, meal, items) values ($1,$2,'2026-11-25','lunch','Pizza')`, [G1, U.m])).error, 'member cannot write their own diet');
  await as('m', `update fq_member_meals set items = 'Pizza'`);
  ok((await as('t', `select items from fq_member_meals`)).rows[0].items === 'Idli x3', 'member cannot edit their diet');
  ok(!!(await as('t', `insert into fq_member_meals(gym_id, member_id, on_date, meal, items) values ($1,$2,'2026-11-25','brunch','x')`, [G1, U.m])).error, 'meal name is checked');
  ok(!!(await as('t', `insert into fq_member_meals(gym_id, member_id, on_date, meal, items) values ($1,$2,'2026-11-25','lunch','  ')`, [G1, U.m])).error, 'blank meal is refused');
  ok(!(await as('m', `insert into fq_diet_logs(member_id, gym_id, on_date, meal, status) values ($1,$2,'2026-11-25','breakfast','skipped')`, [U.m, G1])).error, 'member marks that meal skipped');

  // ---------- v2: workouts for the next days, progress, reminders ----------
  const w3 = await as('t', `insert into fq_workout_assignments(gym_id, member_id, on_date, title) select $1, $2, current_date + i, 'Push' from generate_series(1, 3) i returning id`, [G1, U.m]);
  ok(!w3.error && w3.rows.length === 3, 'trainer plans workouts for the next 3 days');
  ok(!(await as('t', `update fq_workout_assignments set title = 'Pull', exercises = '[{"name":"Row","sets":"4 x 10"}]' where id = $1`, [w3.rows[0].id])).error, 'trainer changes a planned workout');
  ok(!(await as('m', `select fq_mark_my_workout($1, 'skipped')`, [w3.rows[1].id])).error, 'member marks a workout skipped');
  ok(!(await as('t', `update fq_members set ideal_weight = 72.5, target_weight = 76 where profile_id = $1`, [U.m])).error, 'trainer sets ideal and target weight');
  const mrow = (await as('m', 'select current_weight, ideal_weight, target_weight from fq_members')).rows[0];
  ok(Number(mrow.ideal_weight) === 72.5 && Number(mrow.target_weight) === 76 && Number(mrow.current_weight) === 88.4, 'member sees current, ideal and target weight');
  ok(!!(await as('t', `update fq_members set ideal_weight = 5 where profile_id = $1`, [U.m])).error, 'ideal weight must be realistic');
  ok(!(await as('m', `select fq_update_my_goal('veg', 75, 'lose', 175)`)).error && (await as('m', 'select height_cm from fq_members')).rows[0].height_cm === 175, 'member sets their height');
  ok(!!(await as('m', `select fq_update_my_goal('veg', 75, 'lose', 40)`)).error, 'height must be realistic');
  ok(!(await as('t', `insert into fq_notices(gym_id, member_id, kind, title) values ($1,$2,'attendance','We missed you')`, [G1, U.m])).error, 'trainer records a missed-you reminder');
  ok((await as('m2', `select * from fq_notices where kind = 'attendance'`)).rows.length === 0, 'missed-you reminder is private');
  ok((await as('t', `select * from fq_weight_logs`)).rows.length >= 1 && (await as('t', `select * from fq_diet_logs`)).rows.length >= 1, 'trainer reads members’ weight and meal history');
}

await checks();
await down(); console.log('rolled back');
await db.exec('delete from auth.users');
await up(); console.log('re-applied');
await checks();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
