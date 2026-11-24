// One-off data step for v2 on an existing gym (default: Prozone). Safe to run more than once:
//  - opening hours (only if none are set yet) and the hours text members see
//  - fee plans Monthly / Quarterly / Half-yearly / Annual (only if the gym has none) and links members by plan name
//  - each member's own meals from 10 days ago to 7 days ahead, copied from the gym's diet templates
//    for their veg / non-veg choice; days that already have meals are left alone
//   node scripts/upgrade-v2.mjs [gym name]      (reads keys from .secrets/keys.json)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const keys = JSON.parse(readFileSync(new URL('../.secrets/keys.json', import.meta.url), 'utf8'));
const sb = createClient('https://yyrxjsqhmfoncunjurga.supabase.co', keys.find((x) => x.name === 'service_role').api_key, { auth: { persistSession: false } });
const must = async (p) => { const r = await p; if (r.error) throw r.error; return r.data; };
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = new Date(); T.setHours(0, 0, 0, 0);
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => add(d, -((d.getDay() + 6) % 7));
const dayIdx = (d) => (d.getDay() + 6) % 7;
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const t12 = (hm) => { let [h, m] = hm.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ' ' + ap; };
const dayHours = (s) => (s.closed || !s.slots.length ? 'Closed' : s.slots.map(([a, b]) => t12(a) + '–' + t12(b)).join(', '));
const summary = (sc) => { const out = []; let i = 0; while (i < 7) { let j = i; while (j + 1 < 7 && dayHours(sc[j + 1]) === dayHours(sc[i])) j++; out.push((i === j ? WD[i] : WD[i] + '–' + WD[j]) + ' ' + dayHours(sc[i])); i = j + 1; } return out.join(' · '); };

const gym = await must(sb.from('fq_gyms').select('*').eq('name', process.argv[2] || 'Prozone').single());
const G = gym.id;

if (!Array.isArray(gym.schedule) || gym.schedule.length !== 7) {
  const sc = WD.map((_, i) => (i === 6 ? { closed: false, slots: [['06:00', '12:00']] } : { closed: false, slots: [['05:30', '10:30'], ['16:00', '22:00']] }));
  await must(sb.from('fq_gyms').update({ schedule: sc, hours: summary(sc) }).eq('id', G));
  console.log('Opening hours set: ' + summary(sc));
}

let plans = await must(sb.from('fq_fee_plans').select('*').eq('gym_id', G));
if (!plans.length) {
  plans = await must(sb.from('fq_fee_plans').insert([['Monthly', 1, 2800, 'Gym floor and trainer guidance'], ['Quarterly', 3, 7500, 'Save ₹900'], ['Half-yearly', 6, 13500, 'Save ₹3,300'], ['Annual', 12, 24000, 'Save ₹9,600 · 1 diet consult a month']]
    .map(([name, months, fee, details]) => ({ gym_id: G, name, months, fee_paise: fee * 100, details }))).select());
  console.log('Fee plans added: ' + plans.map((p) => p.name).join(', '));
}
const members = await must(sb.from('fq_members').select('profile_id, plan_name, fee_plan_id, diet_type, goal').eq('gym_id', G));
for (const m of members) {
  const p = plans.find((x) => x.name === m.plan_name);
  if (p && !m.fee_plan_id) await must(sb.from('fq_members').update({ fee_plan_id: p.id }).eq('profile_id', m.profile_id));
}

const templates = await must(sb.from('fq_diet_plans').select('week_start, diet_type, fq_diet_items(day, meal, items, kcal, protein_g)').eq('gym_id', G).order('week_start', { ascending: false }));
const pick = (type, d) => { const ws = key(monday(d)), ps = templates.filter((p) => p.diet_type === type && p.fq_diet_items.length); return ps.find((p) => p.week_start === ws) || ps.find((p) => p.week_start <= ws) || ps[0]; };
const from = add(T, -10), to = add(T, 7);
let added = 0;
for (const m of members) {
  const have = new Set((await must(sb.from('fq_member_meals').select('on_date').eq('member_id', m.profile_id).gte('on_date', key(from)).lte('on_date', key(to)))).map((r) => r.on_date));
  const rows = [];
  for (let d = new Date(from); d <= to; d = add(d, 1)) {
    if (have.has(key(d))) continue;
    const p = pick(m.diet_type, d); if (!p) continue;
    p.fq_diet_items.filter((x) => x.day === dayIdx(d)).forEach((x) => {
      const bulk = m.goal === 'gain' && x.meal === 'snack';
      rows.push({ gym_id: G, member_id: m.profile_id, on_date: key(d), meal: x.meal, items: bulk ? x.items + ', 1 banana' : x.items, kcal: x.kcal != null ? x.kcal + (bulk ? 90 : 0) : null, protein_g: x.protein_g != null ? x.protein_g + (bulk ? 1 : 0) : null });
    });
  }
  if (rows.length) { await must(sb.from('fq_member_meals').insert(rows)); added += rows.length; }
}
console.log('Member meals added: ' + added + ' for ' + members.length + ' members (' + key(from) + ' to ' + key(to) + ')');

// sample trial members (90000001xx) also get their usual weekly split for the coming week where no workout is planned
const SPLIT = { lose: ['Full body A', 'HIIT 30 + core', 'Lower body + incline walk', 'Mobility and recovery', 'Full body A', 'HIIT 30 + core', null], gain: ['Push', 'Pull', 'Legs', null, 'Push', 'Pull', null] };
const lib = await must(sb.from('fq_workouts').select('id, name, exercises').eq('gym_id', G));
const sample = await must(sb.from('fq_members').select('profile_id, goal, trainer_id, fq_profiles!fq_members_profile_id_fkey(phone)').eq('gym_id', G));
let wadded = 0;
for (const m of sample.filter((x) => /^90000001\d\d$/.test((x.fq_profiles || {}).phone || ''))) {
  const have = new Set((await must(sb.from('fq_workout_assignments').select('on_date').eq('member_id', m.profile_id).gte('on_date', key(T)).lte('on_date', key(to)))).map((r) => r.on_date));
  const rows = [];
  for (let d = new Date(T); d <= to; d = add(d, 1)) {
    if (have.has(key(d))) continue;
    const w = lib.find((x) => x.name === (SPLIT[m.goal] || SPLIT.lose)[dayIdx(d)]); if (!w) continue;
    rows.push({ gym_id: G, member_id: m.profile_id, on_date: key(d), workout_id: w.id, title: w.name, exercises: w.exercises, assigned_by: m.trainer_id });
  }
  if (rows.length) { await must(sb.from('fq_workout_assignments').insert(rows)); wadded += rows.length; }
}
console.log('Workouts added for sample members: ' + wadded);
