// Creates the FitFirm trial gym: owner, trainers, members, a week of veg and non-veg diet, workouts,
// facilities and events, plus two weeks of history so the app looks lived-in on day one.
// Logins are written to .secrets/trial-logins.md (never committed).
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomInt } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const DOMAIN = 'login.fitcheq.inraasolution.com';
const APP_URL = process.env.APP_URL || 'https://fitcheq.inraasolution.com/app/';
const must = async (p) => { const r = await p; if (r.error) throw r.error; return r.data; };

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = new Date(); today.setHours(0, 0, 0, 0);
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => add(d, -((d.getDay() + 6) % 7));
const pass = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 8; i++) s += a[randomInt(a.length)]; return 'Fit-' + s.slice(0, 4) + '-' + s.slice(4); };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- people ----------
const OWNER = { name: 'FitFirm Owner', phone: '9000000001' };
const TRAINERS = [
  { name: 'Priya Raman', phone: '9000000011', t: { speciality: 'Fat loss and nutrition', experience_years: 8, certifications: 'ACE CPT, Precision Nutrition L1', slots: '6–10 am, 5–8 pm', bio: 'Helps members lose fat without crash diets.' } },
  { name: 'Karthik Selvam', phone: '9000000012', t: { speciality: 'Strength and muscle gain', experience_years: 6, certifications: 'NSCA-CPT', slots: '7–11 am, 6–9 pm', bio: 'Powerlifting coach; loves teaching technique.' } },
];
const MEMBERS = [
  { name: 'Arjun Mehta', phone: '9000000101', tr: 0, diet: 'nonveg', goal: 'lose', h: 176, sw: 92.4, cw: 87.1, tw: 80, plan: 'Quarterly', fee: 7500, paid: 40, adh: 0.85 },
  { name: 'Meera Iyer', phone: '9000000102', tr: 1, diet: 'veg', goal: 'gain', h: 162, sw: 52.0, cw: 54.1, tw: 57, plan: 'Monthly', fee: 2800, paid: 3, adh: 0.9 },
  { name: 'Sameer Khan', phone: '9000000103', tr: 0, diet: 'nonveg', goal: 'lose', h: 180, sw: 104.8, cw: 99.0, tw: 90, plan: 'Half-yearly', fee: 13500, paid: 95, adh: 0.72 },
  { name: 'Divya Krishnan', phone: '9000000104', tr: 0, diet: 'veg', goal: 'lose', h: 165, sw: 68.5, cw: 66.2, tw: 62, plan: 'Monthly', fee: 2800, paid: -4, adh: 0.78 },
  { name: 'Rahul Nair', phone: '9000000105', tr: 1, diet: 'veg', goal: 'gain', h: 172, sw: 64.0, cw: 65.8, tw: 70, plan: 'Monthly', fee: 2800, paid: 12, adh: 0.6 },
];

