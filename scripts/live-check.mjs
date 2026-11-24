// End-to-end check of the deployed admin function on the live project, signed in as the trial owner
// through an admin-issued sign-in link (no password involved). Creates a throwaway trainer, renames them,
// changes their number, checks trial logins are protected, then removes the trainer and verifies cleanup.
//   node scripts/live-check.mjs        (reads keys from .secrets/keys.json)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const URL_ = 'https://yyrxjsqhmfoncunjurga.supabase.co', DOMAIN = 'login.fitcheq.inraasolution.com';
const keys = JSON.parse(readFileSync(new URL('../.secrets/keys.json', import.meta.url), 'utf8'));
const k = (n) => keys.find((x) => x.name === n).api_key;
const admin = createClient(URL_, k('service_role'), { auth: { persistSession: false } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

async function sessionFor(phone) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: phone + '@' + DOMAIN });
  if (error) throw error;
  const c = createClient(URL_, k('anon'), { auth: { persistSession: false } });
  const v = await c.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (v.error) throw v.error;
  return c;
}
const call = async (c, body) => { const { data, error } = await c.functions.invoke('fitcheq-admin-users', { body }); if (error) { try { return await error.context.json(); } catch { return { error: error.message }; } } return data; };

const owner = await sessionFor('9000000001');
const trainerC = await sessionFor('9000000011');
const P1 = '9999900001', P2 = '9999900002';
// clean any leftover from an earlier run
for (const p of [P1, P2]) { const { data } = await admin.from('fq_profiles').select('id').eq('phone', p).maybeSingle(); if (data) await admin.auth.admin.deleteUser(data.id); }

const made = await call(owner, { action: 'create_user', role: 'trainer', full_name: 'Live Check Trainer', phone: P1, password: 'Tmp-' + Math.random().toString(36).slice(2, 10), trainer: { speciality: 'Test' } });
ok(!!made.id, 'owner creates a trainer');
const r1 = await call(owner, { action: 'update_user', user_id: made.id, full_name: 'Live Check Renamed', phone: P2 });
const prof = (await admin.from('fq_profiles').select('full_name, phone').eq('id', made.id).single()).data;
const au = (await admin.auth.admin.getUserById(made.id)).data.user;
ok(r1.ok && prof.full_name === 'Live Check Renamed' && prof.phone === P2 && au.email === P2 + '@' + DOMAIN, 'owner renames the trainer and changes their mobile number (login updated)');
const dup = await call(owner, { action: 'update_user', user_id: made.id, full_name: 'x', phone: '9000000012' });
ok(/already has a login/.test(dup.error || ''), 'a number already in use is refused');
const tr = (await admin.from('fq_profiles').select('id').eq('phone', '9000000011').single()).data.id;
ok(/Trial logins/.test((await call(owner, { action: 'update_user', user_id: tr, full_name: 'Priya Raman', phone: '9999900003' })).error || ''), 'trial trainer’s number is protected');
ok(/Trial logins/.test((await call(owner, { action: 'remove_user', user_id: tr })).error || ''), 'trial trainer can’t be removed');
ok(/Only the gym owner/.test((await call(trainerC, { action: 'remove_user', user_id: made.id })).error || ''), 'a trainer cannot remove anyone');
const own = (await admin.from('fq_profiles').select('id').eq('phone', '9000000001').single()).data.id;
ok(/cannot remove yourself/.test((await call(owner, { action: 'remove_user', user_id: own })).error || ''), 'owner cannot remove themselves');
const rm = await call(owner, { action: 'remove_user', user_id: made.id });
const gone = !(await admin.from('fq_profiles').select('id').eq('id', made.id).maybeSingle()).data && !(await admin.from('fq_trainers').select('profile_id').eq('profile_id', made.id).maybeSingle()).data;
const authGone = (await admin.auth.admin.getUserById(made.id)).error != null;
ok(rm.ok && gone && authGone, 'owner removes the trainer; login, profile and details are gone');
// ---------- owner adds and removes a member ----------
{
  const P3 = '9999900004';
  const old = (await admin.from('fq_profiles').select('id').eq('phone', P3).maybeSingle()).data; if (old) await admin.auth.admin.deleteUser(old.id);
  const plan = (await admin.from('fq_fee_plans').select('id, name, fee_paise').eq('name', 'Monthly').limit(1).single()).data;
  const mm = await call(owner, { action: 'create_user', role: 'member', full_name: 'Live Check Member', phone: P3, password: 'Tmp-' + Math.random().toString(36).slice(2, 10), member: { trainer_id: tr, diet_type: 'veg', goal: 'lose', start_weight: 80, target_weight: 72, height_cm: 170, fee_plan_id: plan.id, plan_name: plan.name, fee_rupees: plan.fee_paise / 100 } });
  const row = mm.id ? (await admin.from('fq_members').select('fee_plan_id, trainer_id, current_weight').eq('profile_id', mm.id).single()).data : null;
  ok(!!row && row.fee_plan_id === plan.id && row.trainer_id === tr && Number(row.current_weight) === 80, 'owner adds a member on a fee plan with a trainer');
  const rmm = await call(owner, { action: 'remove_user', user_id: mm.id });
  ok(rmm.ok && !(await admin.from('fq_members').select('profile_id').eq('profile_id', mm.id).maybeSingle()).data && !(await admin.from('fq_weight_logs').select('id').eq('member_id', mm.id)).data.length, 'owner removes the member; their data goes too');
}

