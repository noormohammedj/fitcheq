/* Fitcheq preview mode: an in-browser stand-in for Supabase with sample Prozone data, so anyone can look
   around as the owner, a trainer or a member without signing in. Nothing leaves the browser.
   Turned on only by opening the app with #preview=owner, #preview=trainer or #preview=member. */
(function () {
  // only a preview link (…/#preview=owner) turns this on; the normal sign-in page is never affected
  const role = (location.hash.match(/preview=(owner|trainer|member)/) || [])[1];
  if (!role) return;
  window.FQ_PREVIEW = role;

  // ---------- sample data (same shape as the database) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const T = new Date(); T.setHours(0, 0, 0, 0);
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = (d) => add(d, -((d.getDay() + 6) % 7));
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let n = 0; const uid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const G = uid();
  const db = { fq_gyms: [], fq_profiles: [], fq_trainers: [], fq_members: [], fq_payments: [], fq_notices: [], fq_events: [], fq_facilities: [], fq_workouts: [], fq_workout_assignments: [], fq_diet_plans: [], fq_diet_items: [], fq_diet_logs: [], fq_weight_logs: [], fq_fee_plans: [], fq_member_meals: [] };
  db.fq_gyms.push({ id: G, name: 'Prozone', address: 'Dindigul, Tamil Nadu', phone: '+91 90000 00001', hours: '', schedule: [0, 1, 2, 3, 4, 5, 6].map((i) => (i === 6 ? { closed: false, slots: [['06:00', '12:00']] } : { closed: false, slots: [['05:30', '10:30'], ['16:00', '22:00']] })), about: 'Strength floor, cardio, functional zone and personal training.' });
  const FEES = [['Monthly', 1, 2800, 'Gym floor and trainer guidance'], ['Quarterly', 3, 7500, 'Save ₹900'], ['Half-yearly', 6, 13500, 'Save ₹3,300'], ['Annual', 12, 24000, 'Save ₹9,600 · 1 diet consult a month']]
    .map(([name, months, fee, details]) => { const f = { id: uid(), gym_id: G, name, months, fee_paise: fee * 100, details, active: true }; db.fq_fee_plans.push(f); return f; });
  const prof = (role, full_name, phone) => { const p = { id: uid(), gym_id: G, role, full_name, phone, active: true, created_at: new Date().toISOString() }; db.fq_profiles.push(p); return p; };
  const owner = prof('admin', 'Prozone Owner', '9000000001');
  const trs = [['Priya Raman', '9000000011', 'Fat loss and nutrition', 8, 'ACE CPT, Precision Nutrition L1', '6–10 am, 5–8 pm'], ['Karthik Selvam', '9000000012', 'Strength and muscle gain', 6, 'NSCA-CPT', '7–11 am, 6–9 pm']].map((t) => {
    const p = prof('trainer', t[0], t[1]); db.fq_trainers.push({ profile_id: p.id, gym_id: G, speciality: t[2], experience_years: t[3], certifications: t[4], slots: t[5], bio: null }); return p;
  });
  const V = {
    breakfast: ['Moong dal chilla ×2, mint chutney|310', 'Vegetable poha with peanuts|330', 'Ragi dosa ×2, sambar|340', 'Idli ×3, sambar|330', 'Oats upma with vegetables|300', 'Paneer bhurji 80 g, 1 phulka|380', 'Besan chilla ×2, curd|320'],
    midmorning: ['Buttermilk, 1 apple|140', 'Sprouts chaat, 1 cup|160', 'Greek yogurt 150 g|140', 'Roasted chana 30 g, green tea|130', 'Papaya bowl|110', 'Coconut water, 10 almonds|130', 'Whey, 1 scoop in water|120'],
    lunch: ['2 phulka, dal, palak paneer, salad|560', 'Brown rice, rajma, cucumber salad|520', 'Millet pongal, sambar, beans poriyal|480', 'Soya pulao, raita|500', '2 phulka, chana masala, salad|520', 'Curd rice, poriyal, sundal|470', 'Veg biryani (small), raita|540'],
    snack: ['Roasted makhana, black coffee|120', 'Paneer tikka 80 g|210', 'Chickpea sundal|180', 'Fruit bowl|120', 'Peanut chikki (small), tea|150', 'Corn chaat|160', 'Buttermilk, 2 khakhra|140'],
    dinner: ['2 phulka, mixed dal, bhindi|430', 'Grilled paneer 100 g, sautéed veg|400', 'Tofu stir-fry, quinoa|420', 'Ragi mudde, keerai kootu|380', 'Vegetable khichdi, curd|410', '2 phulka, paneer bhurji, salad|450', 'Moong dal soup, 1 phulka, salad|340'],
  };
  const NV = { ...V,
    breakfast: ['Egg-white omelette (4), 2 toast|320', 'Masala omelette (2 eggs), 1 phulka|330', 'Idli ×3, sambar, 2 boiled eggs|400', 'Oats with milk, 2 eggs|380', 'Egg bhurji, 1 phulka|340', 'Ragi dosa ×2, egg curry|380', 'Chicken sandwich, brown bread|350'],
    lunch: ['Grilled chicken 150 g, rice, rasam|560', 'Fish curry, red rice, cabbage thoran|540', 'Egg curry (2), 2 phulka, salad|500', 'Chicken biryani (small), raita|600', '2 phulka, chicken curry, salad|540', 'Fish fry (tawa), rice, dal|560', 'Chicken pulao, cucumber raita|560'],
    dinner: ['Clear chicken soup, grilled chicken 120 g|380', 'Tandoori fish 150 g, greens|360', 'Egg bhurji (3), 1 phulka|400', '2 phulka, chicken keema, salad|460', 'Grilled chicken salad bowl|380', 'Fish curry, 1 phulka|400', 'Chicken stir-fry, quinoa|430'],
  };
  const MEALS = ['breakfast', 'midmorning', 'lunch', 'snack', 'dinner'];
  for (const off of [-1, 0, 1]) for (const [type, src] of [['veg', V], ['nonveg', NV]]) {
    const plan = { id: uid(), gym_id: G, week_start: key(add(monday(T), off * 7)), diet_type: type, created_by: trs[0].id, updated_at: new Date().toISOString() };
    db.fq_diet_plans.push(plan);
    for (let d = 0; d < 7; d++) MEALS.forEach((meal) => { const [items, kcal] = src[meal][(d + off + 7) % 7].split('|'); db.fq_diet_items.push({ id: uid(), plan_id: plan.id, gym_id: G, day: d, meal, items, kcal: +kcal, protein_g: null }); });
  }
  const W = [['Full body A', 'Strength', 50, 'Goblet squat|4 × 10;Dumbbell bench press|4 × 10;Seated row|3 × 12;Romanian deadlift|3 × 10;Plank|3 × 40 s'], ['HIIT 30 + core', 'Fat loss', 30, 'Air bike sprints|10 × 20 s;Kettlebell swings|4 × 15;Burpees|3 × 10;Dead bug|3 × 12 each side'],
    ['Lower body + incline walk', 'Fat loss', 55, 'Leg press|4 × 12;Walking lunges|3 × 12 each leg;Leg curl|3 × 12;Incline walk|20 min at 10%'], ['Push', 'Muscle gain', 60, 'Bench press|5 × 5;Shoulder press|4 × 8;Cable fly|3 × 12;Assisted dips|3 × 8'],
    ['Pull', 'Muscle gain', 60, 'Deadlift|5 × 5;Lat pulldown|4 × 10;Chest-supported row|4 × 10;Hammer curl|3 × 12'], ['Legs', 'Muscle gain', 60, 'Back squat|5 × 5;Bulgarian split squat|3 × 8 each leg;Leg extension|3 × 12;Calf raise|4 × 15'],
    ['Mobility and recovery', 'Recovery', 30, 'Mobility flow|15 min;Foam rolling|10 min;Easy cycling|10 min']].map(([name, focus, duration_min, ex]) => {
    const w = { id: uid(), gym_id: G, name, focus, duration_min, exercises: ex.split(';').map((s) => { const [a, b] = s.split('|'); return { name: a, sets: b }; }), created_by: trs[0].id, created_at: new Date().toISOString() }; db.fq_workouts.push(w); return w;
  });
  const SPLIT = { lose: [0, 1, 2, 6, 0, 1, null], gain: [3, 4, 5, null, 3, 4, null] };
  const mems = [['Arjun Mehta', '9000000101', 0, 'nonveg', 'lose', 176, 92.4, 87.1, 80, 'Quarterly', 7500, 40, 0.85], ['Meera Iyer', '9000000102', 1, 'veg', 'gain', 162, 52.0, 54.1, 57, 'Monthly', 2800, 3, 0.9],
    ['Sameer Khan', '9000000103', 0, 'nonveg', 'lose', 180, 104.8, 99.0, 90, 'Half-yearly', 13500, 95, 0.72], ['Divya Krishnan', '9000000104', 0, 'veg', 'lose', 165, 68.5, 66.2, 62, 'Monthly', 2800, -4, 0.78], ['Rahul Nair', '9000000105', 1, 'veg', 'gain', 172, 64.0, 65.8, 70, 'Monthly', 2800, 12, 0.6]];
  const memberProfiles = mems.map(([name, phone, tr, diet, goal, h, sw, cw, tw, plan, fee, paid, adh]) => {
    const p = prof('member', name, phone), until = add(T, paid);
    db.fq_members.push({ profile_id: p.id, gym_id: G, trainer_id: trs[tr].id, diet_type: diet, goal, height_cm: h, start_weight: sw, current_weight: cw, target_weight: tw, plan_name: plan, fee_plan_id: (FEES.find((f) => f.name === plan) || {}).id || null, ideal_weight: null, fee_paise: fee * 100, paid_until: key(until), joined_on: key(add(T, name.startsWith('Rahul') ? -10 : -42)) });
    // their own meals: last 10 days and the coming week (Rahul's coming week is left empty on purpose)
    const src = diet === 'veg' ? V : NV;
    for (let i = -10; i <= (name.startsWith('Rahul') ? 0 : 6); i++) { const d = add(T, i), di = (d.getDay() + 6) % 7; MEALS.forEach((meal) => { const [items, kcal] = src[meal][(di + mems.length) % 7].split('|'); db.fq_member_meals.push({ id: uid(), gym_id: G, member_id: p.id, updated_by: trs[tr].id, updated_at: add(T, Math.min(i, 0) - 1 - tr).toISOString(), on_date: key(d), meal, items: goal === 'gain' && meal === 'snack' ? items + ', 1 banana' : items, kcal: +kcal + (goal === 'gain' && meal === 'snack' ? 90 : 0), protein_g: null }); }); }
    const months = { Monthly: 1, Quarterly: 3, 'Half-yearly': 6 }[plan] || 1;
    for (let k = 0; k < 6; k += months) { const pe = new Date(until); pe.setMonth(pe.getMonth() - k); const pd = name.startsWith('Rahul') ? add(T, -10) : new Date(pe); if (!name.startsWith('Rahul')) pd.setMonth(pd.getMonth() - months); else if (k) continue; if (pd < add(T, -190) || pd > T) continue;
      db.fq_payments.push({ id: uid(), gym_id: G, member_id: p.id, amount_paise: fee * 100, paid_on: key(pd), period_until: key(pe), method: k % 2 ? 'Cash' : 'UPI', note: null, recorded_by: owner.id, created_at: pd.toISOString() }); }
    for (let i = 6; i >= 0; i--) { const t = (6 - i) / 6; db.fq_weight_logs.push({ id: uid(), gym_id: G, member_id: p.id, on_date: key(add(T, -i * 7)), weight: Math.round((sw + (cw - sw) * t + (i && i < 6 ? (rnd() - 0.5) * 0.6 : 0)) * 10) / 10 }); }
    for (let i = 10; i >= 1; i--) MEALS.forEach((meal) => db.fq_diet_logs.push({ member_id: p.id, gym_id: G, on_date: key(add(T, -i)), meal, status: rnd() < adh ? 'done' : 'skipped' }));
    for (let i = -7; i <= 7; i++) { const d = add(T, i), wi = SPLIT[goal][(d.getDay() + 6) % 7]; if (wi == null) continue; const w = db.fq_workouts[wi];
      db.fq_workout_assignments.push({ id: uid(), gym_id: G, member_id: p.id, on_date: key(d), workout_id: w.id, title: w.name, exercises: w.exercises, note: null, assigned_by: trs[tr].id, status: i < 0 ? (rnd() < adh + 0.05 ? 'done' : 'skipped') : i === 0 && name.startsWith('Divya') ? 'done' : 'assigned', created_at: new Date().toISOString() }); }
    if (paid < 7) db.fq_notices.push({ id: uid(), gym_id: G, member_id: p.id, kind: 'payment', title: paid < 0 ? 'Membership payment overdue' : 'Membership payment due', body: 'Please pay ₹' + fee.toLocaleString('en-IN') + ' at the desk or by UPI. Thank you!', created_by: owner.id, created_at: new Date().toISOString() });
    return p;
  });
  [['Treadmills', 'Cardio', 6, 'ok', 'Incline up to 15%'], ['Air bikes', 'Cardio', 3, 'new', 'Ask a trainer for an intro'], ['Spin bikes', 'Cardio', 10, 'ok', null], ['Power racks', 'Strength', 3, 'ok', 'With safety arms'], ['Dumbbells 2.5–40 kg', 'Strength', 1, 'ok', 'Full rack'], ['Cable crossover', 'Machines', 1, 'maintenance', 'Left cable being replaced'], ['Leg press', 'Machines', 2, 'ok', null], ['Kettlebells 8–24 kg', 'Functional', 16, 'ok', null], ['Lockers and showers', 'Amenities', 1, 'ok', 'Bring your own lock']]
    .forEach(([name, category, quantity, status, note]) => db.fq_facilities.push({ id: uid(), gym_id: G, name, category, quantity, status, note }));
  [['Sunday bootcamp', (7 - T.getDay()) % 7 || 7, '07:00', 'Outdoor circuit for all levels. Free for members.'], ['Body composition check', 9, '09:00', 'Free scan with your trainer. Book a slot at the desk.'], ['30-day transformation challenge', 14, null, 'Top 3 transformations win a free month.']]
    .forEach(([title, d, t, details]) => db.fq_events.push({ id: uid(), gym_id: G, title, starts_on: key(add(T, d)), starts_at: t, details, created_by: owner.id, created_at: new Date().toISOString() }));
  db.fq_notices.push({ id: uid(), gym_id: G, member_id: null, kind: 'general', title: 'Welcome to the Prozone app', body: 'Tick your meals, mark your workouts and log your weight. Your trainer sees it straight away.', created_by: owner.id, created_at: new Date().toISOString() });

  db.fq_notices.push({ id: uid(), gym_id: G, member_id: memberProfiles[0].id, kind: 'attendance', title: 'We missed you', body: 'Hi Arjun, we missed you at Prozone. See you tomorrow! – Priya', created_by: trs[0].id, created_at: add(T, -1).toISOString() });
  const me = role === 'owner' ? owner : role === 'trainer' ? trs[0] : memberProfiles[0];

  // ---------- a small query engine with the same API the app uses ----------
  const PK = { fq_members: 'profile_id', fq_trainers: 'profile_id', fq_diet_logs: ['member_id', 'on_date', 'meal'] };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function visible(table, rows) {
    if (role !== 'member') return rows;
    if (table === 'fq_members') return rows.filter((r) => r.profile_id === me.id);
    if (table === 'fq_profiles') return rows.filter((r) => r.role !== 'member' || r.id === me.id);
    if (table === 'fq_notices') return rows.filter((r) => !r.member_id || r.member_id === me.id);
    if (['fq_payments', 'fq_diet_logs', 'fq_weight_logs', 'fq_workout_assignments', 'fq_member_meals'].includes(table)) return rows.filter((r) => r.member_id === me.id);
    return rows;
  }
  function embed(table, row, part) {
    const m2 = part.match(/^(\w+)\((.*)\)$/); if (!m2) return;
    const [, child, cols] = m2;
    const pick = (r) => (cols.trim() === '*' ? clone(r) : Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, r[c]])));
    if (child === 'fq_trainers') { const t = db.fq_trainers.find((x) => x.profile_id === row.id); row.fq_trainers = t ? pick(t) : null; }
    if (child === 'fq_diet_items') row.fq_diet_items = db.fq_diet_items.filter((x) => x.plan_id === row.id).map(pick);
  }
  function afterWrite(table, row) {
    if (table === 'fq_weight_logs') { const m3 = db.fq_members.find((x) => x.profile_id === row.member_id); const latest = db.fq_weight_logs.filter((x) => x.member_id === row.member_id).sort((a, b) => b.on_date.localeCompare(a.on_date))[0]; if (m3 && latest) m3.current_weight = latest.weight; }
    if (table === 'fq_payments') { const m3 = db.fq_members.find((x) => x.profile_id === row.member_id); if (m3 && (!m3.paid_until || m3.paid_until < row.period_until)) m3.paid_until = row.period_until; }
  }
  class Q {
    constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.ord = []; this.lim = null; this.one = null; this.cols = '*'; this.wantRows = false; }
    select(c) { if (this.op === 'select') this.cols = c || '*'; else this.wantRows = true; return this; }
    insert(r) { this.op = 'insert'; this.data = r; return this; }
    upsert(r, o) { this.op = 'upsert'; this.data = r; this.conf = o && o.onConflict ? o.onConflict.split(',') : null; return this; }
    update(r) { this.op = 'update'; this.data = r; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push((r) => String(r[c]) === String(v)); return this; }
    in(c, v) { this.f.push((r) => v.map(String).includes(String(r[c]))); return this; }
    gte(c, v) { this.f.push((r) => r[c] >= v); return this; }
    lte(c, v) { this.f.push((r) => r[c] <= v); return this; }
    order(c, o) { this.ord.push([c, !o || o.ascending !== false]); return this; }
    limit(n2) { this.lim = n2; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
    run() {
      const tbl = db[this.t]; let out = [];
      if (this.op === 'select') {
        out = visible(this.t, tbl).filter((r) => this.f.every((fn) => fn(r))).map(clone);
        this.ord.slice().reverse().forEach(([c, asc]) => out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)));
        if (this.lim != null) out = out.slice(0, this.lim);
        this.cols.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => s.includes('(')).forEach((part) => out.forEach((r) => embed(this.t, r, part)));
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const rows = (Array.isArray(this.data) ? this.data : [this.data]).map((r) => ({ id: r.id || uid(), created_at: new Date().toISOString(), ...clone(r) }));
        const keys = this.conf || [].concat(PK[this.t] || ['id']);
        rows.forEach((r) => {
          const i = this.op === 'upsert' ? tbl.findIndex((x) => keys.every((k) => String(x[k]) === String(r[k]))) : -1;
          if (i >= 0) tbl[i] = { ...tbl[i], ...r, id: tbl[i].id }; else tbl.push(r);
          afterWrite(this.t, i >= 0 ? tbl[i] : r); out.push(clone(i >= 0 ? tbl[i] : r));
        });
      } else if (this.op === 'update') {
        tbl.forEach((r) => { if (this.f.every((fn) => fn(r))) { Object.assign(r, clone(this.data)); out.push(clone(r)); } });
      } else if (this.op === 'delete') {
        for (let i = tbl.length - 1; i >= 0; i--) if (this.f.every((fn) => fn(tbl[i]))) { out.push(tbl[i]); tbl.splice(i, 1); }
        if (this.t === 'fq_diet_plans') out.forEach((p) => { db.fq_diet_items = db.fq_diet_items.filter((x) => x.plan_id !== p.id); });
      }
      if (this.op !== 'select' && !this.wantRows && !this.one) return { data: null, error: null };
      if (this.one) { if (!out.length && this.one === 'single') return { data: null, error: { message: 'Not found' } }; return { data: out[0] || null, error: null }; }
      return { data: out, error: null };
    }
  }
  const session = { user: { id: me.id, email: me.phone + '@preview' } };
  const client = {
    from: (t) => new Q(t),
    rpc: async (name, a) => {
      if (name === 'fq_mark_my_workout') { const w = db.fq_workout_assignments.find((x) => x.id === a.p_id && x.member_id === me.id); if (!w) return { error: { message: 'Workout not found' } }; w.status = a.p_status; return { data: null, error: null }; }
      if (name === 'fq_update_my_goal') { const m3 = db.fq_members.find((x) => x.profile_id === me.id); Object.assign(m3, { diet_type: a.p_diet_type, target_weight: a.p_target_weight ?? m3.target_weight, goal: a.p_goal || m3.goal, height_cm: a.p_height_cm ?? m3.height_cm }); return { data: null, error: null }; }
      return { error: { message: 'Unknown' } };
    },
    functions: { invoke: async (name, { body }) => {
      if (body.action === 'create_user') {
        const p = prof(body.role, body.full_name, String(body.phone).replace(/\D/g, '').slice(-10));
        if (body.role === 'trainer') db.fq_trainers.push({ profile_id: p.id, gym_id: G, ...(body.trainer || {}) });
        if (body.role === 'member') { const x = body.member || {}; const w = x.start_weight ? +x.start_weight : null;
          db.fq_members.push({ profile_id: p.id, gym_id: G, trainer_id: x.trainer_id || null, diet_type: x.diet_type || 'veg', goal: x.goal || 'lose', start_weight: w, current_weight: w, target_weight: x.target_weight ? +x.target_weight : null, height_cm: x.height_cm || null, plan_name: x.plan_name || null, fee_paise: x.fee_rupees ? +x.fee_rupees * 100 : null, paid_until: x.paid_until || null, joined_on: key(T) });
          if (w) db.fq_weight_logs.push({ id: uid(), gym_id: G, member_id: p.id, on_date: key(T), weight: w }); }
        return { data: { id: p.id }, error: null };
      }
      if (body.action === 'set_active') { const p = db.fq_profiles.find((x) => x.id === body.user_id); p.active = !!body.active; }
      if (body.action === 'update_user') {
        const ph = String(body.phone).replace(/\D/g, '').slice(-10);
        if (db.fq_profiles.some((x) => x.phone === ph && x.id !== body.user_id)) return { data: { error: 'This mobile number already has a login' }, error: null };
        Object.assign(db.fq_profiles.find((x) => x.id === body.user_id), { full_name: body.full_name, phone: ph });
      }
      if (body.action === 'remove_user') {
        const id = body.user_id;
        db.fq_profiles = db.fq_profiles.filter((x) => x.id !== id); db.fq_trainers = db.fq_trainers.filter((x) => x.profile_id !== id);
        db.fq_members.forEach((x) => { if (x.trainer_id === id) x.trainer_id = null; });
        db.fq_members = db.fq_members.filter((x) => x.profile_id !== id);
        ['fq_payments', 'fq_diet_logs', 'fq_weight_logs', 'fq_workout_assignments', 'fq_member_meals', 'fq_notices'].forEach((t) => { db[t] = db[t].filter((x) => x.member_id !== id); });
      }
      return { data: { ok: true }, error: null };
    } },
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => { history.replaceState(null, '', location.pathname); return { error: null }; },
      updateUser: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
  window.FQ_MOCK_CLIENT = client;
})();
