/* Fitcheq staff console for the owner (admin) and trainers. The database enforces the same rules:
   owner  – trainers (add, edit, remove), fee plans, facilities, gym details and opening hours, members, payments
   trainer – each member's own meals and workouts day by day, consistency, weights, "we missed you" reminders */
(function () {
  const X = window.FQX, { sb, esc, $, $$, key, parse, today, addDays, monday, dayIdx, WD, WDL, fmt, inr, MEALS, ic, q, toast, fail, num, kg, sheet, closeSheet, field, area, select, formData, busy } = X;
  let ME, isAdmin, root, view = 'members', sub = null, cache = {};

  // ---------- data ----------
  async function loadPeople(force) {
    if (cache.people && !force) return cache.people;
    const [profiles, members, trainers, plans] = await Promise.all([
      q(sb.from('fq_profiles').select('*').order('full_name')),
      q(sb.from('fq_members').select('*')),
      q(sb.from('fq_trainers').select('*')),
      q(sb.from('fq_fee_plans').select('*').order('months')),
    ]);
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    cache.people = {
      profiles, byId, plans,
      members: members.map((m) => ({ ...m, p: byId[m.profile_id] })).filter((m) => m.p).sort((a, b) => a.p.full_name.localeCompare(b.p.full_name)),
      trainers: profiles.filter((p) => p.role !== 'member').map((p) => ({ p, t: trainers.find((t) => t.profile_id === p.id) || {} })),
    };
    return cache.people;
  }
  // workouts and meal ticks of the last 14 days for everyone, plus missed-you reminders of the last week
  async function loadActivity() {
    const from = key(addDays(today(), -13)), t = key(today());
    const [wa, logs, notes] = await Promise.all([
      q(sb.from('fq_workout_assignments').select('member_id, on_date, status').gte('on_date', from).lte('on_date', t)),
      q(sb.from('fq_diet_logs').select('member_id, on_date, status').gte('on_date', from)),
      q(sb.from('fq_notices').select('member_id, created_at').eq('kind', 'attendance').gte('created_at', addDays(today(), -7).toISOString())),
    ]);
    cache.act = { wa, logs, notes };
    return cache.act;
  }
  const actOf = (id) => X.consistency(cache.act.wa.filter((x) => x.member_id === id), cache.act.logs.filter((x) => x.member_id === id));
  const remindedOn = (id) => (cache.act.notes.filter((n) => n.member_id === id).map((n) => n.created_at).sort().pop() || null);
  function seen(c) {
    if (c.lastDone == null) return { cls: 'no', label: 'No workout marked yet', rank: 99 };
    if (c.daysSince === 0) return { cls: 'ok', label: 'Came today', rank: 0 };
    if (c.daysSince === 1) return { cls: 'ok', label: 'Came yesterday', rank: 1 };
    return { cls: c.daysSince >= 4 ? 'no' : 'wa', label: 'Not seen ' + c.daysSince + ' days', rank: c.daysSince };
  }
  const trainerName = (id) => (cache.people && cache.people.byId[id] ? cache.people.byId[id].full_name : '—');
  const first = (n) => String(n || '').split(' ')[0];
  async function loadWorkouts(force) { if (!cache.workouts || force) cache.workouts = await q(sb.from('fq_workouts').select('*').order('name')); return cache.workouts; }
  const myList = (P) => (isAdmin || cache.filter === 'all' ? P.members : P.members.filter((m) => m.trainer_id === ME.user.id));

  // ---------- layout ----------
  const NAV_T = [['today', 'Today', 'home'], ['members', 'Members', 'users'], ['cperf', 'Client performance', 'progress'], ['templates', 'Diet templates', 'diet'], ['workouts', 'Workouts', 'workout']];
  const NAV_A = [['overview', 'Business', 'home'], ['members', 'Members', 'users'], ['cperf', 'Client performance', 'progress'], ['tperf', 'Trainer performance', 'chart'], ['trainers', 'Trainers', 'star'], ['fees', 'Fee plans', 'bill'], ['gymprofile', 'Gym and hours', 'clock'], ['facilities', 'Facilities', 'gym'],
    ['templates', 'Diet templates', 'diet'], ['workouts', 'Workouts', 'workout'], ['events', 'Events', 'calendar'], ['messages', 'Messages', 'bell']];
  function shell(inner) {
    const nav = isAdmin ? NAV_A : NAV_T;
    root.innerHTML = '<aside class="snav"><div class="brand">fitcheq<span>.</span></div><div class="who">' + esc(ME.gym.name) + '<br><span>' + esc(ME.profile.full_name) + ' · ' + (isAdmin ? 'Owner' : 'Trainer') + '</span></div>' +
      nav.map((n) => '<button class="nav' + (view === n[0] ? ' on' : '') + '" data-view="' + n[0] + '">' + ic(n[2]) + '<span>' + n[1] + '</span></button>').join('') +
      '<div class="navfoot"><button class="nav" data-act="pw">' + ic('settings') + '<span>Password</span></button><button class="nav" data-act="out">' + ic('back') + '<span>Sign out</span></button></div></aside><main class="smain">' + inner + '</main>';
  }
  const head = (title, sub, actions) => '<div class="shead"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="btns">' + actions + '</div>' : '') + '</div>';
  async function go(v, s, keepScroll) {
    const sc = $('.smain', root), top = keepScroll && sc ? sc.scrollTop : 0;
    view = v; sub = s || null;
    if (!keepScroll) shell('<div class="loading">Loading…</div>');
    try {
      const fn = VIEWS[v] || VIEWS.members; const html = await fn(); shell(html); $('.smain', root).scrollTop = top;
      const sel = $('.pday.sel', root); if (sel) sel.parentElement.scrollLeft = sel.offsetLeft - sel.parentElement.offsetLeft - 8; // keep the chosen day in view on phones
      const on = $('.snav .nav.on', root), bar = $('.snav', root); if (on && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = on.offsetLeft - bar.clientWidth / 3; // and the open menu item
    }
    catch (e) { fail(e); shell(head('Something went wrong', 'Please refresh the page.')); }
  }

  // ---------- attendance: who hasn't been coming ----------
  function attendanceRows(list) {
    const rows = list.filter((m) => m.p.active).map((m) => ({ m, c: actOf(m.profile_id) })).map((x) => ({ ...x, s: seen(x.c) })).sort((a, b) => b.s.rank - a.s.rank || a.m.p.full_name.localeCompare(b.m.p.full_name));
    if (!rows.length) return '<div class="empty">No members yet.</div>';
    return rows.map(({ m, c, s }) => {
      const r = remindedOn(m.profile_id);
      return '<div class="li"><div class="grow"><b class="click" data-member="' + m.profile_id + '">' + esc(m.p.full_name) + '</b><small>' + c.woDone + ' of ' + c.woPlanned + ' workouts · ' + (c.mealPct == null ? 'no meals ticked' : Math.round(c.mealPct * 100) + '% meals had') + ' · 14 days' + (isAdmin ? ' · ' + esc(trainerName(m.trainer_id)) : '') + (r ? ' · reminded ' + fmt(key(new Date(r))) : '') + '</small></div>' +
        '<span class="pill ' + s.cls + '">' + s.label + '</span>' + (s.rank >= 2 ? '<button class="btn sm" data-missed="' + m.profile_id + '">' + ic('wa') + 'Remind</button>' : '<span class="btnspace"></span>') + '</div>';
    }).join('');
  }
  function missedSheet(id) {
    const m = cache.people.members.find((x) => x.profile_id === id), c = actOf(id), coach = m.trainer_id ? first(trainerName(m.trainer_id)) : first(ME.profile.full_name);
    const since = c.lastDone == null ? 'this week' : 'for the last ' + c.daysSince + ' days';
    const text = 'Hi ' + first(m.p.full_name) + ', we missed you at ' + ME.gym.name + ' ' + since + '. Your workout and meals for today are ready in the app. See you at the gym! – ' + coach;
    sheet('<h3>Remind ' + esc(m.p.full_name) + '</h3><p class="muted small">Opens WhatsApp with this message. It is also saved in their app.</p><form class="form" id="f-missed">' + area('Message', 'body', text, 'rows="5"') +
      '<div class="btns"><a class="btn dark" id="wa-go" target="_blank" rel="noopener" href="' + X.waLink(m.p.phone, text) + '">' + ic('wa') + 'Send on WhatsApp</a><button class="btn" type="button" data-inapp>Send in app only</button></div></form>', (el) => {
      const ta = el.querySelector('textarea'), a = el.querySelector('#wa-go');
      ta.addEventListener('input', () => (a.href = X.waLink(m.p.phone, ta.value)));
      const record = async () => { await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, member_id: id, kind: 'attendance', title: 'We missed you', body: ta.value.trim(), created_by: ME.user.id })); cache.act.notes.push({ member_id: id, created_at: new Date().toISOString() }); };
      a.addEventListener('click', () => { record().then(() => { closeSheet(); toast('Reminder sent to ' + first(m.p.full_name)); go(view, sub, true); }, fail); });
      el.querySelector('[data-inapp]').addEventListener('click', async (e) => { busy(e.target, true); try { await record(); closeSheet(); toast('Reminder sent in the app'); go(view, sub, true); } catch (err) { fail(err); busy(e.target, false); } });
    });
  }

  // ---------- performance: how each member is doing, how each trainer follows up ----------
  // one load covers both: workouts, meal ticks, weigh-ins, reminders and plans for the window and the next 3 days
  async function loadPerf(days) {
    const t = today(), from = key(addDays(t, -(days - 1))), tk = key(t), to3 = key(addDays(t, 3));
    const [wa, logs, weights, notes, meals, nextWa] = await Promise.all([
      q(sb.from('fq_workout_assignments').select('member_id, on_date, status, assigned_by, created_at').gte('on_date', from).lte('on_date', tk)),
      q(sb.from('fq_diet_logs').select('member_id, on_date, status').gte('on_date', from).lte('on_date', tk)),
      q(sb.from('fq_weight_logs').select('member_id, on_date, weight').gte('on_date', key(addDays(t, -(days + 30)))).order('on_date')),
      q(sb.from('fq_notices').select('member_id, created_by, created_at').eq('kind', 'attendance').gte('created_at', addDays(t, -(days - 1)).toISOString())),
      q(sb.from('fq_member_meals').select('member_id, on_date, updated_by, updated_at').gte('on_date', from).lte('on_date', to3)),
      q(sb.from('fq_workout_assignments').select('member_id, on_date, assigned_by, created_at').gte('on_date', key(addDays(t, 1))).lte('on_date', to3)),
    ]);
    return { days, from, wa, logs, weights, notes, meals, nextWa };
  }
  const pctTxt = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
  const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  function clientStats(m, D) {
    const id = m.profile_id, t = today();
    const c = X.consistency(D.wa.filter((x) => x.member_id === id), D.logs.filter((x) => x.member_id === id), D.days);
    const att = c.woPlanned ? c.woDone / c.woPlanned : null;
    const ws = D.weights.filter((x) => x.member_id === id), inWin = ws.filter((w) => w.on_date >= D.from);
    const before = ws.filter((w) => w.on_date < D.from).pop();
    const base = before || inWin[0], last = ws[ws.length - 1];
    const change = base && last && base !== last ? Number(last.weight) - Number(base.weight) : null;
    const g = X.goalStats(m, c.mealPct), gain = g ? g.gain : m.goal === 'gain';
    const rightWay = change == null ? null : gain ? change > 0 : change < 0;
    const next3 = [1, 2, 3].filter((i) => D.meals.some((x) => x.member_id === id && x.on_date === key(addDays(t, i)))).length;
    let st;
    if (c.lastDone == null && !c.woPlanned) st = { k: 3, cls: '', label: 'Getting started' };
    else if (c.daysSince == null || c.daysSince >= 5 || (att != null && att < 0.4)) st = { k: 0, cls: 'no', label: 'At risk' };
    else if ((att == null || att >= 0.7) && (c.mealPct == null || c.mealPct >= 0.7) && c.daysSince <= 2) st = { k: 2, cls: 'ok', label: 'On track' };
    else st = { k: 1, cls: 'wa', label: 'Needs attention' };
    return { c, att, change, rightWay, g, next3, st };
  }
  function trainerStats(tid, members, D) {
    const t = today(), mine = members.filter((m) => m.trainer_id === tid && m.p.active).map((m) => ({ m, s: clientStats(m, D) }));
    const away = mine.filter((x) => x.s.c.daysSince == null || x.s.c.daysSince >= 3);
    const reminded = (id) => D.notes.some((n) => n.member_id === id && new Date(n.created_at) >= addDays(t, -3));
    const followed = away.filter((x) => reminded(x.m.profile_id)).length;
    const planCov = mine.length ? mine.filter((x) => x.s.next3 === 3).length / mine.length : null;
    const avgAtt = mean(mine.map((x) => x.s.att)), avgMeals = mean(mine.map((x) => x.s.c.mealPct)), avgGoal = mean(mine.map((x) => (x.s.g ? x.s.g.pct / 100 : null)));
    const follow = away.length ? followed / away.length : null;
    const stamps = D.meals.filter((x) => x.updated_by === tid).map((x) => x.updated_at).concat(D.wa.concat(D.nextWa).filter((x) => x.assigned_by === tid).map((x) => x.created_at)).filter(Boolean).sort();
    const score = mine.length ? Math.round(100 * (0.35 * (planCov || 0) + 0.25 * (follow == null ? 1 : follow) + 0.25 * (avgAtt || 0) + 0.15 * (avgMeals || 0))) : null;
    return { mine, away: away.length, followed, follow, planCov, avgAtt, avgMeals, avgGoal, reminders: D.notes.filter((n) => n.created_by === tid).length, lastPlan: stamps.pop() || null,
      onTrack: mine.filter((x) => x.s.st.k === 2).length, atRisk: mine.filter((x) => x.s.st.k === 0).length, score };
  }
  const scoreBar = (v) => (v == null ? '<span class="muted">—</span>' : '<div class="sbar"><b>' + v + '</b>' + X.bar(v, v >= 70 ? 'green' : v >= 45 ? 'amber' : 'red') + '</div>');
  const winToggle = (days) => '<div class="seg2">' + [[7, '7 days'], [14, '14 days'], [30, '30 days']].map(([d, l]) => '<button class="' + (d === days ? 'on' : '') + '" data-win="' + d + '">' + l + '</button>').join('') + '</div>';
  const ago = (iso) => { if (!iso) return 'never'; const d = Math.round((today() - parse(key(new Date(iso)))) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
  const SCORE_HELP = 'Follow-up score: plans set for the next 3 days (35%), away clients reminded within 3 days (25%), client workouts done (25%), client meals had (15%).';

  // owner: trainer leaderboard
  async function vTrainerPerf() {
    const days = cache.win || 14, P = await loadPeople(true), D = await loadPerf(days);
    const rows = P.trainers.filter((x) => x.p.role === 'trainer').map((x) => ({ x, s: trainerStats(x.p.id, P.members, D) })).sort((a, b) => (b.s.score ?? -1) - (a.s.score ?? -1));
    const unassigned = P.members.filter((m) => m.p.active && !m.trainer_id).length;
    return head('Trainer performance', 'Who is doing well and who follows up with their clients. Last ' + days + ' days.', winToggle(days)) +
      (unassigned ? '<div class="banner wa">' + ic('users') + '<span><b>' + unassigned + ' member' + (unassigned > 1 ? 's have' : ' has') + ' no trainer.</b> Assign them from Members → Edit.</span></div>' : '') +
      '<div class="cards wide">' + (rows.length ? rows.map(({ x, s }, i) => '<div class="tcard perf"><div class="row0"><span class="av">' + (i + 1) + '</span><div class="grow"><b>' + esc(x.p.full_name) + '</b><small>' + s.mine.length + ' active client' + (s.mine.length === 1 ? '' : 's') + ' · last planned ' + ago(s.lastPlan) + '</small></div></div>' +
        scoreBar(s.score) + '<dl>' +
        '<dt>Plans ready, next 3 days</dt><dd>' + pctTxt(s.planCov) + '</dd>' +
        '<dt>Away clients reminded</dt><dd>' + (s.away ? s.followed + ' of ' + s.away : 'none away') + '</dd>' +
        '<dt>Reminders sent</dt><dd>' + s.reminders + '</dd>' +
        '<dt>Client workouts done</dt><dd>' + pctTxt(s.avgAtt) + '</dd>' +
        '<dt>Client meals had</dt><dd>' + pctTxt(s.avgMeals) + '</dd>' +
        '<dt>Average progress to target</dt><dd>' + pctTxt(s.avgGoal) + '</dd>' +
        '<dt>On track · at risk</dt><dd><span class="pill ok">' + s.onTrack + '</span> <span class="pill no">' + s.atRisk + '</span></dd></dl>' +
        '<div class="btns"><button class="btn sm" data-ctrainer="' + x.p.id + '">See their clients</button></div></div>').join('') : '<div class="empty">No trainers yet.</div>') + '</div>' +
      '<p class="muted small">' + SCORE_HELP + '</p>';
  }

  // owner and trainer: every client's performance
  async function vClientPerf() {
    const days = cache.win || 14, P = await loadPeople(true), D = await loadPerf(days);
    const tf = isAdmin ? (cache.ctrainer || '') : (cache.filter === 'all' ? '' : ME.user.id);
    const list = P.members.filter((m) => m.p.active && (!tf || m.trainer_id === tf)).map((m) => ({ m, s: clientStats(m, D) })).sort((a, b) => a.s.st.k - b.s.st.k || (b.s.c.daysSince ?? 99) - (a.s.c.daysSince ?? 99));
    const n = (k) => list.filter((x) => x.s.st.k === k).length;
    const tOpts = [['', 'All trainers']].concat(P.trainers.filter((x) => x.p.role === 'trainer').map((x) => [x.p.id, x.p.full_name]));
    const filter = isAdmin ? '<label class="fld inl"><select id="ctrainer">' + tOpts.map((o) => '<option value="' + o[0] + '"' + (o[0] === tf ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>' : '<button class="btn" data-act="toggle-mine">' + (cache.filter === 'all' ? 'Show my clients' : 'Show all members') + '</button>';
    return head('Client performance', (tf && isAdmin ? esc(trainerName(tf)) + '’s clients' : isAdmin || cache.filter === 'all' ? 'All members' : 'Your clients') + ' · last ' + days + ' days', filter + winToggle(days)) +
      '<div class="kpis"><div><span>On track</span><b class="okc">' + n(2) + '</b></div><div><span>Needs attention</span><b class="wac">' + n(1) + '</b></div><div><span>At risk</span><b class="noc">' + n(0) + '</b></div><div><span>Workouts done</span><b>' + pctTxt(mean(list.map((x) => x.s.att))) + '</b><small>' + pctTxt(mean(list.map((x) => x.s.c.mealPct))) + ' of meals had</small></div></div>' +
      '<div class="table cards-sm"><table><thead><tr><th>Member</th><th>Status</th><th>Workouts done</th><th>Meals had</th><th>Last came</th><th>Weight, ' + days + ' days</th><th>To target</th><th>Next 3 days</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(({ m, s }) => '<tr class="click" data-member="' + m.profile_id + '"><td><b>' + esc(m.p.full_name) + '</b><small>' + esc(trainerName(m.trainer_id)) + ' · ' + ({ lose: 'Lose weight', gain: 'Gain', fit: 'Stay fit' })[m.goal] + '</small></td>' +
        '<td data-l="Status"><span class="pill ' + s.st.cls + '">' + s.st.label + '</span></td>' +
        '<td data-l="Workouts">' + s.c.woDone + '/' + s.c.woPlanned + (s.att != null ? ' · ' + pctTxt(s.att) : '') + '</td>' +
        '<td data-l="Meals">' + pctTxt(s.c.mealPct) + '</td>' +
        '<td data-l="Last came">' + (s.c.lastDone == null ? '—' : s.c.daysSince === 0 ? 'Today' : s.c.daysSince + 'd ago') + (s.c.streak > 1 ? ' · ' + s.c.streak + ' in a row' : '') + '</td>' +
        '<td data-l="Weight">' + (s.change == null ? '—' : '<span class="' + (s.rightWay ? 'okc' : 'noc') + '">' + (s.change > 0 ? '+' : '') + s.change.toFixed(1) + ' kg</span>') + '</td>' +
        '<td data-l="To target">' + (s.g ? Math.round(s.g.pct) + '% · ' + s.g.toGo.toFixed(1) + ' kg to go' : '—') + '</td>' +
        '<td data-l="Next 3 days">' + (s.next3 === 3 ? '<span class="pill ok">Planned</span>' : '<span class="pill wa">' + s.next3 + ' of 3</span>') + '</td><td class="r go">' + ic('chev', 'ic sm') + '</td></tr>').join('') : '<tr><td colspan="9" class="empty">No members.</td></tr>') + '</tbody></table></div>' +
      '<p class="muted small">On track: 70%+ of workouts and meals and seen in the last 2 days. At risk: away 5+ days or under 40% of workouts.</p>';
  }

  // ---------- trainer: today ----------
  async function vToday() {
    const P = await loadPeople(true); await loadActivity();
    const D = await loadPerf(14), me = trainerStats(ME.user.id, P.members, D);
    const list = myList(P).filter((m) => m.p.active), t = today();
    const gaps = list.map((m) => ({ m, days: [1, 2, 3].map((i) => key(addDays(t, i))).filter((d) => !D.meals.some((x) => x.member_id === m.profile_id && x.on_date === d)) })).filter((g) => g.days.length);
    const cs = list.map((m) => actOf(m.profile_id)), came = cs.filter((c) => c.daysSince === 0).length, away = cs.filter((c) => c.daysSince == null || c.daysSince >= 3).length;
    return head('Today', fmt(t, true) + ' · ' + (isAdmin || cache.filter === 'all' ? 'all members' : 'your ' + list.length + ' clients'), '<button class="btn" data-act="toggle-mine">' + (cache.filter === 'all' ? 'Show my clients' : 'Show all members') + '</button>') +
      '<div class="kpis"><div><span>Clients</span><b>' + list.length + '</b></div><div><span>Came today</span><b>' + came + '</b></div><div><span>Away 3+ days</span><b>' + away + '</b></div><div><span>Plans ready, next 3 days</span><b>' + pctTxt(me.planCov) + '</b></div></div>' +
      (isAdmin ? '' : '<section class="panel pad myperf"><div class="mp-score"><span class="muted small">Your follow-up score, 14 days</span>' + scoreBar(me.score) + '</div><div class="stat4"><div><b>' + (me.away ? me.followed + '/' + me.away : '—') + '</b><span>away clients reminded</span></div><div><b>' + pctTxt(me.avgAtt) + '</b><span>client workouts done</span></div><div><b>' + pctTxt(me.avgMeals) + '</b><span>client meals had</span></div><div><b>' + me.onTrack + ' · ' + me.atRisk + '</b><span>on track · at risk</span></div></div><p class="muted small">' + SCORE_HELP + ' <button class="link" data-view="cperf">See each client</button></p></section>') +
      '<div class="cols2"><section class="panel"><header><h3>Attendance</h3><span>From workouts marked done</span></header>' + attendanceRows(list) + '</section>' +
      '<section class="panel"><header><h3>Plans missing</h3><span>Meals not set for the next 3 days</span></header>' + (gaps.length ? gaps.map((g) => '<div class="li"><div class="grow"><b>' + esc(g.m.p.full_name) + '</b><small>No meals for ' + g.days.map((d) => WD[dayIdx(parse(d))] + ' ' + parse(d).getDate()).join(', ') + '</small></div><button class="btn sm" data-plan="' + g.m.profile_id + '|' + g.days[0] + '">Plan</button></div>').join('') : '<div class="empty">Every client has meals for the next 3 days.</div>') + '</section></div>';
  }

  // ---------- owner: business overview ----------
  async function vOverview() {
    const P = await loadPeople(true), t = today(), m0 = new Date(t.getFullYear(), t.getMonth(), 1), from6 = new Date(t.getFullYear(), t.getMonth() - 5, 1);
    const [pays, events, D] = await Promise.all([
      q(sb.from('fq_payments').select('amount_paise, paid_on').gte('paid_on', key(from6))),
      q(sb.from('fq_events').select('*').gte('starts_on', key(t)).order('starts_on').limit(3)),
      loadPerf(14),
    ]);
    await loadActivity();
    const active = P.members.filter((m) => m.p.active);
    const months = Array.from({ length: 6 }, (_, i) => new Date(t.getFullYear(), t.getMonth() - 5 + i, 1));
    const rev = months.map((d) => pays.filter((p) => p.paid_on.slice(0, 7) === key(d).slice(0, 7)).reduce((s, p) => s + p.amount_paise, 0));
    const thisM = rev[5], lastM = rev[4], change = lastM ? (thisM - lastM) / lastM : null;
    const overdue = active.filter((m) => { const p = X.paidState(m); return p.cls === 'no'; }), overdueAmt = overdue.reduce((s, m) => s + (m.fee_paise || 0), 0);
    const renew = active.filter((m) => { const p = X.paidState(m); return p.cls === 'wa'; }), renewAmt = renew.reduce((s, m) => s + (m.fee_paise || 0), 0);
    const newM = active.filter((m) => m.joined_on >= key(m0)).length;
    const stats = active.map((m) => ({ m, s: clientStats(m, D) })), risk = stats.filter((x) => x.s.st.k === 0);
    const board = P.trainers.filter((x) => x.p.role === 'trainer').map((x) => ({ x, s: trainerStats(x.p.id, P.members, D) })).sort((a, b) => (b.s.score ?? -1) - (a.s.score ?? -1));
    const max = Math.max(...rev, 1), W = 340, H = 140, bw = (W - 20) / 6;
    const chart = '<svg class="rchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Fees collected by month">' + rev.map((v, i) => { const h = (v / max) * (H - 44), x = 10 + i * bw; return '<rect x="' + (x + 8) + '" y="' + (H - 22 - h) + '" width="' + (bw - 16) + '" height="' + Math.max(h, 1.5) + '" class="' + (i === 5 ? 'cur' : '') + '"/><text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="ct">' + X.MO[months[i].getMonth()] + '</text>' + (v ? '<text x="' + (x + bw / 2) + '" y="' + (H - 27 - h) + '" text-anchor="middle" class="cv">' + (v >= 1e7 ? (v / 1e7).toFixed(1) + 'L' : Math.round(v / 1e5) + 'k') + '</text>' : ''); }).join('') + '</svg>';
    return head('Business', fmt(t, true) + ' · ' + esc(ME.gym.name), '<button class="btn dark" data-act="add-member">' + ic('plus') + 'Add member</button>') +
      '<div class="kpis"><div><span>Fees collected, ' + X.MO[t.getMonth()] + '</span><b>' + inr(thisM) + '</b><small>' + (change == null ? 'first month' : (change >= 0 ? '+' : '') + Math.round(change * 100) + '% vs ' + X.MO[months[4].getMonth()]) + '</small></div>' +
      '<div><span>Overdue</span><b class="' + (overdue.length ? 'noc' : '') + '">' + inr(overdueAmt) + '</b><small>' + overdue.length + ' member' + (overdue.length === 1 ? '' : 's') + '</small></div>' +
      '<div><span>Renewals, next 7 days</span><b>' + inr(renewAmt) + '</b><small>' + renew.length + ' member' + (renew.length === 1 ? '' : 's') + '</small></div>' +
      '<div><span>Active members</span><b>' + active.length + '</b><small>' + newM + ' new this month · ' + risk.length + ' at risk</small></div></div>' +
      '<div class="cols2"><section class="panel"><header><h3>Fees collected</h3><span>Last 6 months</span></header><div class="pad">' + chart + '</div></section>' +
      '<section class="panel"><header><h3>Trainers</h3><button class="btn sm" data-view="tperf">Details</button></header>' + (board.length ? board.map(({ x, s }) => '<div class="li"><div class="grow"><b>' + esc(x.p.full_name) + '</b><small>' + s.mine.length + ' clients · ' + pctTxt(s.avgAtt) + ' workouts done · ' + (s.away ? s.followed + ' of ' + s.away + ' away reminded' : 'none away') + '</small></div>' + scoreBar(s.score) + '</div>').join('') : '<div class="empty">No trainers yet.</div>') + '</section></div>' +
      '<div class="cols2"><section class="panel"><header><h3>Members at risk</h3><button class="btn sm" data-view="cperf">All clients</button></header>' + (risk.length ? risk.map(({ m, s }) => '<div class="li"><div class="grow"><b class="click" data-member="' + m.profile_id + '">' + esc(m.p.full_name) + '</b><small>' + (s.c.lastDone ? 'Last came ' + (s.c.daysSince) + ' days ago' : 'No workout marked yet') + ' · ' + esc(trainerName(m.trainer_id)) + '</small></div><button class="btn sm" data-missed="' + m.profile_id + '">' + ic('wa') + 'Remind</button></div>').join('') : '<div class="empty">No one is at risk.</div>') + '</section>' +
      '<section class="panel"><header><h3>Payments to collect</h3><span>' + (overdue.length + renew.length) + ' members</span></header>' +
      (overdue.concat(renew).length ? overdue.concat(renew).map((m) => { const p = X.paidState(m); return '<div class="li"><div class="grow"><b class="click" data-member="' + m.profile_id + '">' + esc(m.p.full_name) + '</b><small>' + esc(m.plan_name || 'Membership') + (m.fee_paise ? ' · ' + inr(m.fee_paise) : '') + '</small></div><span class="pill ' + p.cls + '">' + p.label + '</span><button class="btn sm" data-remind="' + m.profile_id + '">Remind</button></div>'; }).join('') : '<div class="empty">Everyone has paid.</div>') +
      (events.length ? '<header><h3>Coming events</h3><button class="btn sm" data-view="events">Manage</button></header>' + events.map((e) => '<div class="li"><div class="grow"><b>' + esc(e.title) + '</b><small>' + fmt(e.starts_on, true) + (e.starts_at ? ' · ' + e.starts_at.slice(0, 5) : '') + '</small></div></div>').join('') : '') + '</section></div>';
  }

  // ---------- members ----------
  async function vMembers() {
    if (sub) return vMember(sub);
    const P = await loadPeople(true); await loadActivity();
    const list = myList(P);
    return head('Members', list.length + ' members' + (!isAdmin ? (cache.filter === 'all' ? ' in the gym' : ' assigned to you') : ''), (isAdmin ? '<button class="btn dark" data-act="add-member">' + ic('plus') + 'Add member</button>' : '<button class="btn" data-act="toggle-mine">' + (cache.filter === 'all' ? 'Show my clients' : 'Show all members') + '</button>')) +
      '<input class="search" id="msearch" placeholder="Search by name or phone" aria-label="Search members">' +
      '<div class="table cards-sm"><table><thead><tr><th>Member</th><th>Last came</th><th>14 days</th><th>Weight now / ideal / target</th>' + (isAdmin ? '<th>Membership</th>' : '') + '<th></th></tr></thead><tbody>' +
      (list.length ? list.map((m) => {
        const c = actOf(m.profile_id), s = seen(c), p = X.paidState(m), id = X.idealOf(m);
        return '<tr class="click' + (m.p.active ? '' : ' off') + '" data-member="' + m.profile_id + '" data-q="' + esc((m.p.full_name + ' ' + m.p.phone).toLowerCase()) + '"><td><b>' + esc(m.p.full_name) + '</b><small>' + esc(m.p.phone) + ' · ' + esc(trainerName(m.trainer_id)) + ' · ' + (m.diet_type === 'veg' ? 'Veg' : 'Non-veg') + '</small></td>' +
          '<td data-l="Last came"><span class="pill ' + s.cls + '">' + s.label + '</span></td><td data-l="14 days">' + c.woDone + '/' + c.woPlanned + ' workouts · ' + (c.mealPct == null ? '—' : Math.round(c.mealPct * 100) + '% meals') + '</td>' +
          '<td data-l="Weight">' + kg(m.current_weight) + ' / ' + (id ? kg(id.w) : '—') + ' / ' + kg(m.target_weight) + '</td>' + (isAdmin ? '<td data-l="Fees"><span class="pill ' + p.cls + '">' + p.label + '</span></td>' : '') + '<td class="r go">' + ic('chev', 'ic sm') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">No members yet.</td></tr>') + '</tbody></table></div>';
  }

  async function vMember(id) {
    const P = await loadPeople(true), m = P.members.find((x) => x.profile_id === id); if (!m) return head('Member not found');
    const t = today(), tk = key(t), mt = cache.mtab || 'plan';
    await loadWorkouts();
    const [meals, wa, logs, weights, pays] = await Promise.all([
      q(sb.from('fq_member_meals').select('*').eq('member_id', id).gte('on_date', key(addDays(t, -3))).lte('on_date', key(addDays(t, 10)))),
      q(sb.from('fq_workout_assignments').select('*').eq('member_id', id).gte('on_date', key(addDays(t, -13))).lte('on_date', key(addDays(t, 10))).order('on_date').order('created_at')),
      q(sb.from('fq_diet_logs').select('*').eq('member_id', id).gte('on_date', key(addDays(t, -13)))),
      q(sb.from('fq_weight_logs').select('*').eq('member_id', id).order('on_date')),
      isAdmin ? q(sb.from('fq_payments').select('*').eq('member_id', id).order('paid_on', { ascending: false }).limit(10)) : Promise.resolve([]),
    ]);
    if (!cache.pday || cache.pdayFor !== id) { cache.pday = tk; cache.pdayFor = id; }
    cache.member = { m, meals, wa, logs, weights, pays };
    const c = X.consistency(wa.filter((x) => x.on_date <= tk), logs), s = seen(c);
    const tabs = [['plan', 'Diet and workouts'], ['progress', 'Progress']].concat(isAdmin ? [['membership', 'Membership']] : []);
    const body = mt === 'progress' ? progressTab(m, c, weights) : mt === 'membership' && isAdmin ? membershipTab(m, pays) : planTab(m, meals, wa, logs);
    return '<button class="backlink" data-view="members">' + ic('back') + 'All members</button>' +
      head(esc(m.p.full_name), esc(m.p.phone) + ' · ' + (m.diet_type === 'veg' ? 'Vegetarian' : 'Non-veg') + ' · ' + ({ lose: 'Lose weight', gain: 'Gain', fit: 'Stay fit' })[m.goal] + ' · trainer ' + esc(trainerName(m.trainer_id)) + (m.p.active ? '' : ' · <b>login off</b>') + ' · <span class="pill ' + s.cls + '">' + s.label + '</span>',
        '<button class="btn" data-missed="' + id + '">' + ic('wa') + 'WhatsApp reminder</button><button class="btn" data-act="body">Body and goal</button>' + (isAdmin ? '<button class="btn" data-act="edit-member">Edit</button>' : '')) +
      '<div class="tabs">' + tabs.map(([k, l]) => '<button class="' + (mt === k ? 'on' : '') + '" data-mtab="' + k + '">' + l + '</button>').join('') + '</div>' + body;
  }

  // plan tab: pick a day, edit that member's meals and workout for it
  function planTab(m, meals, wa, logs) {
    const t = today(), tk = key(t), dk = cache.pday, d = parse(dk);
    let strip = '';
    for (let i = -3; i <= 10; i++) {
      const x = addDays(t, i), xk = key(x), nm = meals.filter((r) => r.on_date === xk).length, w = wa.find((r) => r.on_date === xk);
      strip += '<button class="pday' + (xk === dk ? ' sel' : '') + (xk === tk ? ' today' : '') + (xk < tk ? ' past' : '') + '" data-pday="' + xk + '"><span>' + (xk === tk ? 'Today' : WD[dayIdx(x)]) + '</span><b>' + x.getDate() + '</b><small>' + (nm ? nm + ' meals' : 'no meals') + '</small><small class="' + (w ? 'w' : '') + '">' + (w ? esc(w.title) : 'rest') + '</small></button>';
    }
    const dm = meals.filter((r) => r.on_date === dk), dw = wa.filter((r) => r.on_date === dk), w = dw[0] || {}, canMark = dk <= tk;
    const mealRows = MEALS.map(([mid, name, time]) => {
      const r = dm.find((x) => x.meal === mid) || {}, st = (logs.find((x) => x.on_date === dk && x.meal === mid) || {}).status;
      return '<div class="mrow"><div class="ml">' + name + '<small>' + time + '</small></div><textarea name="i_' + mid + '" rows="2" placeholder="Items and quantity" aria-label="' + name + '">' + esc(r.items || '') + '</textarea>' +
        '<input name="k_' + mid + '" type="number" min="0" placeholder="kcal" value="' + (r.kcal ?? '') + '" aria-label="' + name + ' kcal"><input name="p_' + mid + '" type="number" min="0" placeholder="protein g" value="' + (r.protein_g ?? '') + '" aria-label="' + name + ' protein">' +
        (canMark && r.items ? '<button type="button" class="mst ' + (st || '') + '" data-dl="' + dk + '|' + mid + '" title="Tap to change">' + (st === 'done' ? 'Had' : st === 'skipped' ? 'Skipped' : 'Not marked') + '</button>' : '<span class="mst none">' + (canMark ? '' : 'Planned') + '</span>') + '</div>';
    }).join('');
    const kc = dm.reduce((s, x) => s + (x.kcal || 0), 0), pr = dm.reduce((s, x) => s + (x.protein_g || 0), 0);
    const lib = cache.workouts || [];
    const next3 = [1, 2, 3].map((i) => { const x = addDays(t, i), xk = key(x), nm = meals.filter((r) => r.on_date === xk), ww = wa.filter((r) => r.on_date === xk);
      return '<button class="n3' + (xk === dk ? ' sel' : '') + '" data-pday="' + xk + '"><b>' + (i === 1 ? 'Tomorrow' : WDL[dayIdx(x)]) + ' ' + x.getDate() + '</b><span>' + (nm.length ? nm.length + ' meals · ' + nm.reduce((s, r) => s + (r.kcal || 0), 0) + ' kcal' : 'No meals yet') + '</span><span>' + (ww.length ? esc(ww.map((r) => r.title).join(', ')) : 'Rest day') + '</span></button>'; }).join('');
    return '<div class="pstrip">' + strip + '</div>' +
      '<section class="panel"><header><h3>' + (dk === tk ? 'Today' : WDL[dayIdx(d)]) + ', ' + fmt(d, true) + '</h3><span>' + (kc ? kc + ' kcal' : '') + (pr ? ' · ' + pr + ' g protein' : '') + '</span></header>' +
      '<form class="pad form" id="f-day"><h4 class="sub4">Meals for ' + esc(first(m.p.full_name)) + ' <span class="muted small">(' + (m.diet_type === 'veg' ? 'vegetarian' : 'non-veg') + ')</span></h4>' + mealRows +
      '<div class="btns"><button type="button" class="btn sm" data-act="fill">Fill from template</button></div>' +
      '<h4 class="sub4">Workout</h4>' +
      (w.id && canMark ? '<div class="seg3 wst"><button type="button" class="' + (w.status === 'done' ? 'on ok' : '') + '" data-wa="' + w.id + '" data-v="done">Done</button><button type="button" class="' + (w.status === 'skipped' ? 'on no' : '') + '" data-wa="' + w.id + '" data-v="skipped">Skipped</button><span class="muted small">' + (w.status === 'assigned' ? 'Not marked yet' : w.status === 'done' ? 'Marked done' : 'Marked skipped') + '</span></div>' : '') +
      '<div class="two">' + select('From the library', 'wid', [['', w.id ? 'Keep as is' : 'Custom workout']].concat(lib.map((x) => [x.id, x.name])), '') + field('Title', 'title', w.title || '', 'placeholder="Leave empty for a rest day"') + '</div>' +
      area('Exercises: one per line, “name | sets”', 'ex', exText(w.exercises), 'rows="5" placeholder="Squat | 4 x 10\nLeg press | 3 x 12"') + field('Note for the member', 'note', w.note || '', 'placeholder="Optional"') +
      (dw.length > 1 ? '<p class="muted small">Also on this day: ' + dw.slice(1).map((x) => esc(x.title) + ' <button type="button" class="link" data-wadel="' + x.id + '">remove</button>').join(', ') + '</p>' : '') +
      '<div class="btns sticky"><button class="btn dark" type="submit">Save ' + (dk === tk ? 'today' : WD[dayIdx(d)] + ' ' + d.getDate()) + '</button><button type="button" class="btn" data-act="copy-day">' + ic('copy') + 'Copy to other days</button></div></form></section>' +
      '<h3 class="h3">Next 3 days</h3><div class="n3s">' + next3 + '</div>';
  }
  const exText = (ex) => (ex || []).map((e) => e.name + (e.sets ? ' | ' + e.sets : '')).join('\n');
  const exParse = (t) => String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [n, ...s] = l.split('|'); return { name: n.trim(), sets: s.join('|').trim() }; });

  async function saveDay(form) {
    const { m, meals, wa } = cache.member, dk = cache.pday, f = formData(form), b = form.querySelector('[type=submit]');
    const ups = [], dels = [];
    MEALS.forEach(([mid]) => {
      const items = f['i_' + mid];
      if (items) ups.push({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: dk, meal: mid, items, kcal: num(f['k_' + mid]), protein_g: num(f['p_' + mid]), updated_by: ME.user.id, updated_at: new Date().toISOString() });
      else if (meals.some((r) => r.on_date === dk && r.meal === mid)) dels.push(mid);
    });
    const w = wa.find((r) => r.on_date === dk), title = f.title;
    busy(b, true);
    try {
      if (ups.length) await q(sb.from('fq_member_meals').upsert(ups, { onConflict: 'member_id,on_date,meal' }));
      for (const mid of dels) await q(sb.from('fq_member_meals').delete().eq('member_id', m.profile_id).eq('on_date', dk).eq('meal', mid));
      const row = { title, exercises: exParse(f.ex), note: f.note || null, workout_id: f.wid || (w ? w.workout_id : null) };
      if (title && w) await q(sb.from('fq_workout_assignments').update(row).eq('id', w.id));
      else if (title) await q(sb.from('fq_workout_assignments').insert({ ...row, gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: dk, assigned_by: ME.user.id }));
      else if (w) await q(sb.from('fq_workout_assignments').delete().eq('id', w.id));
      toast('Saved. ' + first(m.p.full_name) + ' sees it now.'); go('members', m.profile_id, true);
    } catch (e) { fail(e); busy(b, false); }
  }
  function copySheet() {
    const { m, meals, wa } = cache.member, dk = cache.pday, src = parse(dk), t = today();
    const sm = meals.filter((r) => r.on_date === dk), sw = wa.filter((r) => r.on_date === dk);
    if (!sm.length && !sw.length) return toast('Save this day first, then copy it', true);
    const startD = src < t ? t : addDays(src, 1), days = Array.from({ length: 14 }, (_, i) => addDays(startD, i)).filter((x) => key(x) !== dk);
    sheet('<h3>Copy ' + (dk === key(t) ? 'today' : WDL[dayIdx(src)] + ' ' + src.getDate()) + ' to other days</h3><p class="muted small">Replaces what is planned on the days you pick. Ticks and marks already made are kept.</p><form class="form" id="f-copy">' +
      '<label class="chkline"><input type="checkbox" name="cm" checked ' + (sm.length ? '' : 'disabled') + '> Meals (' + sm.length + ')</label><label class="chkline"><input type="checkbox" name="cw" checked ' + (sw.length ? '' : 'disabled') + '> Workout' + (sw.length ? ' (' + esc(sw[0].title) + ')' : ' (rest day)') + '</label>' +
      '<div class="fld"><span>Days</span><div class="daypick">' + days.map((x, i) => '<label><input type="checkbox" name="d" value="' + key(x) + '"' + (i < 3 ? ' checked' : '') + '><span>' + WD[dayIdx(x)] + '<b>' + x.getDate() + '</b></span></label>').join('') + '</div></div>' +
      '<button class="btn dark">Copy</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const dates = $$('input[name=d]:checked', form).map((x) => x.value), cm = form.cm.checked && sm.length, cw = form.cw.checked && sw.length;
        if (!dates.length) return toast('Pick at least one day', true);
        if (!cm && !cw) return toast('Choose meals or workout to copy', true);
        const b = form.querySelector('button'); busy(b, true);
        try {
          if (cm) {
            for (const d of dates) await q(sb.from('fq_member_meals').delete().eq('member_id', m.profile_id).eq('on_date', d));
            await q(sb.from('fq_member_meals').insert(dates.flatMap((d) => sm.map((r) => ({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: d, meal: r.meal, items: r.items, kcal: r.kcal, protein_g: r.protein_g, updated_by: ME.user.id })))));
          }
          if (cw) {
            for (const d of dates) await q(sb.from('fq_workout_assignments').delete().eq('member_id', m.profile_id).eq('on_date', d).eq('status', 'assigned'));
            await q(sb.from('fq_workout_assignments').insert(dates.flatMap((d) => sw.map((w) => ({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: d, workout_id: w.workout_id, title: w.title, exercises: w.exercises, note: w.note, assigned_by: ME.user.id })))));
          }
          closeSheet(); toast('Copied to ' + dates.length + ' day' + (dates.length > 1 ? 's' : '')); go('members', m.profile_id, true);
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }
  async function fillSheet() {
    const { m } = cache.member, dk = cache.pday;
    const plans = await q(sb.from('fq_diet_plans').select('id, week_start, diet_type, fq_diet_items(*)').order('week_start', { ascending: false }));
    const pick = (type, d) => { const ws = key(monday(d)); const ps = plans.filter((p) => p.diet_type === type && p.fq_diet_items.length); return ps.find((p) => p.week_start === ws) || ps.find((p) => p.week_start <= ws) || ps[0]; };
    if (!plans.some((p) => p.fq_diet_items.length)) return toast('No diet templates yet. Make one in Diet templates.', true);
    sheet('<h3>Fill from a template</h3><p class="muted small">Templates are starting points. Change anything after filling.</p><form class="form" id="f-fill">' +
      select('Template', 'type', [['veg', 'Vegetarian'], ['nonveg', 'Non-veg']], m.diet_type) +
      '<label class="chkline"><input type="radio" name="span" value="1" checked> Fill this day on screen (then edit and save)</label><label class="chkline"><input type="radio" name="span" value="7"> Save 7 days from this day straight away (days with meals are left alone)</label>' +
      '<button class="btn dark">Fill</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const type = form.type.value, span = +form.span.value, b = form.querySelector('button');
        if (span === 1) {
          const d = parse(dk), p = pick(type, d); if (!p) return toast('No ' + (type === 'veg' ? 'veg' : 'non-veg') + ' template yet', true);
          p.fq_diet_items.filter((x) => x.day === dayIdx(d)).forEach((x) => { const f = $('#f-day', root); f['i_' + x.meal].value = x.items; f['k_' + x.meal].value = x.kcal ?? ''; f['p_' + x.meal].value = x.protein_g ?? ''; });
          closeSheet(); return toast('Filled. Edit if needed, then press Save.');
        }
        busy(b, true);
        try {
          const dates = Array.from({ length: 7 }, (_, i) => addDays(parse(dk), i));
          const have = await q(sb.from('fq_member_meals').select('on_date').eq('member_id', m.profile_id).gte('on_date', key(dates[0])).lte('on_date', key(dates[6])));
          const rows = [];
          dates.filter((d) => !have.some((h) => h.on_date === key(d))).forEach((d) => { const p = pick(type, d); if (p) p.fq_diet_items.filter((x) => x.day === dayIdx(d)).forEach((x) => rows.push({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: key(d), meal: x.meal, items: x.items, kcal: x.kcal, protein_g: x.protein_g, updated_by: ME.user.id })); });
          if (rows.length) await q(sb.from('fq_member_meals').insert(rows));
          closeSheet(); toast(rows.length ? 'Meals saved for ' + new Set(rows.map((r) => r.on_date)).size + ' days' : 'Every day already had meals'); go('members', m.profile_id, true);
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }

  function progressTab(m, c, weights) {
    const g = X.goalStats(m, c.mealPct), id = X.idealOf(m), bmi = X.bmiOf(m);
    return '<div class="kpis k5"><div><span>Current</span><b>' + kg(m.current_weight) + '</b></div><div><span>Ideal</span><b>' + (id ? kg(id.w) : '—') + '</b><small>' + (id ? (id.set ? 'set by trainer' : 'from height') : 'add height') + '</small></div><div><span>Target</span><b>' + kg(m.target_weight) + '</b></div><div><span>Start</span><b>' + kg(m.start_weight) + '</b></div><div><span>BMI</span><b>' + (bmi ? bmi.toFixed(1) : '—') + '</b><small>' + (id && id.range ? 'healthy ' + id.range.lo + '–' + id.range.hi + ' kg' : '') + '</small></div></div>' +
      (g ? '<div class="panel pad"><b>' + Math.round(g.pct) + '% to target</b> · ' + g.moved.toFixed(1) + ' kg ' + (g.gain ? 'gained' : 'lost') + ', ' + g.toGo.toFixed(1) + ' kg to go' + X.bar(g.pct, 'green') + '<small class="muted">' + (g.eta ? 'At this pace: target around ' + fmt(g.eta, true) + '.' : 'At this pace the target is not in reach yet.') + '</small></div>' : '<div class="panel pad muted">Add start and target weight in “Body and goal” to track progress.</div>') +
      '<div class="cols2"><section class="panel"><header><h3>Consistency</h3><span>Last 14 days</span></header><div class="pad">' + X.consistencyChart(c) +
      '<div class="stat4"><div><b>' + c.woDone + '/' + c.woPlanned + '</b><span>workouts done</span></div><div><b>' + (c.mealPct == null ? '—' : Math.round(c.mealPct * 100) + '%') + '</b><span>meals had</span></div><div><b>' + c.streak + '</b><span>workouts in a row</span></div><div><b>' + (c.lastDone ? (c.daysSince === 0 ? 'Today' : c.daysSince + 'd ago') : '—') + '</b><span>last came</span></div></div></div></section>' +
      '<section class="panel"><header><h3>Weight</h3><button class="btn sm" data-act="weigh">Log weight</button></header><div class="pad">' + X.weightChart(weights, num(m.target_weight)) + '</div>' +
      (weights.length ? weights.slice(-4).reverse().map((w) => '<div class="li"><div class="grow"><b>' + kg(w.weight) + '</b><small>' + fmt(w.on_date, true) + '</small></div></div>').join('') : '') + '</section></div>';
  }

  function membershipTab(m, pays) {
    const p = X.paidState(m);
    return '<div class="cols2"><section class="panel"><header><h3>Membership</h3><span class="pill ' + p.cls + '">' + p.label + '</span></header><div class="pad"><p>' + esc(m.plan_name || 'No plan') + (m.fee_paise ? ' · ' + inr(m.fee_paise) : '') + (m.paid_until ? ' · paid till ' + fmt(m.paid_until, true) : '') + '</p><div class="btns"><button class="btn dark" data-act="pay">Record payment</button><button class="btn" data-remind="' + m.profile_id + '">Payment reminder</button></div></div>' +
      (pays.length ? pays.map((x) => '<div class="li"><div class="grow"><b>' + inr(x.amount_paise) + '</b><small>' + fmt(x.paid_on, true) + ' · till ' + fmt(x.period_until, true) + (x.method ? ' · ' + esc(x.method) : '') + '</small></div></div>').join('') : '<div class="empty">No payments recorded yet.</div>') + '</section>' +
      '<section class="panel"><header><h3>Login</h3></header><div class="pad btns"><button class="btn" data-act="reset-pw">Reset password</button><button class="btn" data-act="toggle-active">' + (m.p.active ? 'Switch off login' : 'Switch on login') + '</button><button class="btn danger" data-remove="' + m.profile_id + '">Remove member</button></div></section></div>';
  }

  // ---------- trainers (owner) ----------
  async function vTrainers() {
    const P = await loadPeople(true);
    const list = P.trainers.filter((x) => x.p.role === 'trainer');
    return head('Trainers', list.length + ' trainers', '<button class="btn dark" data-act="add-trainer">' + ic('plus') + 'Add trainer</button>') +
      '<div class="cards">' + (list.length ? list.map(({ p, t }) => '<div class="tcard' + (p.active ? '' : ' off') + '"><div class="row0"><span class="av">' + X.initials(p.full_name) + '</span><div><b>' + esc(p.full_name) + '</b><small>' + esc(t.speciality || 'Trainer') + (p.active ? '' : ' · login off') + '</small></div></div>' +
        '<dl><dt>Mobile</dt><dd>' + esc(p.phone) + '</dd>' + (t.experience_years != null ? '<dt>Experience</dt><dd>' + t.experience_years + ' yrs</dd>' : '') + (t.certifications ? '<dt>Certified</dt><dd>' + esc(t.certifications) + '</dd>' : '') + (t.slots ? '<dt>Floor hours</dt><dd>' + esc(t.slots) + '</dd>' : '') + '<dt>Clients</dt><dd>' + P.members.filter((m) => m.trainer_id === p.id).length + '</dd></dl>' +
        '<div class="btns"><button class="btn sm" data-edit-trainer="' + p.id + '">Edit</button><button class="btn sm" data-reset="' + p.id + '">Reset password</button><button class="btn sm danger" data-remove="' + p.id + '">Remove</button></div></div>').join('') : '<div class="empty">No trainers yet. Add your first trainer.</div>') + '</div>';
  }
  async function trainerSheet(id) {
    const P = await loadPeople(), x = id ? P.trainers.find((t) => t.p.id === id) : null, t = x ? x.t : {};
    sheet('<h3>' + (x ? 'Edit ' + esc(x.p.full_name) : 'Add trainer') + '</h3><form class="form">' +
      '<div class="two">' + field('Full name', 'name', x ? x.p.full_name : '', 'required') + field('Mobile number (login)', 'phone', x ? x.p.phone : '', 'required inputmode="numeric" placeholder="10 digits"') + '</div>' +
      (x ? '' : field('Temporary password', 'password', genPass(), 'required minlength="8"')) +
      '<div class="two">' + field('Speciality', 'speciality', t.speciality, 'placeholder="Strength, fat loss…"') + field('Experience (years)', 'exp', t.experience_years, 'type="number" min="0" max="60"') + '</div>' +
      field('Certifications', 'certs', t.certifications) + field('Floor hours', 'slots', t.slots, 'placeholder="6–10 am, 5–9 pm"') + area('Short bio', 'bio', t.bio, 'rows="2"') + '<button class="btn dark">' + (x ? 'Save' : 'Create login') + '</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(form), b = form.querySelector('button');
        if (X.phone10(d.phone).length !== 10) return toast('Enter a 10-digit mobile number', true);
        busy(b, true);
        const det = { speciality: d.speciality || null, experience_years: num(d.exp), certifications: d.certs || null, slots: d.slots || null, bio: d.bio || null };
        try {
          if (x) {
            if (d.name !== x.p.full_name || X.phone10(d.phone) !== x.p.phone) await X.adminCall({ action: 'update_user', user_id: id, full_name: d.name, phone: d.phone });
            await q(sb.from('fq_trainers').upsert({ profile_id: id, gym_id: ME.profile.gym_id, ...det }));
            closeSheet(); toast('Saved');
          } else { await X.adminCall({ action: 'create_user', role: 'trainer', full_name: d.name, phone: d.phone, password: d.password, trainer: det }); closeSheet(); credSheet(d.name, d.phone, d.password); }
          cache.people = null; go('trainers');
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }
  function removeSheet(id) {
    const P = cache.people, p = P.byId[id], n = P.members.filter((m) => m.trainer_id === id).length, isTr = p.role === 'trainer';
    sheet('<h3>Remove ' + esc(p.full_name) + '?</h3><p>' + (isTr ? 'Their login is deleted. ' + (n ? 'Their ' + n + ' client' + (n > 1 ? 's' : '') + ' stay in the gym with no trainer, so assign them to someone else.' : 'They have no clients.') + ' Workouts they wrote stay.' : 'Their login, plan, ticks, weights and payments are deleted. This can’t be undone.') + '</p><div class="btns"><button class="btn danger" data-yes>Remove</button><button class="btn" data-close>Cancel</button></div>', (el) => {
      el.querySelector('[data-yes]').addEventListener('click', async (e) => {
        busy(e.target, true);
        try { await X.adminCall({ action: 'remove_user', user_id: id }); closeSheet(); toast(p.full_name + ' removed'); cache.people = null; go(isTr ? 'trainers' : 'members'); } catch (err) { fail(err); busy(e.target, false); }
      });
    });
  }

  // ---------- fee plans (owner) ----------
  async function vFees() {
    const P = await loadPeople(true);
    return head('Fee plans', 'What members pay. Members see the active plans in their app.', '<button class="btn dark" data-act="add-fee">' + ic('plus') + 'Add plan</button>') +
      '<div class="table cards-sm"><table><thead><tr><th>Plan</th><th>Duration</th><th class="r">Fee</th><th class="r">Per month</th><th>Members</th><th>Status</th><th></th></tr></thead><tbody>' +
      (P.plans.length ? P.plans.map((f) => '<tr><td><b>' + esc(f.name) + '</b><small>' + esc(f.details || '') + '</small></td><td data-l="Duration">' + f.months + ' month' + (f.months > 1 ? 's' : '') + '</td><td class="r" data-l="Fee">' + inr(f.fee_paise) + '</td><td class="r" data-l="Per month">' + inr(f.fee_paise / f.months) + '</td><td data-l="Members">' + P.members.filter((m) => m.fee_plan_id === f.id).length + '</td><td data-l="Status"><span class="pill ' + (f.active ? 'ok' : '') + '">' + (f.active ? 'Offered' : 'Hidden') + '</span></td><td class="r"><button class="btn sm" data-edit-fee="' + f.id + '">Edit</button></td></tr>').join('') : '<tr><td colspan="7" class="empty">No fee plans yet. Add Monthly, Quarterly and so on.</td></tr>') + '</tbody></table></div>';
  }
  function feeSheet(f) {
    f = f || {};
    sheet('<h3>' + (f.id ? 'Edit ' + esc(f.name) : 'Add fee plan') + '</h3><form class="form">' + field('Name', 'name', f.name, 'required placeholder="e.g. Quarterly"') +
      '<div class="two">' + field('Months', 'months', f.months || 1, 'type="number" min="1" max="36" required') + field('Fee (₹)', 'fee', f.fee_paise != null ? f.fee_paise / 100 : '', 'type="number" min="0" required') + '</div>' +
      field('What’s included', 'details', f.details, 'placeholder="e.g. Gym floor + 1 diet consult"') + '<label class="chkline"><input type="checkbox" name="active"' + (f.active === false ? '' : ' checked') + '> Offer this plan to members</label>' +
      '<div class="btns"><button class="btn dark">Save</button>' + (f.id ? '<button type="button" class="btn danger" data-delfee>Delete</button>' : '') + '</div></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(form), b = form.querySelector('button'), months = num(d.months), fee = num(d.fee);
        if (!(months >= 1 && months <= 36)) return toast('Months must be between 1 and 36', true);
        if (fee == null || fee < 0) return toast('Enter the fee', true);
        busy(b, true); const row = { gym_id: ME.profile.gym_id, name: d.name, months, fee_paise: Math.round(fee * 100), details: d.details || null, active: !!form.active.checked };
        try { if (f.id) await q(sb.from('fq_fee_plans').update(row).eq('id', f.id)); else await q(sb.from('fq_fee_plans').insert(row)); closeSheet(); toast('Fee plan saved'); go('fees'); } catch (err) { fail(err); busy(b, false); }
      });
      const del = el.querySelector('[data-delfee]'); if (del) del.addEventListener('click', async () => { try { await q(sb.from('fq_fee_plans').delete().eq('id', f.id)); closeSheet(); toast('Deleted. Members on it keep their current fee.'); go('fees'); } catch (err) { fail(err); } });
    });
  }

  // ---------- gym details and opening hours (owner) ----------
  async function vGymProfile() {
    const g = ME.gym, sc = X.schedOf(g) || WD.map((_, i) => (i === 6 ? { closed: false, slots: [['06:00', '12:00']] } : { closed: false, slots: [['05:30', '10:30'], ['16:00', '22:00']] }));
    const row = (s, i) => { const a = s.slots[0] || ['', ''], b = s.slots[1] || ['', ''];
      return '<div class="hrow' + (s.closed ? ' closed' : '') + '" data-hday="' + i + '"><b>' + WDL[i] + '</b><label class="chkline"><input type="checkbox" name="c' + i + '"' + (s.closed ? ' checked' : '') + '> Closed</label>' +
        '<span class="slot"><input type="time" name="o' + i + 'a" value="' + a[0] + '" aria-label="' + WDL[i] + ' opens"><span>to</span><input type="time" name="o' + i + 'b" value="' + a[1] + '" aria-label="' + WDL[i] + ' closes"></span>' +
        '<span class="slot"><input type="time" name="e' + i + 'a" value="' + b[0] + '" aria-label="' + WDL[i] + ' reopens"><span>to</span><input type="time" name="e' + i + 'b" value="' + b[1] + '" aria-label="' + WDL[i] + ' closes again"></span></div>'; };
    const st = X.openState(X.schedOf(g));
    return head('Gym and hours', 'Shown in every member’s Gym tab.' + (st ? ' Right now: ' + st.text + '.' : '')) +
      '<form class="panel pad form narrow" id="f-gym">' + field('Gym name', 'name', g.name, 'required') + field('Address', 'address', g.address) + field('Phone', 'phone', g.phone) + area('About', 'about', g.about, 'rows="3"') +
      '<h4 class="sub4">Opening hours</h4><p class="muted small">Morning and evening sessions. Leave the second session empty if the gym stays open all day.</p><div class="hours">' + sc.map(row).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn sm" data-act="same-hours">Copy Monday to Tuesday–Saturday</button></div>' +
      '<button class="btn dark">Save gym details</button></form>';
  }
  function readHours(form) {
    const sc = [];
    for (let i = 0; i < 7; i++) {
      const closed = form['c' + i].checked, slots = [];
      for (const s of ['o', 'e']) {
        const a = form[s + i + 'a'].value, b = form[s + i + 'b'].value;
        if (!a && !b) continue;
        if (!a || !b) throw new Error(WDL[i] + ': fill both the opening and closing time');
        if (b <= a) throw new Error(WDL[i] + ': closing time must be after opening time');
        slots.push([a, b]);
      }
      if (slots.length === 2 && slots[1][0] < slots[0][1]) throw new Error(WDL[i] + ': the evening session overlaps the morning one');
      if (!closed && !slots.length) throw new Error(WDL[i] + ': add opening hours or tick Closed');
      sc.push({ closed, slots: closed ? [] : slots });
    }
    return sc;
  }
  async function saveGym(form) {
    const d = formData(form), b = form.querySelector('button:not([type=button])');
    let sc; try { sc = readHours(form); } catch (e) { return toast(e.message, true); }
    busy(b, true);
    const row = { name: d.name, address: d.address || null, phone: d.phone || null, about: d.about || null, schedule: sc, hours: X.hoursSummary(sc) };
    try { await q(sb.from('fq_gyms').update(row).eq('id', ME.gym.id)); Object.assign(ME.gym, row); toast('Gym details saved'); go('gymprofile'); } catch (err) { fail(err); busy(b, false); }
  }

  // ---------- facilities, events, messages (owner) ----------
  async function vFacilities() {
    const fs = await q(sb.from('fq_facilities').select('*').order('category').order('name'));
    return head('Facilities', 'Equipment and amenities members see in their app.', '<button class="btn dark" data-act="add-facility">' + ic('plus') + 'Add</button>') +
      '<div class="table cards-sm"><table><thead><tr><th>Name</th><th>Category</th><th class="r">Qty</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>' + (fs.length ? fs.map((f) => '<tr><td><b>' + esc(f.name) + '</b></td><td data-l="Category">' + esc(f.category || '') + '</td><td class="r" data-l="Qty">' + f.quantity + '</td><td data-l="Status"><span class="pill ' + (f.status === 'ok' ? 'ok' : f.status === 'new' ? 'ac' : 'wa') + '">' + ({ ok: 'In service', new: 'New', maintenance: 'Under repair' })[f.status] + '</span></td><td data-l="Note">' + esc(f.note || '') + '</td><td class="r"><button class="btn sm" data-edit-fac="' + f.id + '">Edit</button></td></tr>').join('') : '<tr><td colspan="6" class="empty">Nothing added yet.</td></tr>') + '</tbody></table></div>';
  }
  function facilitySheet(f) {
    f = f || {};
    sheet('<h3>' + (f.id ? 'Edit' : 'Add') + ' facility</h3><form class="form">' + field('Name', 'name', f.name, 'required placeholder="e.g. Treadmill"') + '<div class="two">' + field('Category', 'category', f.category, 'placeholder="Cardio, Strength…"') + field('Quantity', 'quantity', f.quantity ?? 1, 'type="number" min="0"') + '</div>' +
      select('Status', 'status', [['ok', 'In service'], ['new', 'New'], ['maintenance', 'Under repair']], f.status || 'ok') + field('Note for members', 'note', f.note) + '<div class="btns"><button class="btn dark">Save</button>' + (f.id ? '<button type="button" class="btn danger" data-delfac>Delete</button>' : '') + '</div></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true); const row = { gym_id: ME.profile.gym_id, name: d.name, category: d.category || null, quantity: num(d.quantity) ?? 1, status: d.status, note: d.note || null };
        try { if (f.id) await q(sb.from('fq_facilities').update(row).eq('id', f.id)); else await q(sb.from('fq_facilities').insert(row)); closeSheet(); toast('Saved'); go('facilities'); } catch (err) { fail(err); busy(b, false); } });
      const del = el.querySelector('[data-delfac]'); if (del) del.addEventListener('click', async () => { try { await q(sb.from('fq_facilities').delete().eq('id', f.id)); closeSheet(); toast('Deleted'); go('facilities'); } catch (err) { fail(err); } });
    });
  }
  async function vEvents() {
    const es = await q(sb.from('fq_events').select('*').gte('starts_on', key(addDays(today(), -30))).order('starts_on'));
    return head('Events', 'Members see upcoming events on their Today screen.', '<button class="btn dark" data-act="add-event">' + ic('plus') + 'New event</button>') +
      '<div class="panel">' + (es.length ? es.map((e) => '<div class="li' + (e.starts_on < key(today()) ? ' off' : '') + '"><div class="date"><b>' + parse(e.starts_on).getDate() + '</b><span>' + X.MO[parse(e.starts_on).getMonth()] + '</span></div><div class="grow"><b>' + esc(e.title) + '</b><small>' + (e.starts_at ? e.starts_at.slice(0, 5) + ' · ' : '') + esc(e.details || '') + '</small></div><button class="btn sm" data-edit-event="' + e.id + '">Edit</button></div>').join('') : '<div class="empty">No events yet.</div>') + '</div>';
  }
  function eventSheet(ev) {
    ev = ev || {};
    sheet('<h3>' + (ev.id ? 'Edit event' : 'New event') + '</h3><form class="form">' + field('Title', 'title', ev.title, 'required placeholder="e.g. Sunday bootcamp"') + '<div class="two">' + field('Date', 'date', ev.starts_on || key(addDays(today(), 7)), 'type="date" required') + field('Time', 'time', ev.starts_at ? ev.starts_at.slice(0, 5) : '', 'type="time"') + '</div>' +
      area('Details', 'details', ev.details, 'rows="3"') + (ev.id ? '' : '<label class="chkline"><input type="checkbox" name="notify" checked> Also send it to every member as a message</label>') + '<div class="btns"><button class="btn dark">Save</button>' + (ev.id ? '<button type="button" class="btn danger" data-delev>Delete</button>' : '') + '</div></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true); const row = { gym_id: ME.profile.gym_id, title: d.title, starts_on: d.date, starts_at: d.time || null, details: d.details || null };
        try { if (ev.id) await q(sb.from('fq_events').update(row).eq('id', ev.id)); else { await q(sb.from('fq_events').insert({ ...row, created_by: ME.user.id })); if (d.notify) await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, kind: 'event', title: d.title + ' · ' + fmt(d.date), body: d.details || null, created_by: ME.user.id })); }
          closeSheet(); toast('Event saved'); go('events'); } catch (err) { fail(err); busy(b, false); } });
      const del = el.querySelector('[data-delev]'); if (del) del.addEventListener('click', async () => { try { await q(sb.from('fq_events').delete().eq('id', ev.id)); closeSheet(); toast('Deleted'); go('events'); } catch (err) { fail(err); } });
    });
  }
  async function vMessages() {
    const [ns, P] = await Promise.all([q(sb.from('fq_notices').select('*').order('created_at', { ascending: false }).limit(50)), loadPeople()]);
    const K = { payment: ['Payment', 'wa'], event: ['Event', 'ac'], general: ['Message', ''], attendance: ['Missed you', 'no'] };
    return head('Messages', 'Messages appear in members’ apps. Reminders go only to that member.', '<button class="btn dark" data-act="add-notice">' + ic('plus') + 'New message</button>') +
      '<div class="panel">' + (ns.length ? ns.map((n) => '<div class="li"><span class="pill ' + K[n.kind][1] + '">' + K[n.kind][0] + '</span><div class="grow"><b>' + esc(n.title) + '</b><small>' + (n.member_id ? 'To ' + esc((P.byId[n.member_id] || {}).full_name || 'member') : 'To everyone') + ' · ' + fmt(key(new Date(n.created_at))) + (n.body ? ' · ' + esc(n.body) : '') + '</small></div><button class="iconbtn" data-delnotice="' + n.id + '" aria-label="Delete">' + ic('x') + '</button></div>').join('') : '<div class="empty">No messages sent yet.</div>') + '</div>';
  }
  async function noticeSheet() {
    const P = await loadPeople();
    sheet('<h3>New message</h3><form class="form">' + select('Send to', 'to', [['', 'Everyone']].concat(P.members.map((m) => [m.profile_id, m.p.full_name])), '') + field('Title', 'title', '', 'required placeholder="e.g. Gym closed on Sunday"') + area('Message', 'body', '', 'rows="3"') + '<button class="btn dark">Send</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true);
        try { await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, member_id: d.to || null, kind: 'general', title: d.title, body: d.body || null, created_by: ME.user.id })); closeSheet(); toast('Sent'); go('messages'); } catch (err) { fail(err); busy(b, false); } });
    });
  }

  // ---------- diet templates ----------
  async function vTemplates() {
    const off = cache.dietOff || 0, type = cache.dietType || 'veg', ws = addDays(monday(today()), off * 7);
    const plan = await q(sb.from('fq_diet_plans').select('id, fq_diet_items(*)').eq('week_start', key(ws)).eq('diet_type', type).maybeSingle());
    const it = (d, meal) => (plan ? plan.fq_diet_items.find((x) => x.day === d && x.meal === meal) : null) || {};
    let g = '<div class="pgrid"><div class="h"></div>' + WD.map((d, i) => '<div class="h">' + d + ' ' + addDays(ws, i).getDate() + '</div>').join('');
    MEALS.forEach(([mid, name, time]) => {
      g += '<div class="ml">' + name + '<small>' + time + '</small></div>';
      for (let i = 0; i < 7; i++) { const x = it(i, mid); g += '<div class="pc"><textarea data-c="' + i + '|' + mid + '" rows="3" placeholder="Items" aria-label="' + WDL[i] + ' ' + name + '">' + esc(x.items || '') + '</textarea><input data-k="' + i + '|' + mid + '" type="number" min="0" placeholder="kcal" value="' + (x.kcal ?? '') + '" aria-label="kcal"></div>'; }
    });
    g += '</div>';
    return head('Diet templates', 'Starting points only. Members get the meals you set on their own page; use “Fill from template” there and then adjust for each person.',
      '<button class="btn" data-act="paste">Paste from sheet</button><button class="btn" data-act="copy-prev">Copy last week</button><button class="btn dark" data-act="save-plan">Save template</button>') +
      '<div class="toolbar"><div class="seg2"><button class="' + (type === 'veg' ? 'on' : '') + '" data-dtype="veg">Vegetarian</button><button class="' + (type === 'nonveg' ? 'on' : '') + '" data-dtype="nonveg">Non-veg</button></div>' +
      '<div class="seg2">' + [[-1, 'Last week'], [0, 'This week'], [1, 'Next week'], [2, 'Week after']].map(([o, l]) => '<button class="' + (o === off ? 'on' : '') + '" data-doff="' + o + '">' + l + '</button>').join('') + '</div>' +
      '<span class="muted small">Week of ' + fmt(ws, true) + (plan ? ' · saved' : ' · empty') + '</span></div>' + '<div class="table">' + g + '</div>';
  }
  async function savePlan(btn) {
    const off = cache.dietOff || 0, type = cache.dietType || 'veg', ws = key(addDays(monday(today()), off * 7)), rows = [];
    $$('[data-c]', root).forEach((ta) => { const [d, meal] = ta.dataset.c.split('|'); const items = ta.value.trim(); if (!items) return; const k = $('[data-k="' + ta.dataset.c + '"]', root).value; rows.push({ day: +d, meal, items, kcal: k ? +k : null }); });
    if (!rows.length) return toast('Add at least one meal before saving', true);
    busy(btn, true);
    try {
      const plan = await q(sb.from('fq_diet_plans').upsert({ gym_id: ME.profile.gym_id, week_start: ws, diet_type: type, created_by: ME.user.id, updated_at: new Date().toISOString() }, { onConflict: 'gym_id,week_start,diet_type' }).select('id').single());
      await q(sb.from('fq_diet_items').delete().eq('plan_id', plan.id));
      await q(sb.from('fq_diet_items').insert(rows.map((r) => ({ ...r, plan_id: plan.id, gym_id: ME.profile.gym_id }))));
      toast('Template saved'); go('templates');
    } catch (e) { fail(e); busy(btn, false); }
  }
  async function copyPrev() {
    const off = cache.dietOff || 0, type = cache.dietType || 'veg', prev = key(addDays(monday(today()), (off - 1) * 7));
    const p = await q(sb.from('fq_diet_plans').select('fq_diet_items(*)').eq('week_start', prev).eq('diet_type', type).maybeSingle());
    if (!p || !p.fq_diet_items.length) return toast('There is no template for the week before to copy', true);
    p.fq_diet_items.forEach((x) => { const ta = $('[data-c="' + x.day + '|' + x.meal + '"]', root), k = $('[data-k="' + x.day + '|' + x.meal + '"]', root); if (ta) ta.value = x.items; if (k) k.value = x.kcal ?? ''; });
    toast('Copied. Check it, then press Save.');
  }
  function pasteSheet() {
    sheet('<h3>Paste from a spreadsheet</h3><p class="muted small">One row per meal: <b>day, meal, items, kcal</b>. Day is Mon–Sun; meal is Breakfast, Mid-morning, Lunch, Snack or Dinner.</p><form class="form" id="f-paste"><textarea name="t" rows="10" placeholder="Mon\tBreakfast\tIdli x3, sambar\t320"></textarea><button class="btn dark">Fill the template</button></form>', (w) => {
      w.querySelector('#f-paste').addEventListener('submit', (e) => {
        e.preventDefault(); let n = 0;
        e.target.t.value.split(/\r?\n/).forEach((line) => {
          const c = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim().replace(/^"|"$/g, ''));
          const d = WD.findIndex((x) => c[0] && c[0].slice(0, 3).toLowerCase() === x.toLowerCase()); if (d < 0) return;
          const mm = (c[1] || '').toLowerCase().replace(/[^a-z]/g, ''); const meal = (MEALS.find(([id, name]) => id === mm || name.toLowerCase().replace(/[^a-z]/g, '') === mm || (mm.startsWith('snack') && id === 'snack')) || [])[0]; if (!meal) return;
          const ta = $('[data-c="' + d + '|' + meal + '"]', root); if (!ta) return; ta.value = c[2] || ''; const k = $('[data-k="' + d + '|' + meal + '"]', root); if (k && c[3]) k.value = parseInt(c[3], 10) || ''; n++;
        });
        closeSheet(); toast(n ? n + ' meals filled. Press Save.' : 'No rows matched the format', !n);
      });
    });
  }

  // ---------- workouts library ----------
  async function vWorkouts() {
    const ws = await loadWorkouts(true);
    return head('Workouts', 'Your library. Pick one when planning a member’s day.', '<button class="btn dark" data-act="add-workout">' + ic('plus') + 'New workout</button>') +
      '<div class="cards">' + (ws.length ? ws.map((w) => '<div class="tcard"><b>' + esc(w.name) + '</b><small>' + esc(w.focus || '') + (w.duration_min ? ' · ' + w.duration_min + ' min' : '') + '</small><div class="exs">' + (w.exercises || []).map((e) => '<div><span>' + esc(e.name) + '</span><span>' + esc(e.sets || '') + '</span></div>').join('') + '</div><div class="btns"><button class="btn sm" data-edit-workout="' + w.id + '">Edit</button><button class="btn sm danger" data-del-workout="' + w.id + '">Delete</button></div></div>').join('') : '<div class="empty">No workouts yet.</div>') + '</div>';
  }
  function workoutSheet(w) {
    w = w || {};
    sheet('<h3>' + (w.id ? 'Edit workout' : 'New workout') + '</h3><form class="form" id="f-workout">' + field('Name', 'name', w.name, 'required placeholder="e.g. Legs day"') + '<div class="two">' + field('Focus', 'focus', w.focus, 'placeholder="Strength, fat loss…"') + field('Minutes', 'duration', w.duration_min, 'type="number" min="0"') + '</div>' +
      area('Exercises: one per line, “name | sets”', 'ex', exText(w.exercises), 'rows="7" placeholder="Squat | 4 x 10\nLeg press | 3 x 12"') + '<button class="btn dark">Save workout</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = formData(e.target), b = e.target.querySelector('button'); busy(b, true);
        const row = { gym_id: ME.profile.gym_id, name: f.name, focus: f.focus || null, duration_min: num(f.duration), exercises: exParse(f.ex) };
        try { if (w.id) await q(sb.from('fq_workouts').update(row).eq('id', w.id)); else await q(sb.from('fq_workouts').insert({ ...row, created_by: ME.user.id })); closeSheet(); toast('Workout saved'); go('workouts'); }
        catch (err) { fail(err); busy(b, false); }
      });
    });
  }

  // ---------- member forms ----------
  async function memberSheet(m) {
    const P = await loadPeople(), edit = !!m; m = m || {};
    const tOpts = [['', 'No trainer']].concat(P.trainers.filter((x) => x.p.role === 'trainer' && x.p.active).map((x) => [x.p.id, x.p.full_name]));
    const plans = P.plans.filter((f) => f.active || f.id === m.fee_plan_id);
    sheet('<h3>' + (edit ? 'Edit ' + esc(m.p.full_name) : 'Add member') + '</h3><form class="form">' +
      '<div class="two">' + field('Full name', 'name', edit ? m.p.full_name : '', 'required autocomplete="off"') + field('Mobile number (login)', 'phone', edit ? m.p.phone : '', 'required inputmode="numeric" placeholder="10 digits"') + '</div>' +
      (edit ? '' : field('Temporary password', 'password', genPass(), 'required minlength="8"') + '<p class="muted small" style="margin-top:-6px">Give this to the member. They can change it in the app.</p>') +
      '<div class="two">' + select('Trainer', 'trainer', tOpts, m.trainer_id || '') + select('Diet', 'diet', [['veg', 'Vegetarian'], ['nonveg', 'Non-veg']], m.diet_type || 'veg') + '</div>' +
      '<div class="two">' + select('Goal', 'goal', [['lose', 'Lose weight'], ['gain', 'Gain muscle / weight'], ['fit', 'Stay fit']], m.goal || 'lose') + field('Height (cm)', 'height', m.height_cm, 'type="number" min="100" max="230"') + '</div>' +
      '<div class="two">' + field('Starting weight (kg)', 'start', m.start_weight, 'type="number" step="0.1" min="20" max="350"') + field('Target weight (kg)', 'target', m.target_weight, 'type="number" step="0.1" min="20" max="350"') + '</div>' +
      '<div class="two">' + select('Fee plan', 'feeplan', [['', 'Custom']].concat(plans.map((f) => [f.id, f.name + ' · ' + inr(f.fee_paise)])), m.fee_plan_id || '') + field('Fee (₹)', 'fee', m.fee_paise != null ? m.fee_paise / 100 : '', 'type="number" min="0"') + '</div>' +
      field('Paid until', 'paid', m.paid_until || '', 'type="date"') + '<div class="btns"><button class="btn dark">' + (edit ? 'Save changes' : 'Create login') + '</button>' + (edit ? '<button type="button" class="btn danger" data-remove="' + m.profile_id + '">Remove member</button>' : '') + '</div></form>', (el) => {
      const form = el.querySelector('form');
      form.feeplan.addEventListener('change', () => { const f = P.plans.find((x) => x.id === form.feeplan.value); if (f) form.fee.value = f.fee_paise / 100; });
      const rm = form.querySelector('[data-remove]'); if (rm) rm.addEventListener('click', () => removeSheet(m.profile_id));
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(form), b = form.querySelector('button');
        if (X.phone10(d.phone).length !== 10) return toast('Enter a 10-digit mobile number', true);
        const fp = P.plans.find((x) => x.id === d.feeplan);
        const details = { trainer_id: d.trainer || null, diet_type: d.diet, goal: d.goal, height_cm: num(d.height), start_weight: num(d.start), target_weight: num(d.target), fee_plan_id: fp ? fp.id : null, plan_name: fp ? fp.name : (edit ? m.plan_name : 'Custom'), fee_paise: d.fee ? Math.round(+d.fee * 100) : null, paid_until: d.paid || null };
        busy(b, true);
        try {
          if (edit) {
            if (d.name !== m.p.full_name || X.phone10(d.phone) !== m.p.phone) await X.adminCall({ action: 'update_user', user_id: m.profile_id, full_name: d.name, phone: d.phone });
            await q(sb.from('fq_members').update(details).eq('profile_id', m.profile_id)); closeSheet(); toast('Saved'); cache.people = null; go('members', m.profile_id);
          } else {
            const r = await X.adminCall({ action: 'create_user', role: 'member', full_name: d.name, phone: d.phone, password: d.password, member: { ...details, fee_rupees: d.fee } });
            closeSheet(); credSheet(d.name, d.phone, d.password); cache.people = null; cache.mtab = 'plan'; go('members', r.id);
          }
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }
  function bodySheet() {
    const { m } = cache.member, id = X.idealOf({ height_cm: m.height_cm });
    sheet('<h3>Body and goal · ' + esc(m.p.full_name) + '</h3><form class="form">' +
      '<div class="two">' + field('Height (cm)', 'height', m.height_cm, 'type="number" min="100" max="230"') + select('Goal', 'goal', [['lose', 'Lose weight'], ['gain', 'Gain muscle / weight'], ['fit', 'Stay fit']], m.goal) + '</div>' +
      '<div class="two">' + field('Starting weight (kg)', 'start', m.start_weight, 'type="number" step="0.1" min="20" max="350"') + field('Target weight (kg)', 'target', m.target_weight, 'type="number" step="0.1" min="20" max="350"') + '</div>' +
      '<div class="two">' + field('Ideal weight (kg)', 'ideal', m.ideal_weight, 'type="number" step="0.1" min="20" max="350" placeholder="' + (id ? 'Auto: ' + id.w : 'Auto from height') + '"') + select('Diet', 'diet', [['veg', 'Vegetarian'], ['nonveg', 'Non-veg']], m.diet_type) + '</div>' +
      '<p class="muted small">Leave ideal weight empty to use the healthy range for the member’s height.</p><button class="btn dark">Save</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button');
        for (const [k, lo, hi, label] of [['height', 100, 230, 'Height'], ['start', 20, 350, 'Starting weight'], ['target', 20, 350, 'Target weight'], ['ideal', 20, 350, 'Ideal weight']]) { const v = num(d[k]); if (v != null && (v < lo || v > hi)) return toast(label + ' looks wrong', true); }
        busy(b, true);
        try { await q(sb.from('fq_members').update({ height_cm: num(d.height), goal: d.goal, start_weight: num(d.start), target_weight: num(d.target), ideal_weight: num(d.ideal), diet_type: d.diet }).eq('profile_id', m.profile_id)); closeSheet(); toast('Saved'); go('members', m.profile_id, true); } catch (err) { fail(err); busy(b, false); }
      });
    });
  }
  function genPass() { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); r.forEach((n) => (s += a[n % a.length])); return 'Fit-' + s.slice(0, 4) + '-' + s.slice(4, 8); }
  function credSheet(name, phone, pass) {
    const link = location.origin + location.pathname;
    const msg = 'Hi ' + first(name) + ', your ' + ME.gym.name + ' app login is ready.\nOpen: ' + link + '\nMobile: ' + X.phone10(phone) + '\nPassword: ' + pass + '\nPlease change the password after signing in.';
    sheet('<h3>Login created</h3><p class="muted small">Send these to ' + esc(name) + '. The password is shown only now.</p><pre class="cred">' + esc(msg) + '</pre><div class="btns"><button class="btn dark" data-copy>Copy message</button><a class="btn" target="_blank" rel="noopener" href="' + X.waLink(phone, msg) + '">Send on WhatsApp</a></div>', (el) => {
      el.querySelector('[data-copy]').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(msg); e.target.textContent = 'Copied'; } catch (err) { const r = document.createRange(); r.selectNodeContents(el.querySelector('pre')); getSelection().removeAllRanges(); getSelection().addRange(r); } });
    });
  }
  function resetSheet(id, name) {
    const p = genPass();
    sheet('<h3>Reset password for ' + esc(name) + '</h3><form class="form">' + field('New password', 'password', p, 'required minlength="8"') + '<button class="btn dark">Set password</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button'); busy(b, true);
        try { await X.adminCall({ action: 'reset_password', user_id: id, password: d.password }); closeSheet(); const pr = cache.people.byId[id]; credSheet(name, pr ? pr.phone : '', d.password); } catch (err) { fail(err); busy(b, false); } });
    });
  }
  function paySheet() {
    const { m } = cache.member, P = cache.people, fp = P.plans.find((x) => x.id === m.fee_plan_id), from = m.paid_until && parse(m.paid_until) > today() ? parse(m.paid_until) : today();
    const months = fp ? fp.months : ({ Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Annual: 12 }[m.plan_name] || 1);
    const until = new Date(from); until.setMonth(until.getMonth() + months);
    sheet('<h3>Record payment · ' + esc(m.p.full_name) + '</h3><form class="form"><div class="two">' + field('Amount (₹)', 'amount', m.fee_paise ? m.fee_paise / 100 : fp ? fp.fee_paise / 100 : '', 'type="number" min="1" required') + field('Paid on', 'on', key(today()), 'type="date" required') + '</div>' +
      '<div class="two">' + field('Covers until', 'until', key(until), 'type="date" required') + select('Method', 'method', [['UPI', 'UPI'], ['Cash', 'Cash'], ['Card', 'Card'], ['Bank transfer', 'Bank transfer']], 'UPI') + '</div>' + field('Note', 'note', '') + '<button class="btn dark">Save payment</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button'); busy(b, true);
        try { await q(sb.from('fq_payments').insert({ gym_id: ME.profile.gym_id, member_id: m.profile_id, amount_paise: Math.round(+d.amount * 100), paid_on: d.on, period_until: d.until, method: d.method, note: d.note || null, recorded_by: ME.user.id })); closeSheet(); toast('Payment saved'); go('members', m.profile_id, true); } catch (err) { fail(err); busy(b, false); } });
    });
  }
  async function remind(id) {
    const P = await loadPeople(), m = P.members.find((x) => x.profile_id === id); if (!m) return;
    const p = X.paidState(m), amt = m.fee_paise ? inr(m.fee_paise) : 'your membership fee';
    const body = (p.days != null && p.days < 0 ? 'Your membership expired on ' + fmt(m.paid_until, true) + '. ' : m.paid_until ? 'Your membership is due on ' + fmt(m.paid_until, true) + '. ' : '') + 'Please pay ' + amt + ' at the desk or by UPI. Thank you!';
    sheet('<h3>Payment reminder · ' + esc(m.p.full_name) + '</h3><p class="muted small">It appears in their app straight away. You can also send it on WhatsApp.</p><pre class="cred">' + esc(body) + '</pre><div class="btns"><button class="btn dark" data-send>Send in app</button><a class="btn" target="_blank" rel="noopener" href="' + X.waLink(m.p.phone, 'Hi ' + first(m.p.full_name) + ', ' + body + ' – ' + ME.gym.name) + '">WhatsApp too</a></div>', (el) => {
      el.querySelector('[data-send]').addEventListener('click', async (e) => { busy(e.target, true); try { await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, member_id: id, kind: 'payment', title: 'Membership payment ' + (p.days != null && p.days < 0 ? 'overdue' : 'due'), body, created_by: ME.user.id })); closeSheet(); toast('Reminder sent to ' + first(m.p.full_name)); } catch (err) { fail(err); busy(e.target, false); } });
    });
  }
  function weighSheet() {
    const { m } = cache.member;
    sheet('<h3>Log weight · ' + esc(m.p.full_name) + '</h3><form class="form"><div class="two">' + field('Weight (kg)', 'w', m.current_weight || '', 'type="number" step="0.1" min="20" max="350" required inputmode="decimal"') + field('Date', 'd', key(today()), 'type="date" required max="' + key(today()) + '"') + '</div><button class="btn dark">Save</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button'), w = num(d.w);
        if (!(w >= 20 && w <= 350)) return toast('Enter the weight in kg', true);
        busy(b, true);
        try { await q(sb.from('fq_weight_logs').upsert({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: d.d, weight: w, recorded_by: ME.user.id }, { onConflict: 'member_id,on_date' })); closeSheet(); toast('Weight saved'); go('members', m.profile_id, true); } catch (err) { fail(err); busy(b, false); } });
    });
  }

  const VIEWS = { today: vToday, overview: vOverview, cperf: vClientPerf, tperf: vTrainerPerf, members: vMembers, trainers: vTrainers, fees: vFees, gymprofile: vGymProfile, facilities: vFacilities, events: vEvents, messages: vMessages, templates: vTemplates, workouts: vWorkouts };

  async function onClick(e) {
    const b = e.target.closest('button,[data-member]'); if (!b || !root.contains(b)) return;
    const d = b.dataset;
    try {
      if (d.view) return go(d.view);
      if (d.win) { cache.win = +d.win; return go(view); }
      if (d.ctrainer) { cache.ctrainer = d.ctrainer; return go('cperf'); }
      if (d.member) { cache.mtab = 'plan'; return go('members', d.member); }
      if (d.plan) { const [mid, day] = d.plan.split('|'); cache.mtab = 'plan'; cache.pday = day; cache.pdayFor = mid; return go('members', mid); }
      if (d.mtab) { cache.mtab = d.mtab; return go('members', sub, true); }
      if (d.pday) { cache.pday = d.pday; return go('members', sub, true); }
      if (d.act === 'out') { await sb.auth.signOut(); location.reload(); return; }
      if (d.act === 'pw') return X.changePasswordSheet();
      if (d.act === 'add-member') return memberSheet();
      if (d.act === 'edit-member') return memberSheet(cache.member.m);
      if (d.act === 'body') return bodySheet();
      if (d.act === 'toggle-mine') { cache.filter = cache.filter === 'all' ? 'mine' : 'all'; return go(view); }
      if (d.act === 'add-trainer') return trainerSheet();
      if (d.editTrainer) return trainerSheet(d.editTrainer);
      if (d.remove) return removeSheet(d.remove);
      if (d.reset) return resetSheet(d.reset, cache.people.byId[d.reset].full_name);
      if (d.act === 'reset-pw') return resetSheet(cache.member.m.profile_id, cache.member.m.p.full_name);
      if (d.act === 'toggle-active') { const m = cache.member.m; busy(b, true); await X.adminCall({ action: 'set_active', user_id: m.profile_id, active: !m.p.active }); toast(m.p.active ? 'Login switched off' : 'Login switched on'); return go('members', m.profile_id, true); }
      if (d.act === 'pay') return paySheet();
      if (d.remind) return remind(d.remind);
      if (d.missed) { if (!cache.act) await loadActivity(); return missedSheet(d.missed); }
      if (d.act === 'weigh') return weighSheet();
      if (d.act === 'copy-day') return copySheet();
      if (d.act === 'fill') return fillSheet();
      if (d.wa) { const w = cache.member.wa.find((x) => x.id === d.wa), v = w.status === d.v ? 'assigned' : d.v; busy(b, true); await q(sb.from('fq_workout_assignments').update({ status: v, marked_by: ME.user.id, marked_at: new Date().toISOString() }).eq('id', d.wa)); toast(v === 'done' ? 'Marked done' : v === 'skipped' ? 'Marked skipped' : 'Cleared'); return go('members', cache.member.m.profile_id, true); }
      if (d.wadel) { await q(sb.from('fq_workout_assignments').delete().eq('id', d.wadel)); toast('Removed'); return go('members', cache.member.m.profile_id, true); }
      if (d.dl) {
        const [dk, meal] = d.dl.split('|'), mm = cache.member, cur = (mm.logs.find((x) => x.on_date === dk && x.meal === meal) || {}).status;
        const next = cur === 'done' ? 'skipped' : cur === 'skipped' ? null : 'done';
        if (next) await q(sb.from('fq_diet_logs').upsert({ member_id: mm.m.profile_id, gym_id: ME.profile.gym_id, on_date: dk, meal, status: next, updated_at: new Date().toISOString() }));
        else await q(sb.from('fq_diet_logs').delete().eq('member_id', mm.m.profile_id).eq('on_date', dk).eq('meal', meal));
        mm.logs = mm.logs.filter((x) => !(x.on_date === dk && x.meal === meal)); if (next) mm.logs.push({ on_date: dk, meal, status: next });
        b.className = 'mst ' + (next || ''); b.textContent = next === 'done' ? 'Had' : next === 'skipped' ? 'Skipped' : 'Not marked'; return;
      }
      if (d.dtype) { cache.dietType = d.dtype; return go('templates'); }
      if (d.doff) { cache.dietOff = +d.doff; return go('templates'); }
      if (d.act === 'save-plan') return savePlan(b);
      if (d.act === 'copy-prev') return copyPrev();
      if (d.act === 'paste') return pasteSheet();
      if (d.act === 'add-workout') return workoutSheet();
      if (d.editWorkout) return workoutSheet(cache.workouts.find((w) => w.id === d.editWorkout));
      if (d.delWorkout) { await q(sb.from('fq_workouts').delete().eq('id', d.delWorkout)); toast('Deleted'); return go('workouts'); }
      if (d.act === 'add-fee') return feeSheet();
      if (d.editFee) return feeSheet(cache.people.plans.find((f) => f.id === d.editFee));
      if (d.act === 'same-hours') { const f = $('#f-gym', root); for (let i = 1; i <= 5; i++) { f['c' + i].checked = f.c0.checked; ['oa', 'ob', 'ea', 'eb'].forEach((s) => (f[s[0] + i + s[1]].value = f[s[0] + '0' + s[1]].value)); } return toast('Copied. Press Save to keep it.'); }
      if (d.act === 'add-facility') return facilitySheet();
      if (d.editFac) { const f = await q(sb.from('fq_facilities').select('*').eq('id', d.editFac).single()); return facilitySheet(f); }
      if (d.act === 'add-event') return eventSheet();
      if (d.editEvent) { const ev = await q(sb.from('fq_events').select('*').eq('id', d.editEvent).single()); return eventSheet(ev); }
      if (d.act === 'add-notice') return noticeSheet();
      if (d.delnotice) { await q(sb.from('fq_notices').delete().eq('id', d.delnotice)); toast('Deleted'); return go('messages'); }
    } catch (err) { fail(err); busy(b, false); }
  }

  async function start(me, el) {
    ME = me; isAdmin = me.profile.role === 'admin'; root = el; root.className = 'staff';
    view = isAdmin ? 'overview' : 'today';
    loadWorkouts().catch(() => {});
    root.addEventListener('click', onClick);
    root.addEventListener('input', (e) => { if (e.target.id === 'msearch') { const v = e.target.value.toLowerCase(); $$('tr[data-q]', root).forEach((tr) => (tr.hidden = !tr.dataset.q.includes(v))); } });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'ctrainer') { cache.ctrainer = e.target.value; return go('cperf'); }
      const f = e.target.form;
      if (f && f.id === 'f-day' && e.target.name === 'wid') { const w = (cache.workouts || []).find((x) => x.id === e.target.value); if (w) { f.title.value = w.name; f.ex.value = exText(w.exercises); } }
      if (f && f.id === 'f-gym' && /^c\d$/.test(e.target.name)) e.target.closest('.hrow').classList.toggle('closed', e.target.checked);
    });
    root.addEventListener('submit', (e) => {
      if (e.target.id === 'f-gym') { e.preventDefault(); return saveGym(e.target); }
      if (e.target.id === 'f-day') { e.preventDefault(); return saveDay(e.target); }
    });
    go(view);
  }
  window.FQStaff = { start };
})();