// ---------- diet ----------
const VEG = {
  breakfast: [['Moong dal chilla ×2, mint chutney', 310, 18], ['Vegetable poha with peanuts', 330, 9], ['Ragi dosa ×2, sambar', 340, 11], ['Idli ×3, sambar', 330, 12], ['Oats upma with vegetables', 300, 10], ['Paneer bhurji 80 g, 1 phulka', 380, 22], ['Besan chilla ×2, curd', 320, 16]],
  midmorning: [['Buttermilk, 1 apple', 140, 5], ['Sprouts chaat, 1 cup', 160, 10], ['Greek yogurt 150 g', 140, 14], ['Roasted chana 30 g, green tea', 130, 7], ['Papaya bowl', 110, 2], ['Coconut water, 10 almonds', 130, 4], ['Whey, 1 scoop in water', 120, 24]],
  lunch: [['2 phulka, dal, palak paneer, salad', 560, 26], ['Brown rice, rajma, cucumber salad', 520, 20], ['Millet pongal, sambar, beans poriyal', 480, 15], ['Soya pulao, raita', 500, 30], ['2 phulka, chana masala, salad', 520, 21], ['Curd rice, poriyal, sundal', 470, 16], ['Veg biryani (small), raita', 540, 15]],
  snack: [['Roasted makhana, black coffee', 120, 4], ['Paneer tikka 80 g', 210, 16], ['Chickpea sundal', 180, 9], ['Fruit bowl', 120, 2], ['Peanut chikki (small), tea no sugar', 150, 5], ['Corn chaat', 160, 5], ['Buttermilk, 2 khakhra', 140, 5]],
  dinner: [['2 phulka, mixed dal, bhindi', 430, 16], ['Grilled paneer 100 g, sautéed veg', 400, 24], ['Tofu stir-fry, quinoa', 420, 24], ['Ragi mudde, keerai kootu', 380, 12], ['Vegetable khichdi, curd', 410, 14], ['2 phulka, paneer bhurji, salad', 450, 25], ['Moong dal soup, 1 phulka, salad', 340, 15]],
};
const NONVEG = {
  breakfast: [['Egg-white omelette (4), 2 toast', 320, 24], ['Masala omelette (2 eggs), 1 phulka', 330, 17], ['Idli ×3, sambar, 2 boiled eggs', 400, 22], ['Oats with milk, 2 eggs', 380, 24], ['Egg bhurji, 1 phulka', 340, 18], ['Ragi dosa ×2, egg curry (1)', 380, 18], ['Chicken sandwich, brown bread', 350, 26]],
  midmorning: VEG.midmorning,
  lunch: [['Grilled chicken 150 g, rice, rasam', 560, 42], ['Fish curry, red rice, cabbage thoran', 540, 36], ['Egg curry (2), 2 phulka, salad', 500, 22], ['Chicken biryani (small), raita', 600, 34], ['2 phulka, chicken curry, salad', 540, 38], ['Fish fry (tawa), rice, dal', 560, 34], ['Chicken pulao, cucumber raita', 560, 36]],
  snack: [['Chicken tikka 100 g', 180, 26], ['Boiled eggs ×2', 140, 12], ['Roasted makhana, black coffee', 120, 4], ['Chickpea sundal', 180, 9], ['Tuna salad (small)', 170, 22], ['Fruit bowl', 120, 2], ['Egg white, 2, with pepper', 70, 14]],
  dinner: [['Clear chicken soup, grilled chicken 120 g', 380, 38], ['Tandoori fish 150 g, sautéed greens', 360, 34], ['Egg bhurji (3), 1 phulka', 400, 24], ['2 phulka, chicken keema, salad', 460, 34], ['Grilled chicken salad bowl', 380, 36], ['Fish curry, 1 phulka', 400, 30], ['Chicken stir-fry, quinoa', 430, 36]],
};
const MEALS = ['breakfast', 'midmorning', 'lunch', 'snack', 'dinner'];

// ---------- workouts ----------
const WORKOUTS = [
  { name: 'Full body A', focus: 'Strength', duration_min: 50, exercises: [['Goblet squat', '4 × 10'], ['Dumbbell bench press', '4 × 10'], ['Seated row', '3 × 12'], ['Romanian deadlift', '3 × 10'], ['Plank', '3 × 40 s']] },
  { name: 'HIIT 30 + core', focus: 'Fat loss', duration_min: 30, exercises: [['Air bike sprints', '10 × 20 s'], ['Kettlebell swings', '4 × 15'], ['Burpees', '3 × 10'], ['Dead bug', '3 × 12 each side']] },
  { name: 'Lower body + incline walk', focus: 'Fat loss', duration_min: 55, exercises: [['Leg press', '4 × 12'], ['Walking lunges', '3 × 12 each leg'], ['Leg curl', '3 × 12'], ['Incline walk', '20 min at 10%']] },
  { name: 'Push', focus: 'Muscle gain', duration_min: 60, exercises: [['Bench press', '5 × 5'], ['Shoulder press', '4 × 8'], ['Cable fly', '3 × 12'], ['Assisted dips', '3 × 8']] },
  { name: 'Pull', focus: 'Muscle gain', duration_min: 60, exercises: [['Deadlift', '5 × 5'], ['Lat pulldown', '4 × 10'], ['Chest-supported row', '4 × 10'], ['Hammer curl', '3 × 12']] },
  { name: 'Legs', focus: 'Muscle gain', duration_min: 60, exercises: [['Back squat', '5 × 5'], ['Bulgarian split squat', '3 × 8 each leg'], ['Leg extension', '3 × 12'], ['Calf raise', '4 × 15']] },
  { name: 'Mobility and recovery', focus: 'Recovery', duration_min: 30, exercises: [['Mobility flow', '15 min'], ['Foam rolling', '10 min'], ['Easy cycling', '10 min']] },
];
const SPLIT = { lose: [0, 1, 2, 6, 0, 1, null], gain: [3, 4, 5, null, 3, 4, null] }; // Mon..Sun index into WORKOUTS

