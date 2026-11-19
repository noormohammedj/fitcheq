/* Fitcheq member app: Today, Diet, Workouts, Progress, Gym. */
(function () {
  const X = window.FQX, { sb, esc, $, key, parse, today, addDays, monday, dayIdx, WD, WDL, fmt, inr, MEALS, ic, q, goalStats, toast, fail, num, kg } = X;
  let S = null, tab = 'today', dietWeek = 0, dietDay = dayIdx(today()), root;

  async function load(me) {
    const uid = me.user.id, t0 = today(), wk = monday(t0);
    const from = key(addDays(t0, -21)), to = key(addDays(t0, 7));
    const [m, trainers, plans, logs, wa, weights, notices, events, fac] = await Promise.all([
      q(sb.from('fq_members').select('*').eq('profile_id', uid).single()),
      q(sb.from('fq_profiles').select('id, full_name, phone, role, fq_trainers(*)').in('role', ['trainer', 'admin'])),
      q(sb.from('fq_diet_plans').select('id, week_start, diet_type, fq_diet_items(*)').in('week_start', [key(wk), key(addDays(wk, 7))])),
      q(sb.from('fq_diet_logs').select('*').eq('member_id', uid).gte('on_date', from)),
      q(sb.from('fq_workout_assignments').select('*').eq('member_id', uid).gte('on_date', from).lte('on_date', to).order('on_date')),
      q(sb.from('fq_weight_logs').select('*').eq('member_id', uid).order('on_date')),
      q(sb.from('fq_notices').select('*').order('created_at', { ascending: false }).limit(20)),
      q(sb.from('fq_events').select('*').gte('starts_on', key(t0)).order('starts_on').limit(10)),
      q(sb.from('fq_facilities').select('*').order('category')),
    ]);
    S = { me, m, trainers, plans, logs, wa, weights, notices, events, fac };
  }
  const coach = () => S.trainers.find((t) => t.id === S.m.trainer_id);
  const logOf = (d, meal) => (S.logs.find((l) => l.on_date === key(d) && l.meal === meal) || {}).status;
  function mealsFor(d) {
    const ws = key(monday(d)), p = S.plans.find((x) => x.week_start === ws && x.diet_type === S.m.diet_type);
    if (!p) return [];
    const di = dayIdx(d);
    return MEALS.map(([id, name, time]) => { const it = p.fq_diet_items.find((x) => x.day === di && x.meal === id); return it ? { id, name, time, ...it } : null; }).filter(Boolean);
  }
  function adherence(days) {
    const since = key(addDays(today(), -(days || 14)));
    const l = S.logs.filter((x) => x.on_date >= since); if (!l.length) return null;
    return l.filter((x) => x.status === 'done').length / l.length;
  }

  // ---------- pieces ----------
  function goalCard(compact) {
    const g = goalStats(S.m, adherence());
    if (!g) return '<div class="card goal"><b>Set your goal</b><p class="muted small">Add your target weight in Progress to see how close you are.</p><button class="btn sm" data-tab="progress">Set my goal</button></div>';
    const a = Math.round(g.adherence * 100);
    return '<div class="card goal"><div class="goalrow"><div><span class="muted small">Your goal</span><b class="big">' + Math.round(g.pct) + '% there</b></div><div class="r"><span class="muted small">' + (g.gain ? 'Gained' : 'Lost') + '</span><b>' + g.moved.toFixed(1) + ' kg</b></div><div class="r"><span class="muted small">To go</span><b>' + g.toGo.toFixed(1) + ' kg</b></div></div>' +
      X.bar(g.pct, 'green') +
      (compact ? '' : '<p class="small" style="margin:10px 0 0">' + (g.toGo === 0 ? 'You’ve reached your target. Talk to your coach about the next goal.' :
        'You followed <b>' + a + '%</b> of your meals in the last 2 weeks. ' + (g.eta ? 'At this pace you reach <b>' + S.m.target_weight + ' kg</b> around <b>' + fmt(g.eta, true) + '</b>.' : 'At this pace you won’t reach your target yet.') +
        (a < 95 && g.etaFull ? ' Follow every meal and it’s <b>' + fmt(g.etaFull, true) + '</b>.' : '')) + '</p>') + '</div>';
  }
  function mealRows(d, editable) {
    const ms = mealsFor(d);
    if (!ms.length) return '<div class="empty">Your coach hasn’t loaded the ' + (S.m.diet_type === 'veg' ? 'veg' : 'non-veg') + ' plan for this week yet.</div>';
    return '<div class="group">' + ms.map((x) => {
      const s = logOf(d, x.id);
      return '<div class="row meal ' + (s || '') + '">' + (editable ? '<button class="chk ' + (s === 'done' ? 'on' : '') + '" data-meal="' + x.id + '" data-d="' + key(d) + '" data-v="done" aria-label="I had ' + esc(x.name) + '">' + ic('check') + '</button>' : '<span class="chk ghost"></span>') +
        '<div class="grow"><div class="ttl">' + esc(x.name) + ' <span class="muted small">' + x.time + (x.kcal ? ' · ' + x.kcal + ' kcal' : '') + '</span></div><div class="sub">' + esc(x.items) + '</div></div>' +
        (editable ? '<button class="skip ' + (s === 'skipped' ? 'on' : '') + '" data-meal="' + x.id + '" data-d="' + key(d) + '" data-v="skipped">' + (s === 'skipped' ? 'Skipped' : 'Skip') + '</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function workoutCard(w, editable) {
    const ex = Array.isArray(w.exercises) ? w.exercises : [];
    return '<div class="card wo ' + w.status + '"><div class="worow"><div class="grow"><b>' + esc(w.title) + '</b><div class="muted small">' + (ex.length ? ex.length + ' exercises' : '') + (w.note ? ' · ' + esc(w.note) : '') + '</div></div>' +
      (w.status === 'done' ? '<span class="pill ok">Done</span>' : w.status === 'skipped' ? '<span class="pill no">Skipped</span>' : '') + '</div>' +
      (ex.length ? '<div class="exs">' + ex.map((e) => '<div><span>' + esc(e.name) + '</span><span>' + esc(e.sets || '') + '</span></div>').join('') + '</div>' : '') +
      (editable ? '<div class="btns"><button class="btn ' + (w.status === 'done' ? 'okb' : 'green') + '" data-wo="' + w.id + '" data-v="' + (w.status === 'done' ? 'assigned' : 'done') + '">' + (w.status === 'done' ? ic('check') + 'Done' : 'Mark as done') + '</button><button class="btn ' + (w.status === 'skipped' ? 'nob' : '') + '" style="flex:0 0 100px" data-wo="' + w.id + '" data-v="' + (w.status === 'skipped' ? 'assigned' : 'skipped') + '">' + (w.status === 'skipped' ? 'Skipped' : 'Skip') + '</button></div>' : '') + '</div>';
  }

  // ---------- screens ----------
  function vToday() {
    const t = today(), ms = mealsFor(t), done = ms.filter((x) => logOf(t, x.id) === 'done').length;
    const wos = S.wa.filter((w) => w.on_date === key(t)), p = X.paidState(S.m);
    const n = S.notices[0], ev = S.events[0];
    return '<header class="top"><span class="muted">' + WDL[dayIdx(t)] + ', ' + fmt(t) + '</span><h1>Hi, ' + esc(S.me.profile.full_name.split(' ')[0]) + '</h1></header>' +
      (p.cls !== 'ok' ? '<div class="banner ' + p.cls + '">' + ic('bill') + '<span>Membership: <b>' + p.label + '</b>' + (S.m.fee_paise ? ' · ' + inr(S.m.fee_paise) : '') + '. Please pay at the desk.</span></div>' : '') +
      goalCard() +
      '<h2 class="sec">Today’s meals <span>' + done + ' of ' + ms.length + ' had</span></h2>' + mealRows(t, true) +
      '<h2 class="sec">Today’s workout</h2>' + (wos.length ? wos.map((w) => workoutCard(w, true)).join('') : '<div class="empty">No workout today. Rest, walk and sleep well.</div>') +
      (ev ? '<h2 class="sec">Coming up at the gym</h2><div class="card event"><b>' + esc(ev.title) + '</b><div class="muted small">' + fmt(ev.starts_on, true) + (ev.starts_at ? ' · ' + ev.starts_at.slice(0, 5) : '') + '</div>' + (ev.details ? '<p class="small">' + esc(ev.details) + '</p>' : '') + '</div>' : '') +
      (n ? '<h2 class="sec">Latest message</h2><div class="card"><b>' + esc(n.title) + '</b>' + (n.body ? '<p class="small">' + esc(n.body) + '</p>' : '') + '<div class="muted small">' + fmt(n.created_at.slice(0, 10)) + '</div></div>' : '');
  }
  function vDiet() {
    const base = addDays(monday(today()), dietWeek * 7), d = addDays(base, dietDay), t = today();
    const editable = d <= t && d >= addDays(t, -6);
    let strip = '';
    for (let i = 0; i < 7; i++) {
      const di = addDays(base, i), ms = mealsFor(di), dn = ms.filter((x) => logOf(di, x.id) === 'done').length, any = ms.some((x) => logOf(di, x.id));
      const dot = di > t || !any ? '' : dn >= ms.length - 1 ? 'ok' : dn >= ms.length / 2 ? 'mid' : 'no';
      strip += '<button class="day' + (i === dietDay ? ' sel' : '') + (key(di) === key(t) ? ' today' : '') + '" data-day="' + i + '"><span>' + WD[i][0] + '</span><b>' + di.getDate() + '</b><i class="' + dot + '"></i></button>';
    }
    const ms = mealsFor(d), kc = ms.reduce((s, x) => s + (x.kcal || 0), 0), pr = ms.reduce((s, x) => s + (x.protein_g || 0), 0);
    return '<header class="top"><span class="muted">' + (S.m.diet_type === 'veg' ? 'Vegetarian' : 'Non-vegetarian') + ' plan · <button class="link" data-tab="progress">change</button></span><h1>Diet</h1></header>' +
      '<div class="seg2"><button class="' + (dietWeek === 0 ? 'on' : '') + '" data-week="0">This week</button><button class="' + (dietWeek === 1 ? 'on' : '') + '" data-week="1">Next week</button></div>' +
      '<div class="days">' + strip + '</div>' +
      '<div class="dayhead"><b>' + (key(d) === key(t) ? 'Today' : WDL[dietDay] + ' ' + fmt(d)) + '</b><span class="muted small">' + (kc ? kc + ' kcal · ' : '') + (pr ? pr + ' g protein' : '') + '</span></div>' +
      mealRows(d, editable) + (d > t ? '<p class="muted small center">You can tick meals on the day.</p>' : !editable ? '<p class="muted small center">Days older than a week can’t be changed.</p>' : '');
  }
  function vWorkouts() {
    const t = today(); let h = '';
    for (let i = 0; i <= 7; i++) {
      const d = addDays(t, i), ws = S.wa.filter((w) => w.on_date === key(d));
      h += '<h2 class="sec">' + (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : WDL[dayIdx(d)]) + ' <span>' + fmt(d) + '</span></h2>' + (ws.length ? ws.map((w) => workoutCard(w, i === 0)).join('') : '<div class="empty slim">Rest day</div>');
    }
    const past = S.wa.filter((w) => w.on_date < key(t) && w.on_date >= key(addDays(t, -14)));
    const done = past.filter((w) => w.status === 'done').length;
    return '<header class="top"><span class="muted">Set by ' + esc((coach() || {}).full_name || 'your coach') + '</span><h1>Workouts</h1></header>' +
      (past.length ? '<div class="card"><b>' + done + ' of ' + past.length + '</b> workouts done in the last 2 weeks' + X.bar(past.length ? (done / past.length) * 100 : 0, 'green') + '</div>' : '') + h;
  }
  function vProgress() {
    const g = goalStats(S.m, adherence()), last = S.weights[S.weights.length - 1];
    return '<header class="top"><span class="muted">Since ' + fmt(S.m.joined_on, true) + '</span><h1>Progress</h1></header>' +
      '<div class="three"><div><span>Start</span><b>' + kg(S.m.start_weight) + '</b></div><div class="now"><span>Now</span><b>' + kg(S.m.current_weight) + '</b></div><div><span>Target</span><b>' + kg(S.m.target_weight) + '</b></div></div>' +
      goalCard() +
      '<h2 class="sec">Log today’s weight</h2><form class="card inline" id="f-weight"><input name="w" type="number" step="0.1" min="20" max="350" inputmode="decimal" placeholder="e.g. ' + (S.m.current_weight || 70) + '" value="' + (last && last.on_date === key(today()) ? last.weight : '') + '" aria-label="Weight in kg" required><span class="muted">kg</span><button class="btn dark">Save</button></form>' +
      '<h2 class="sec">Weight</h2><div class="card">' + X.weightChart(S.weights, num(S.m.target_weight)) + '</div>' +
      '<h2 class="sec">My goal and diet</h2><form class="card form" id="f-goal">' +
      X.field('Target weight (kg)', 'target', S.m.target_weight || '', 'type="number" step="0.1" min="20" max="350" inputmode="decimal"') +
      '<div class="fld"><span>My diet</span><div class="seg2 full"><label><input type="radio" name="diet" value="veg"' + (S.m.diet_type === 'veg' ? ' checked' : '') + '><span>Vegetarian</span></label><label><input type="radio" name="diet" value="nonveg"' + (S.m.diet_type === 'nonveg' ? ' checked' : '') + '><span>Non-veg</span></label></div></div>' +
      X.select('Goal', 'goal', [['lose', 'Lose weight'], ['gain', 'Gain muscle / weight'], ['fit', 'Stay fit']], S.m.goal) +
      '<button class="btn dark">Save my goal</button></form>' +
      (g ? '<p class="muted small" style="margin:12px 4px 0">Estimates use the meals you mark as had. They’re a guide, not medical advice.</p>' : '');
  }
  function vGym() {
    const g = S.me.gym, c = coach(), p = X.paidState(S.m), cats = [...new Set(S.fac.map((f) => f.category || 'Other'))];
    return '<header class="top"><span class="muted">' + esc(g.hours || '') + '</span><h1>' + esc(g.name) + '</h1></header>' +
      '<div class="group">' + (g.address ? '<div class="row"><span class="grow muted">Address</span><span class="r">' + esc(g.address) + '</span></div>' : '') + (g.phone ? '<div class="row"><span class="grow muted">Phone</span><span class="r sel">' + esc(g.phone) + '</span></div>' : '') +
      '<div class="row"><span class="grow muted">Membership</span><span class="pill ' + p.cls + '">' + p.label + '</span></div>' + (S.m.plan_name ? '<div class="row"><span class="grow muted">Plan</span><span class="r">' + esc(S.m.plan_name) + (S.m.fee_paise ? ' · ' + inr(S.m.fee_paise) : '') + '</span></div>' : '') + '</div>' +
      (c ? '<h2 class="sec">My trainer</h2><div class="group"><div class="row"><span class="av">' + X.initials(c.full_name) + '</span><div class="grow"><div class="ttl">' + esc(c.full_name) + '</div><div class="sub">' + esc((c.fq_trainers && c.fq_trainers.speciality) || 'Trainer') + (c.fq_trainers && c.fq_trainers.experience_years ? ' · ' + c.fq_trainers.experience_years + ' yrs' : '') + '</div></div></div>' +
        (c.fq_trainers && c.fq_trainers.slots ? '<div class="row"><span class="grow muted">On the floor</span><span class="r">' + esc(c.fq_trainers.slots) + '</span></div>' : '') + (c.fq_trainers && c.fq_trainers.certifications ? '<div class="row"><span class="grow muted">Certified</span><span class="r">' + esc(c.fq_trainers.certifications) + '</span></div>' : '') + '<div class="row"><span class="grow muted">Phone</span><span class="r sel">' + esc(c.phone) + '</span></div></div>' : '') +
      (S.events.length ? '<h2 class="sec">Events</h2><div class="group">' + S.events.map((e) => '<div class="row"><div class="date"><b>' + parse(e.starts_on).getDate() + '</b><span>' + X.MO[parse(e.starts_on).getMonth()] + '</span></div><div class="grow"><div class="ttl">' + esc(e.title) + '</div><div class="sub">' + (e.starts_at ? e.starts_at.slice(0, 5) + ' · ' : '') + esc(e.details || '') + '</div></div></div>').join('') + '</div>' : '') +
      (S.notices.length ? '<h2 class="sec">Messages</h2><div class="group">' + S.notices.map((n) => '<div class="row"><div class="grow"><div class="ttl">' + esc(n.title) + '</div>' + (n.body ? '<div class="sub">' + esc(n.body) + '</div>' : '') + '</div><span class="r small">' + fmt(n.created_at.slice(0, 10)) + '</span></div>').join('') + '</div>' : '') +
      (S.fac.length ? '<h2 class="sec">Facilities</h2>' + cats.map((cat) => '<div class="group" style="margin-bottom:10px">' + S.fac.filter((f) => (f.category || 'Other') === cat).map((f) => '<div class="row"><div class="grow"><div class="ttl">' + esc(f.name) + '</div><div class="sub">' + esc(cat) + (f.quantity > 1 ? ' · ' + f.quantity : '') + (f.note ? ' · ' + esc(f.note) : '') + '</div></div>' + (f.status === 'maintenance' ? '<span class="pill wa">Under repair</span>' : f.status === 'new' ? '<span class="pill ok">New</span>' : '') + '</div>').join('') + '</div>').join('') : '') +
      '<div class="btns" style="margin-top:20px"><button class="btn" data-act="pw">Change password</button><button class="btn" data-act="out">Sign out</button></div>';
  }

  const TABS = [['today', 'Today', 'today', vToday], ['diet', 'Diet', 'diet', vDiet], ['workouts', 'Workouts', 'workout', vWorkouts], ['progress', 'Progress', 'progress', vProgress], ['gym', 'Gym', 'gym', vGym]];
  function render(keepScroll) {
    const sc = $('.mscroll', root), top = keepScroll && sc ? sc.scrollTop : 0;
    const t = TABS.find((x) => x[0] === tab) || TABS[0];
    root.innerHTML = '<main class="mscroll">' + t[3]() + '</main><nav class="mtabs">' + TABS.map((x) => '<button data-tab="' + x[0] + '" class="' + (x[0] === tab ? 'on' : '') + '">' + ic(x[2]) + x[1] + '</button>').join('') + '</nav>';
    $('.mscroll', root).scrollTop = top;
  }

  async function setMeal(d, meal, v, btn) {
    const cur = (S.logs.find((l) => l.on_date === d && l.meal === meal) || {}).status, uid = S.me.user.id;
    btn.disabled = true;
    try {
      if (cur === v) {
        await q(sb.from('fq_diet_logs').delete().eq('member_id', uid).eq('on_date', d).eq('meal', meal));
        S.logs = S.logs.filter((l) => !(l.on_date === d && l.meal === meal));
      } else {
        const row = { member_id: uid, gym_id: S.me.profile.gym_id, on_date: d, meal, status: v, updated_at: new Date().toISOString() };
        await q(sb.from('fq_diet_logs').upsert(row));
        S.logs = S.logs.filter((l) => !(l.on_date === d && l.meal === meal)).concat(row);
        if (v === 'done') { const g = goalStats(S.m, adherence()); toast(g ? 'Logged. ' + Math.round(g.pct) + '% to your goal, ' + g.toGo.toFixed(1) + ' kg to go' : 'Logged'); }
        else toast('Marked as skipped');
      }
      render(true);
    } catch (e) { fail(e); btn.disabled = false; }
  }

  async function start(me, el) {
    root = el; root.className = 'member';
    root.innerHTML = '<div class="loading">Loading your plan…</div>';
    await load(me); render();
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; if (tab === 'diet') { dietWeek = 0; dietDay = dayIdx(today()); } render(); return; }
      if (b.dataset.week) { dietWeek = +b.dataset.week; dietDay = dietWeek ? 0 : dayIdx(today()); render(true); return; }
      if (b.dataset.day) { dietDay = +b.dataset.day; render(true); return; }
      if (b.dataset.meal) return setMeal(b.dataset.d, b.dataset.meal, b.dataset.v, b);
      if (b.dataset.wo) {
        b.disabled = true;
        try { await q(sb.rpc('fq_mark_my_workout', { p_id: b.dataset.wo, p_status: b.dataset.v })); const w = S.wa.find((x) => x.id === b.dataset.wo); w.status = b.dataset.v; render(true); toast(b.dataset.v === 'done' ? 'Workout done. Well played.' : b.dataset.v === 'skipped' ? 'Marked as skipped' : 'Cleared'); }
        catch (err) { fail(err); b.disabled = false; }
        return;
      }
      if (b.dataset.act === 'pw') return X.changePasswordSheet();
      if (b.dataset.act === 'out') { await sb.auth.signOut(); location.reload(); }
    });
    root.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = X.formData(e.target), btn = e.target.querySelector('button');
      X.busy(btn, true);
      try {
        if (e.target.id === 'f-weight') {
          const w = num(f.w); if (!w || w < 20 || w > 350) throw new Error('Enter your weight in kg');
          await q(sb.from('fq_weight_logs').upsert({ member_id: me.user.id, gym_id: me.profile.gym_id, on_date: key(today()), weight: w, recorded_by: me.user.id }, { onConflict: 'member_id,on_date' }));
          S.m.current_weight = w; S.weights = S.weights.filter((x) => x.on_date !== key(today())).concat({ on_date: key(today()), weight: w });
          if (S.m.start_weight == null) S.m.start_weight = w;
          toast('Weight saved');
        } else if (e.target.id === 'f-goal') {
          await q(sb.rpc('fq_update_my_goal', { p_diet_type: f.diet, p_target_weight: num(f.target), p_goal: f.goal }));
          Object.assign(S.m, { diet_type: f.diet, target_weight: num(f.target) ?? S.m.target_weight, goal: f.goal });
          toast('Goal saved. Your diet now follows the ' + (f.diet === 'veg' ? 'vegetarian' : 'non-veg') + ' plan.');
        }
        render(true);
      } catch (err) { fail(err); } finally { X.busy(btn, false); }
    });
  }
  window.FQMember = { start };
})();