// ---------- the same calls the trainer and member screens make, on a date far ahead, cleaned up after ----------
const memberC = await sessionFor('9000000101');
const arj = (await admin.from('fq_profiles').select('id, gym_id').eq('phone', '9000000101').single()).data;
const D = '2027-06-30', G = arj.gym_id, q = async (p) => { const r = await p; if (r.error) throw r.error; return r.data; };
try {
  await q(trainerC.from('fq_member_meals').upsert([{ gym_id: G, member_id: arj.id, on_date: D, meal: 'breakfast', items: 'Live check oats', kcal: 300, protein_g: 12 }, { gym_id: G, member_id: arj.id, on_date: D, meal: 'lunch', items: 'Live check rice', kcal: 500 }], { onConflict: 'member_id,on_date,meal' }));
  await q(trainerC.from('fq_member_meals').upsert({ gym_id: G, member_id: arj.id, on_date: D, meal: 'breakfast', items: 'Live check oats, changed' }, { onConflict: 'member_id,on_date,meal' }));
  const wa = await q(trainerC.from('fq_workout_assignments').insert({ gym_id: G, member_id: arj.id, on_date: D, title: 'Live check push', exercises: [{ name: 'Bench', sets: '3 x 8' }] }).select('id').single());
  await q(trainerC.from('fq_workout_assignments').update({ title: 'Live check pull' }).eq('id', wa.id));
  const ids = (await q(trainerC.from('fq_members').select('profile_id'))).map((r) => r.profile_id);
  const seen = await q(trainerC.from('fq_member_meals').select('member_id, on_date').in('member_id', ids).gte('on_date', D).lte('on_date', D));
  ok(seen.length === 2, 'trainer plans a member’s day (meals and workout) and changes it');
  const mm = await q(memberC.from('fq_member_meals').select('*').eq('member_id', arj.id).gte('on_date', D).lte('on_date', D));
  const mw = await q(memberC.from('fq_workout_assignments').select('*').eq('member_id', arj.id).eq('on_date', D));
  ok(mm.length === 2 && mm.find((x) => x.meal === 'breakfast').items === 'Live check oats, changed' && mw[0].title === 'Live check pull', 'member sees exactly what the trainer set');
  await q(memberC.from('fq_diet_logs').upsert({ member_id: arj.id, gym_id: G, on_date: D, meal: 'lunch', status: 'skipped' }));
  await q(memberC.rpc('fq_mark_my_workout', { p_id: wa.id, p_status: 'done' }));
  const tl = await q(trainerC.from('fq_diet_logs').select('status').eq('member_id', arj.id).eq('on_date', D));
  const tw = await q(trainerC.from('fq_workout_assignments').select('status').eq('id', wa.id).single());
  ok(tl[0].status === 'skipped' && tw.status === 'done', 'trainer sees the member’s skipped meal and done workout');
  const before = await q(memberC.from('fq_members').select('height_cm, target_weight, diet_type, goal').eq('profile_id', arj.id).single());
  await q(memberC.rpc('fq_update_my_goal', { p_diet_type: before.diet_type, p_target_weight: 79.5, p_goal: before.goal, p_height_cm: 177 }));
  const after = await q(trainerC.from('fq_members').select('height_cm, target_weight').eq('profile_id', arj.id).single());
  ok(after.height_cm === 177 && Number(after.target_weight) === 79.5, 'member’s height and target reach the trainer');
  await q(memberC.rpc('fq_update_my_goal', { p_diet_type: before.diet_type, p_target_weight: before.target_weight, p_goal: before.goal, p_height_cm: before.height_cm }));
  ok((await q(memberC.from('fq_fee_plans').select('*').eq('active', true))).length >= 1, 'member reads the gym’s fee plans');
  const n = await q(trainerC.from('fq_notices').insert({ gym_id: G, member_id: arj.id, kind: 'attendance', title: 'Live check missed you', body: 'test' }).select('id').single());
  ok((await q(memberC.from('fq_notices').select('id').eq('id', n.id))).length === 1, 'missed-you reminder shows in the member’s app');
  await admin.from('fq_notices').delete().eq('id', n.id);
} catch (e) { ok(false, 'app calls: ' + e.message); }
finally {
  await admin.from('fq_member_meals').delete().eq('member_id', arj.id).eq('on_date', D);
  await admin.from('fq_workout_assignments').delete().eq('member_id', arj.id).eq('on_date', D);
  await admin.from('fq_diet_logs').delete().eq('member_id', arj.id).eq('on_date', D);
  await admin.from('fq_notices').delete().like('title', 'Live check%');
}
// ---------- the performance and business screens' reads ----------
try {
  const t = new Date(), from = new Date(t); from.setDate(t.getDate() - 29);
  const k = (d) => d.toISOString().slice(0, 10);
  for (const [who, c] of [['owner', owner], ['trainer', trainerC]]) {
    const r = await Promise.all([
      c.from('fq_workout_assignments').select('member_id, on_date, status, assigned_by, created_at').gte('on_date', k(from)).lte('on_date', k(t)),
      c.from('fq_diet_logs').select('member_id, on_date, status').gte('on_date', k(from)),
      c.from('fq_weight_logs').select('member_id, on_date, weight').order('on_date'),
      c.from('fq_notices').select('member_id, created_by, created_at').eq('kind', 'attendance'),
      c.from('fq_member_meals').select('member_id, on_date, updated_by, updated_at').gte('on_date', k(from)),
    ]);
    const err = r.find((x) => x.error);
    ok(!err && r[0].data.length > 0 && r[4].data.length > 0 && r[4].data.every((x) => x.updated_by), who + ' reads everything the performance screens need (' + r[0].data.length + ' workouts, ' + r[4].data.length + ' planned meals, all with a trainer)');
  }
  const op = await owner.from('fq_payments').select('amount_paise, paid_on');
  const tp = await trainerC.from('fq_payments').select('amount_paise');
  ok(!op.error && op.data.length >= 5 && !tp.error && tp.data.length === 0, 'owner sees fee collections; trainers see none');
} catch (e) { ok(false, 'performance reads: ' + e.message); }

const left = (await admin.from('fq_member_meals').select('id').like('items', 'Live check%')).data.length + (await admin.from('fq_workout_assignments').select('id').like('title', 'Live check%')).data.length;
ok(left === 0, 'test rows cleaned up');
console.log(fails ? '\n' + fails + ' check(s) failed' : '\nAll live checks passed');
process.exit(fails ? 1 : 0);