async function userFor(name, phone, password) {
  const email = phone + '@' + DOMAIN;
  const list = await must(sb.auth.admin.listUsers({ perPage: 1000 }));
  const old = list.users.find((u) => u.email === email);
  if (old) await must(sb.auth.admin.deleteUser(old.id));
  const r = await must(sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, phone } }));
  return r.user.id;
}

async function main() {
  const old = await must(sb.from('fq_gyms').select('id').eq('name', 'FitFirm'));
  for (const g of old) await must(sb.from('fq_gyms').delete().eq('id', g.id));
  const gym = await must(sb.from('fq_gyms').insert({ name: 'FitFirm', address: 'Add your address in Gym profile', phone: '+91 90000 00001', hours: 'Mon–Sat 5:30 am–10 pm · Sun 6 am–12 pm', about: 'Strength floor, cardio, functional zone and personal training.' }).select().single());
  const G = gym.id, creds = [];

  const ownerPw = pass(), ownerId = await userFor(OWNER.name, OWNER.phone, ownerPw);
  await must(sb.from('fq_profiles').insert({ id: ownerId, gym_id: G, role: 'admin', full_name: OWNER.name, phone: OWNER.phone }));
  creds.push(['Owner (admin)', OWNER.name, OWNER.phone, ownerPw]);

  const trainerIds = [];
  for (const t of TRAINERS) {
    const pw = pass(), id = await userFor(t.name, t.phone, pw); trainerIds.push(id);
    await must(sb.from('fq_profiles').insert({ id, gym_id: G, role: 'trainer', full_name: t.name, phone: t.phone }));
    await must(sb.from('fq_trainers').insert({ profile_id: id, gym_id: G, ...t.t }));
    creds.push(['Trainer', t.name, t.phone, pw]);
  }

  const wk = await must(sb.from('fq_workouts').insert(WORKOUTS.map((w) => ({ gym_id: G, name: w.name, focus: w.focus, duration_min: w.duration_min, exercises: w.exercises.map(([name, sets]) => ({ name, sets })), created_by: trainerIds[0] }))).select());

  // diet plans: last, this and next week, for both diets
  for (const off of [-1, 0, 1]) for (const [type, src] of [['veg', VEG], ['nonveg', NONVEG]]) {
    const plan = await must(sb.from('fq_diet_plans').insert({ gym_id: G, week_start: key(add(monday(today), off * 7)), diet_type: type, created_by: trainerIds[0] }).select().single());
    const rows = [];
    for (let d = 0; d < 7; d++) MEALS.forEach((m) => { const x = src[m][(d + off + 7) % 7]; rows.push({ plan_id: plan.id, gym_id: G, day: d, meal: m, items: x[0], kcal: x[1], protein_g: x[2] }); });
    await must(sb.from('fq_diet_items').insert(rows));
  }

  for (const m of MEMBERS) {
    const pw = pass(), id = await userFor(m.name, m.phone, pw);
    await must(sb.from('fq_profiles').insert({ id, gym_id: G, role: 'member', full_name: m.name, phone: m.phone }));
    await must(sb.from('fq_members').insert({ profile_id: id, gym_id: G, trainer_id: trainerIds[m.tr], diet_type: m.diet, goal: m.goal, height_cm: m.h, start_weight: m.sw, current_weight: m.sw, target_weight: m.tw, plan_name: m.plan, fee_paise: m.fee * 100, joined_on: key(add(today, -42)) }));
    creds.push(['Member', m.name, m.phone, pw]);
    // payments
    const until = add(today, m.paid);
    await must(sb.from('fq_payments').insert({ gym_id: G, member_id: id, amount_paise: m.fee * 100, paid_on: key(add(until, -30)), period_until: key(until), method: 'UPI', recorded_by: ownerId }));
    // weight history, weekly for six weeks, ending today at the current weight
    const ws = [];
    for (let i = 6; i >= 0; i--) { const t = (6 - i) / 6; ws.push({ gym_id: G, member_id: id, on_date: key(add(today, -i * 7)), weight: Math.round((m.sw + (m.cw - m.sw) * t + (i && i < 6 ? (rnd() - 0.5) * 0.6 : 0)) * 10) / 10, recorded_by: trainerIds[m.tr] }); }
    await must(sb.from('fq_weight_logs').insert(ws));
    // diet logs for the last 10 days and this morning
    const logs = [];
    for (let i = 10; i >= 0; i--) MEALS.forEach((meal, j) => { if (i === 0 && j > 0) return; logs.push({ member_id: id, gym_id: G, on_date: key(add(today, -i)), meal, status: rnd() < m.adh ? 'done' : 'skipped' }); });
    await must(sb.from('fq_diet_logs').insert(logs));
    // workouts: last 7 days and next 7 days from the split
    const wa = [];
    for (let i = -7; i <= 7; i++) {
      const d = add(today, i), wi = SPLIT[m.goal][(d.getDay() + 6) % 7]; if (wi == null) continue;
      const w = wk[wi];
      wa.push({ gym_id: G, member_id: id, on_date: key(d), workout_id: w.id, title: w.name, exercises: w.exercises, assigned_by: trainerIds[m.tr], status: i < 0 ? (rnd() < m.adh + 0.05 ? 'done' : 'skipped') : 'assigned' });
    }
    await must(sb.from('fq_workout_assignments').insert(wa));
    if (m.paid < 7) await must(sb.from('fq_notices').insert({ gym_id: G, member_id: id, kind: 'payment', title: m.paid < 0 ? 'Membership payment overdue' : 'Membership payment due', body: 'Please pay ₹' + m.fee.toLocaleString('en-IN') + ' at the desk or by UPI. Thank you!', created_by: ownerId }));
  }

  await must(sb.from('fq_facilities').insert([
    ['Treadmills', 'Cardio', 6, 'ok', 'Incline up to 15%'], ['Air bikes', 'Cardio', 3, 'new', 'Ask a trainer for an intro'], ['Spin bikes', 'Cardio', 10, 'ok', ''], ['Power racks', 'Strength', 3, 'ok', 'With safety arms'],
    ['Dumbbells 2.5–40 kg', 'Strength', 1, 'ok', 'Full rack'], ['Cable crossover', 'Machines', 1, 'maintenance', 'Left cable being replaced'], ['Leg press', 'Machines', 2, 'ok', ''], ['Kettlebells 8–24 kg', 'Functional', 16, 'ok', ''], ['Lockers and showers', 'Amenities', 1, 'ok', 'Bring your own lock'],
  ].map(([name, category, quantity, status, note]) => ({ gym_id: G, name, category, quantity, status, note: note || null }))));
  await must(sb.from('fq_events').insert([
    { gym_id: G, title: 'Sunday bootcamp', starts_on: key(add(today, (7 - today.getDay()) % 7 || 7)), starts_at: '07:00', details: 'Outdoor circuit for all levels. Free for members.', created_by: ownerId },
    { gym_id: G, title: 'Body composition check', starts_on: key(add(today, 9)), starts_at: '09:00', details: 'Free scan with your trainer. Book a slot at the desk.', created_by: ownerId },
    { gym_id: G, title: '30-day transformation challenge', starts_on: key(add(today, 14)), details: 'Top 3 transformations win a free month.', created_by: ownerId },
  ]));
  await must(sb.from('fq_notices').insert({ gym_id: G, kind: 'general', title: 'Welcome to the FitFirm app', body: 'Tick your meals, mark your workouts and log your weight. Your trainer sees it straight away.', created_by: ownerId }));

  mkdirSync(new URL('../.secrets/', import.meta.url), { recursive: true });
  const md = '# FitFirm trial logins\n\nApp: ' + APP_URL + '\nCreated: ' + key(today) + '. Keep this private. Ask users to change their password after first sign-in.\n\n| Role | Name | Mobile | Password |\n| --- | --- | --- | --- |\n' + creds.map((c) => '| ' + c.join(' | ') + ' |').join('\n') + '\n';
  writeFileSync(new URL('../.secrets/trial-logins.md', import.meta.url), md, { mode: 0o600 });
  console.log('Seeded FitFirm: 1 owner, ' + TRAINERS.length + ' trainers, ' + MEMBERS.length + ' members. Logins written to .secrets/trial-logins.md');
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
