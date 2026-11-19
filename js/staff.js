/* Fitcheq staff console: trainers and the gym owner (admin). Admin-only sections are hidden for trainers;
   the database enforces the same rules. */
(function () {
  const X = window.FQX, { sb, esc, $, $$, key, parse, today, addDays, monday, dayIdx, WD, WDL, fmt, inr, MEALS, ic, q, toast, fail, num, kg, sheet, closeSheet, field, area, select, formData, busy } = X;
  let ME, isAdmin, root, view = 'members', sub = null, cache = {};

  // ---------- data ----------
  async function loadPeople(force) {
    if (cache.people && !force) return cache.people;
    const [profiles, members, trainers] = await Promise.all([
      q(sb.from('fq_profiles').select('*').order('full_name')),
      q(sb.from('fq_members').select('*')),
      q(sb.from('fq_trainers').select('*')),
    ]);
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    cache.people = {
      profiles, byId,
      members: members.map((m) => ({ ...m, p: byId[m.profile_id] })).filter((m) => m.p).sort((a, b) => a.p.full_name.localeCompare(b.p.full_name)),
      trainers: profiles.filter((p) => p.role !== 'member').map((p) => ({ p, t: trainers.find((t) => t.profile_id === p.id) || {} })),
    };
    return cache.people;
  }
  const trainerName = (id) => (cache.people && cache.people.byId[id] ? cache.people.byId[id].full_name : '—');
  async function loadWorkouts(force) { if (!cache.workouts || force) cache.workouts = await q(sb.from('fq_workouts').select('*').order('name')); return cache.workouts; }

  // ---------- layout ----------
  const NAV_T = [['members', 'Members', 'users'], ['diet', 'Diet plans', 'diet'], ['workouts', 'Workouts', 'workout']];
  const NAV_A = [['overview', 'Overview', 'home'], ['members', 'Members', 'users'], ['trainers', 'Trainers', 'star'], ['diet', 'Diet plans', 'diet'], ['workouts', 'Workouts', 'workout'], ['facilities', 'Facilities', 'gym'], ['events', 'Events', 'calendar'], ['messages', 'Messages', 'bell'], ['gymprofile', 'Gym profile', 'settings']];
  function shell(inner) {
    const nav = isAdmin ? NAV_A : NAV_T;
    root.innerHTML = '<aside class="snav"><div class="brand">fitcheq<span>.</span></div><div class="who">' + esc(ME.gym.name) + '<br><span>' + esc(ME.profile.full_name) + ' · ' + (isAdmin ? 'Owner' : 'Trainer') + '</span></div>' +
      nav.map((n) => '<button class="nav' + (view === n[0] ? ' on' : '') + '" data-view="' + n[0] + '">' + ic(n[2]) + '<span>' + n[1] + '</span></button>').join('') +
      '<div class="navfoot"><button class="nav" data-act="pw">' + ic('settings') + '<span>Password</span></button><button class="nav" data-act="out">' + ic('back') + '<span>Sign out</span></button></div></aside><main class="smain">' + inner + '</main>';
  }
  const head = (title, sub, actions) => '<div class="shead"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="btns">' + actions + '</div>' : '') + '</div>';
  async function go(v, s) {
    view = v; sub = s || null;
    shell('<div class="loading">Loading…</div>');
    try { const fn = VIEWS[v] || VIEWS.members; shell(await fn()); $('.smain', root).scrollTop = 0; }
    catch (e) { fail(e); shell(head('Something went wrong', 'Please refresh the page.')); }
  }

  // ---------- overview (admin) ----------
  async function vOverview() {
    const P = await loadPeople(true), t = key(today());
    const [logs, wa, events] = await Promise.all([
      q(sb.from('fq_diet_logs').select('member_id, status, on_date').gte('on_date', key(addDays(today(), -6)))),
      q(sb.from('fq_workout_assignments').select('member_id, status, on_date').eq('on_date', t)),
      q(sb.from('fq_events').select('*').gte('starts_on', t).order('starts_on').limit(5)),
    ]);
    const unpaid = P.members.filter((m) => X.paidState(m).cls !== 'ok');
    const due = unpaid.reduce((s, m) => s + (m.fee_paise || 0), 0);
    const adh = logs.length ? Math.round((logs.filter((l) => l.status === 'done').length / logs.length) * 100) : null;
    const woDone = wa.filter((w) => w.status === 'done').length;
    return head('Good to see you', fmt(today(), true) + ' · ' + esc(ME.gym.name), '<button class="btn dark" data-act="add-member">' + ic('plus') + 'Add member</button>') +
      '<div class="kpis"><div><span>Active members</span><b>' + P.members.filter((m) => m.p.active).length + '</b></div><div><span>Trainers</span><b>' + P.trainers.filter((x) => x.p.role === 'trainer').length + '</b></div>' +
      '<div><span>Meals followed, 7 days</span><b>' + (adh == null ? '—' : adh + '%') + '</b></div><div><span>Workouts done today</span><b>' + woDone + ' / ' + wa.length + '</b></div></div>' +
      '<div class="cols2"><section class="panel"><header><h3>Payments to collect</h3><span>' + unpaid.length + ' members · ' + inr(due) + '</span></header>' +
      (unpaid.length ? unpaid.map((m) => { const p = X.paidState(m); return '<div class="li"><div class="grow"><b>' + esc(m.p.full_name) + '</b><small>' + esc(m.plan_name || 'Membership') + (m.fee_paise ? ' · ' + inr(m.fee_paise) : '') + '</small></div><span class="pill ' + p.cls + '">' + p.label + '</span><button class="btn sm" data-remind="' + m.profile_id + '">Remind</button></div>'; }).join('') : '<div class="empty">Everyone has paid.</div>') + '</section>' +
      '<section class="panel"><header><h3>Coming events</h3><button class="btn sm" data-view="events">Manage</button></header>' + (events.length ? events.map((e) => '<div class="li"><div class="grow"><b>' + esc(e.title) + '</b><small>' + fmt(e.starts_on, true) + (e.starts_at ? ' · ' + e.starts_at.slice(0, 5) : '') + '</small></div></div>').join('') : '<div class="empty">No events planned.</div>') + '</section></div>';
  }

  // ---------- members ----------
  async function vMembers() {
    if (sub) return vMember(sub);
    const P = await loadPeople(true), t = key(today());
    const [logs, wa] = await Promise.all([q(sb.from('fq_diet_logs').select('member_id, status').eq('on_date', t)), q(sb.from('fq_workout_assignments').select('member_id, status').eq('on_date', t))]);
    const mine = !isAdmin && cache.filter !== 'all' ? P.members.filter((m) => m.trainer_id === ME.user.id) : P.members;
    const list = (mine.length || isAdmin ? mine : P.members);
    return head('Members', list.length + ' members' + (!isAdmin ? (cache.filter === 'all' ? ' in the gym' : ' assigned to you') : ''), (isAdmin ? '<button class="btn dark" data-act="add-member">' + ic('plus') + 'Add member</button>' : '<button class="btn" data-act="toggle-mine">' + (cache.filter === 'all' ? 'Show my clients' : 'Show all members') + '</button>')) +
      '<input class="search" id="msearch" placeholder="Search by name or phone" aria-label="Search members">' +
      '<div class="table"><table><thead><tr><th>Member</th><th>Diet</th><th>Today’s meals</th><th>Today’s workout</th><th>Goal</th>' + (isAdmin ? '<th>Membership</th>' : '') + '<th></th></tr></thead><tbody>' +
      (list.length ? list.map((m) => {
        const l = logs.filter((x) => x.member_id === m.profile_id), w = wa.find((x) => x.member_id === m.profile_id), g = X.goalStats(m), p = X.paidState(m);
        return '<tr class="click' + (m.p.active ? '' : ' off') + '" data-member="' + m.profile_id + '" data-q="' + esc((m.p.full_name + ' ' + m.p.phone).toLowerCase()) + '"><td><b>' + esc(m.p.full_name) + '</b><small>' + esc(m.p.phone) + ' · ' + esc(trainerName(m.trainer_id)) + '</small></td><td>' + (m.diet_type === 'veg' ? 'Veg' : 'Non-veg') + '</td>' +
          '<td>' + l.filter((x) => x.status === 'done').length + ' had · ' + l.filter((x) => x.status === 'skipped').length + ' skipped</td><td>' + (w ? '<span class="pill ' + (w.status === 'done' ? 'ok' : w.status === 'skipped' ? 'no' : '') + '">' + (w.status === 'assigned' ? 'To do' : w.status === 'done' ? 'Done' : 'Skipped') + '</span>' : '<span class="muted">None</span>') + '</td>' +
          '<td>' + (g ? Math.round(g.pct) + '% · ' + g.toGo.toFixed(1) + ' kg to go' : '<span class="muted">No target</span>') + '</td>' + (isAdmin ? '<td><span class="pill ' + p.cls + '">' + p.label + '</span></td>' : '') + '<td class="r">' + ic('chev', 'ic sm') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">No members yet.</td></tr>') + '</tbody></table></div>';
  }

  async function vMember(id) {
    const P = await loadPeople(true), m = P.members.find((x) => x.profile_id === id); if (!m) return head('Member not found');
    const t = today(), from = key(addDays(t, -6)), to = key(addDays(t, 7)), wk = monday(t);
    const [logs, wa, weights, pays, plan] = await Promise.all([
      q(sb.from('fq_diet_logs').select('*').eq('member_id', id).gte('on_date', key(addDays(t, -13)))),
      q(sb.from('fq_workout_assignments').select('*').eq('member_id', id).gte('on_date', from).lte('on_date', to).order('on_date')),
      q(sb.from('fq_weight_logs').select('*').eq('member_id', id).order('on_date')),
      isAdmin ? q(sb.from('fq_payments').select('*').eq('member_id', id).order('paid_on', { ascending: false }).limit(10)) : Promise.resolve([]),
      q(sb.from('fq_diet_plans').select('id, week_start, fq_diet_items(day, meal, items)').eq('week_start', key(wk)).eq('diet_type', m.diet_type).maybeSingle()),
    ]);
    cache.member = { m, logs, wa };
    const l14 = logs.filter((x) => x.on_date >= key(addDays(t, -13)));
    const adh = l14.length ? l14.filter((x) => x.status === 'done').length / l14.length : null;
    const g = X.goalStats(m, adh), p = X.paidState(m);
    // diet grid for this week
    let grid = '<div class="dgrid"><div class="h"></div>' + WD.map((d, i) => '<div class="h' + (key(addDays(wk, i)) === key(t) ? ' today' : '') + '">' + d + ' ' + addDays(wk, i).getDate() + '</div>').join('');
    MEALS.forEach(([mid, name]) => {
      grid += '<div class="ml">' + name + '</div>';
      for (let i = 0; i < 7; i++) {
        const d = addDays(wk, i), dk = key(d), s = (logs.find((x) => x.on_date === dk && x.meal === mid) || {}).status;
        const item = plan && plan.fq_diet_items.find((x) => x.day === i && x.meal === mid);
        grid += d > t ? '<div class="cell fut" title="' + esc(item ? item.items : '') + '">·</div>' : '<button class="cell ' + (s || '') + '" data-dl="' + dk + '|' + mid + '" title="' + esc(item ? item.items : 'No plan item') + '">' + (s === 'done' ? '✓' : s === 'skipped' ? '✕' : '–') + '</button>';
      }
    });
    grid += '</div>';
    const woRow = (w) => '<div class="li"><div class="date"><b>' + parse(w.on_date).getDate() + '</b><span>' + WD[dayIdx(parse(w.on_date))] + '</span></div><div class="grow"><b>' + esc(w.title) + '</b><small>' + ((w.exercises || []).map((e) => e.name).join(', ') || esc(w.note || '')) + '</small></div>' +
      (w.on_date <= key(t) ? '<div class="seg3"><button class="' + (w.status === 'done' ? 'on ok' : '') + '" data-wa="' + w.id + '" data-v="done">Done</button><button class="' + (w.status === 'skipped' ? 'on no' : '') + '" data-wa="' + w.id + '" data-v="skipped">Skipped</button></div>' : '<span class="pill">Assigned</span>') +
      '<button class="iconbtn" data-wadel="' + w.id + '" aria-label="Remove workout">' + ic('x') + '</button></div>';
    return '<button class="backlink" data-view="members">' + ic('back') + 'All members</button>' +
      head(esc(m.p.full_name), esc(m.p.phone) + ' · ' + (m.diet_type === 'veg' ? 'Vegetarian' : 'Non-veg') + ' · ' + ({ lose: 'Lose weight', gain: 'Gain', fit: 'Stay fit' })[m.goal] + ' · trainer ' + esc(trainerName(m.trainer_id)) + (m.p.active ? '' : ' · <b>login off</b>'),
        '<button class="btn dark" data-act="assign">' + ic('plus') + 'Assign workout</button><button class="btn" data-act="weigh">Log weight</button>' + (isAdmin ? '<button class="btn" data-act="edit-member">Edit</button>' : '')) +
      '<div class="kpis"><div><span>Start</span><b>' + kg(m.start_weight) + '</b></div><div><span>Now</span><b>' + kg(m.current_weight) + '</b></div><div><span>Target</span><b>' + kg(m.target_weight) + '</b></div><div><span>Meals followed, 14 days</span><b>' + (adh == null ? '—' : Math.round(adh * 100) + '%') + '</b></div></div>' +
      (g ? '<div class="panel pad"><b>' + Math.round(g.pct) + '% to goal</b> · ' + g.moved.toFixed(1) + ' kg ' + (g.gain ? 'gained' : 'lost') + ', ' + g.toGo.toFixed(1) + ' kg to go' + X.bar(g.pct, 'green') + '<small class="muted">' + (g.eta ? 'At this pace: target around ' + fmt(g.eta, true) + '.' : 'At this pace the target is not in reach yet.') + (g.etaFull ? ' Following every meal: ' + fmt(g.etaFull, true) + '.' : '') + '</small></div>' : '') +
      '<div class="cols2"><section class="panel"><header><h3>Workouts</h3><span>Last 7 and next 7 days</span></header>' + (wa.length ? wa.map(woRow).join('') : '<div class="empty">No workouts assigned. Use “Assign workout”.</div>') + '</section>' +
      '<section class="panel"><header><h3>Diet this week</h3><span>Tap a cell to mark had / skipped</span></header><div class="pad">' + (plan ? grid : '<div class="empty">No ' + (m.diet_type === 'veg' ? 'veg' : 'non-veg') + ' plan loaded for this week. Load one in Diet plans.</div>') + '</div></section></div>' +
      '<div class="cols2"><section class="panel"><header><h3>Weight</h3><span>' + weights.length + ' weigh-ins</span></header><div class="pad">' + X.weightChart(weights, num(m.target_weight)) + '</div></section>' +
      (isAdmin ? '<section class="panel"><header><h3>Membership</h3><span class="pill ' + p.cls + '">' + p.label + '</span></header><div class="pad"><div class="btns"><button class="btn dark" data-act="pay">Record payment</button><button class="btn" data-remind="' + id + '">Send reminder</button></div></div>' +
        (pays.length ? pays.map((x) => '<div class="li"><div class="grow"><b>' + inr(x.amount_paise) + '</b><small>' + fmt(x.paid_on, true) + ' · till ' + fmt(x.period_until, true) + (x.method ? ' · ' + esc(x.method) : '') + '</small></div></div>').join('') : '<div class="empty">No payments recorded yet.</div>') +
        '<div class="pad btns"><button class="btn sm" data-act="reset-pw">Reset password</button><button class="btn sm" data-act="toggle-active">' + (m.p.active ? 'Switch off login' : 'Switch on login') + '</button></div></section>' : '<section></section>') + '</div>';
  }

  // ---------- trainers (admin) ----------
  async function vTrainers() {
    const P = await loadPeople(true);
    return head('Trainers', P.trainers.filter((x) => x.p.role === 'trainer').length + ' trainers', '<button class="btn dark" data-act="add-trainer">' + ic('plus') + 'Add trainer</button>') +
      '<div class="cards">' + P.trainers.map(({ p, t }) => '<div class="tcard' + (p.active ? '' : ' off') + '"><div class="row0"><span class="av">' + X.initials(p.full_name) + '</span><div><b>' + esc(p.full_name) + '</b><small>' + (p.role === 'admin' ? 'Owner' : esc(t.speciality || 'Trainer')) + '</small></div></div>' +
        '<dl><dt>Phone</dt><dd>' + esc(p.phone) + '</dd>' + (t.experience_years != null ? '<dt>Experience</dt><dd>' + t.experience_years + ' yrs</dd>' : '') + (t.certifications ? '<dt>Certified</dt><dd>' + esc(t.certifications) + '</dd>' : '') + (t.slots ? '<dt>Floor hours</dt><dd>' + esc(t.slots) + '</dd>' : '') + '<dt>Clients</dt><dd>' + P.members.filter((m) => m.trainer_id === p.id).length + '</dd></dl>' +
        (p.role === 'trainer' ? '<div class="btns"><button class="btn sm" data-edit-trainer="' + p.id + '">Edit</button><button class="btn sm" data-reset="' + p.id + '">Reset password</button></div>' : '') + '</div>').join('') + '</div>';
  }

  // ---------- diet plans ----------
  async function vDiet() {
    const off = cache.dietOff || 0, type = cache.dietType || 'veg', ws = addDays(monday(today()), off * 7);
    const plan = await q(sb.from('fq_diet_plans').select('id, fq_diet_items(*)').eq('week_start', key(ws)).eq('diet_type', type).maybeSingle());
    const P = await loadPeople(), count = P.members.filter((m) => m.diet_type === type && m.p.active).length;
    const it = (d, meal) => (plan ? plan.fq_diet_items.find((x) => x.day === d && x.meal === meal) : null) || {};
    let g = '<div class="pgrid"><div class="h"></div>' + WD.map((d, i) => '<div class="h">' + d + ' ' + addDays(ws, i).getDate() + '</div>').join('');
    MEALS.forEach(([mid, name, time]) => {
      g += '<div class="ml">' + name + '<small>' + time + '</small></div>';
      for (let i = 0; i < 7; i++) { const x = it(i, mid); g += '<div class="pc"><textarea data-c="' + i + '|' + mid + '" rows="3" placeholder="Items" aria-label="' + WDL[i] + ' ' + name + '">' + esc(x.items || '') + '</textarea><input data-k="' + i + '|' + mid + '" type="number" min="0" placeholder="kcal" value="' + (x.kcal ?? '') + '" aria-label="kcal"></div>'; }
    });
    g += '</div>';
    return head('Diet plans', 'One plan per week for each diet. It goes to every member on that diet automatically.',
      '<button class="btn" data-act="paste">Paste from sheet</button><button class="btn" data-act="copy-prev">Copy last week</button><button class="btn dark" data-act="save-plan">Save and send to ' + count + ' members</button>') +
      '<div class="toolbar"><div class="seg2"><button class="' + (type === 'veg' ? 'on' : '') + '" data-dtype="veg">Vegetarian</button><button class="' + (type === 'nonveg' ? 'on' : '') + '" data-dtype="nonveg">Non-veg</button></div>' +
      '<div class="seg2">' + [[-1, 'Last week'], [0, 'This week'], [1, 'Next week'], [2, 'Week after']].map(([o, l]) => '<button class="' + (o === off ? 'on' : '') + '" data-doff="' + o + '">' + l + '</button>').join('') + '</div>' +
      '<span class="muted small">Week of ' + fmt(ws, true) + (plan ? ' · saved' : ' · not loaded yet') + '</span></div>' +
      '<div class="table">' + g + '</div>';
  }
  async function savePlan(btn) {
    const off = cache.dietOff || 0, type = cache.dietType || 'veg', ws = key(addDays(monday(today()), off * 7));
    const rows = [];
    $$('[data-c]', root).forEach((ta) => { const [d, meal] = ta.dataset.c.split('|'); const items = ta.value.trim(); if (!items) return; const k = $('[data-k="' + ta.dataset.c + '"]', root).value; rows.push({ day: +d, meal, items, kcal: k ? +k : null }); });
    if (!rows.length) return toast('Add at least one meal before saving', true);
    busy(btn, true);
    try {
      const plan = await q(sb.from('fq_diet_plans').upsert({ gym_id: ME.profile.gym_id, week_start: ws, diet_type: type, created_by: ME.user.id, updated_at: new Date().toISOString() }, { onConflict: 'gym_id,week_start,diet_type' }).select('id').single());
      await q(sb.from('fq_diet_items').delete().eq('plan_id', plan.id));
      await q(sb.from('fq_diet_items').insert(rows.map((r) => ({ ...r, plan_id: plan.id, gym_id: ME.profile.gym_id }))));
      toast('Saved. Members on the ' + (type === 'veg' ? 'veg' : 'non-veg') + ' diet see it now.'); go('diet');
    } catch (e) { fail(e); busy(btn, false); }
  }
  async function copyPrev() {
    const off = cache.dietOff || 0, type = cache.dietType || 'veg', prev = key(addDays(monday(today()), (off - 1) * 7));
    const p = await q(sb.from('fq_diet_plans').select('fq_diet_items(*)').eq('week_start', prev).eq('diet_type', type).maybeSingle());
    if (!p || !p.fq_diet_items.length) return toast('There is no plan for the week before to copy', true);
    p.fq_diet_items.forEach((x) => { const ta = $('[data-c="' + x.day + '|' + x.meal + '"]', root), k = $('[data-k="' + x.day + '|' + x.meal + '"]', root); if (ta) ta.value = x.items; if (k) k.value = x.kcal ?? ''; });
    toast('Copied. Check it, then press Save.');
  }
  function pasteSheet() {
    sheet('<h3>Paste from a spreadsheet</h3><p class="muted small">One row per meal: <b>day, meal, items, kcal</b>. Day is Mon–Sun; meal is Breakfast, Mid-morning, Lunch, Snack or Dinner. Copy straight from Excel or Google Sheets.</p><form class="form" id="f-paste"><textarea name="t" rows="10" placeholder="Mon\tBreakfast\tIdli x3, sambar\t320"></textarea><button class="btn dark">Fill the plan</button></form>', (w) => {
      w.querySelector('#f-paste').addEventListener('submit', (e) => {
        e.preventDefault(); let n = 0;
        e.target.t.value.split(/\r?\n/).forEach((line) => {
          const c = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim().replace(/^"|"$/g, ''));
          const d = WD.findIndex((x) => c[0] && c[0].slice(0, 3).toLowerCase() === x.toLowerCase()); if (d < 0) return;
          const mm = (c[1] || '').toLowerCase().replace(/[^a-z]/g, ''); const meal = (MEALS.find(([id, name]) => id === mm || name.toLowerCase().replace(/[^a-z]/g, '') === mm || (mm.startsWith('snack') && id === 'snack')) || [])[0]; if (!meal) return;
          const ta = $('[data-c="' + d + '|' + meal + '"]', root); if (!ta) return; ta.value = c[2] || ''; const k = $('[data-k="' + d + '|' + meal + '"]', root); if (k && c[3]) k.value = parseInt(c[3], 10) || ''; n++;
        });
        closeSheet(); toast(n ? n + ' meals filled. Press Save to send.' : 'No rows matched the format', !n);
      });
    });
  }

  // ---------- workouts library ----------
  async function vWorkouts() {
    const ws = await loadWorkouts(true);
    return head('Workouts', 'Your library. Assign them to members from a member’s page.', '<button class="btn dark" data-act="add-workout">' + ic('plus') + 'New workout</button>') +
      '<div class="cards">' + (ws.length ? ws.map((w) => '<div class="tcard"><b>' + esc(w.name) + '</b><small>' + esc(w.focus || '') + (w.duration_min ? ' · ' + w.duration_min + ' min' : '') + '</small><div class="exs">' + (w.exercises || []).map((e) => '<div><span>' + esc(e.name) + '</span><span>' + esc(e.sets || '') + '</span></div>').join('') + '</div><div class="btns"><button class="btn sm" data-edit-workout="' + w.id + '">Edit</button><button class="btn sm" data-del-workout="' + w.id + '">Delete</button></div></div>').join('') : '<div class="empty">No workouts yet.</div>') + '</div>';
  }
  const exText = (ex) => (ex || []).map((e) => e.name + (e.sets ? ' | ' + e.sets : '')).join('\n');
  const exParse = (t) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [n, ...s] = l.split('|'); return { name: n.trim(), sets: s.join('|').trim() }; });
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
  async function assignSheet() {
    const { m } = cache.member, ws = await loadWorkouts(), t = today();
    const days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
    sheet('<h3>Assign a workout to ' + esc(m.p.full_name.split(' ')[0]) + '</h3><form class="form" id="f-assign">' +
      select('From your library', 'wid', [['', 'Custom workout']].concat(ws.map((w) => [w.id, w.name])), '') +
      field('Title', 'title', '', 'required placeholder="e.g. Upper body"') + area('Exercises: “name | sets”', 'ex', '', 'rows="5"') + field('Note for the member', 'note', '', 'placeholder="Optional"') +
      '<div class="fld"><span>Days</span><div class="daypick">' + days.map((d, i) => '<label><input type="checkbox" name="d" value="' + key(d) + '"' + (i === 0 ? ' checked' : '') + '><span>' + WD[dayIdx(d)] + '<b>' + d.getDate() + '</b></span></label>').join('') + '</div></div>' +
      '<button class="btn dark">Assign</button></form>', (el) => {
      const f = el.querySelector('form');
      f.wid.addEventListener('change', () => { const w = ws.find((x) => x.id === f.wid.value); if (w) { f.title.value = w.name; f.ex.value = exText(w.exercises); } });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const dates = $$('input[name=d]:checked', f).map((x) => x.value); if (!dates.length) return toast('Pick at least one day', true);
        const b = f.querySelector('button'); busy(b, true);
        try {
          await q(sb.from('fq_workout_assignments').insert(dates.map((d) => ({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: d, workout_id: f.wid.value || null, title: f.title.value.trim(), exercises: exParse(f.ex.value), note: f.note.value.trim() || null, assigned_by: ME.user.id }))));
          closeSheet(); toast('Assigned for ' + dates.length + ' day' + (dates.length > 1 ? 's' : '')); go('members', m.profile_id);
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }

  // ---------- facilities, events, messages, gym (admin) ----------
  async function vFacilities() {
    const fs = await q(sb.from('fq_facilities').select('*').order('category').order('name'));
    return head('Facilities', 'Equipment and amenities members see in their app.', '<button class="btn dark" data-act="add-facility">' + ic('plus') + 'Add</button>') +
      '<div class="table"><table><thead><tr><th>Name</th><th>Category</th><th class="r">Qty</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>' + (fs.length ? fs.map((f) => '<tr><td><b>' + esc(f.name) + '</b></td><td>' + esc(f.category || '') + '</td><td class="r">' + f.quantity + '</td><td><span class="pill ' + (f.status === 'ok' ? 'ok' : f.status === 'new' ? 'ac' : 'wa') + '">' + ({ ok: 'In service', new: 'New', maintenance: 'Under repair' })[f.status] + '</span></td><td>' + esc(f.note || '') + '</td><td class="r"><button class="btn sm" data-edit-fac="' + f.id + '">Edit</button></td></tr>').join('') : '<tr><td colspan="6" class="empty">Nothing added yet.</td></tr>') + '</tbody></table></div>';
  }
  function facilitySheet(f) {
    f = f || {};
    sheet('<h3>' + (f.id ? 'Edit' : 'Add') + ' facility</h3><form class="form">' + field('Name', 'name', f.name, 'required placeholder="e.g. Treadmill"') + '<div class="two">' + field('Category', 'category', f.category, 'placeholder="Cardio, Strength…"') + field('Quantity', 'quantity', f.quantity ?? 1, 'type="number" min="0"') + '</div>' +
      select('Status', 'status', [['ok', 'In service'], ['new', 'New'], ['maintenance', 'Under repair']], f.status || 'ok') + field('Note for members', 'note', f.note) + '<div class="btns"><button class="btn dark">Save</button>' + (f.id ? '<button type="button" class="btn" data-delfac>Delete</button>' : '') + '</div></form>', (el) => {
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
      area('Details', 'details', ev.details, 'rows="3"') + (ev.id ? '' : '<label class="chkline"><input type="checkbox" name="notify" checked> Also send it to every member as a message</label>') + '<div class="btns"><button class="btn dark">Save</button>' + (ev.id ? '<button type="button" class="btn" data-delev>Delete</button>' : '') + '</div></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true); const row = { gym_id: ME.profile.gym_id, title: d.title, starts_on: d.date, starts_at: d.time || null, details: d.details || null };
        try { if (ev.id) await q(sb.from('fq_events').update(row).eq('id', ev.id)); else { await q(sb.from('fq_events').insert({ ...row, created_by: ME.user.id })); if (d.notify) await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, kind: 'event', title: d.title + ' · ' + fmt(d.date), body: d.details || null, created_by: ME.user.id })); }
          closeSheet(); toast('Event saved'); go('events'); } catch (err) { fail(err); busy(b, false); } });
      const del = el.querySelector('[data-delev]'); if (del) del.addEventListener('click', async () => { try { await q(sb.from('fq_events').delete().eq('id', ev.id)); closeSheet(); toast('Deleted'); go('events'); } catch (err) { fail(err); } });
    });
  }
  async function vMessages() {
    const [ns, P] = await Promise.all([q(sb.from('fq_notices').select('*').order('created_at', { ascending: false }).limit(50)), loadPeople()]);
    return head('Messages', 'Messages appear in members’ apps. Payment reminders go only to that member.', '<button class="btn dark" data-act="add-notice">' + ic('plus') + 'New message</button>') +
      '<div class="panel">' + (ns.length ? ns.map((n) => '<div class="li"><span class="pill ' + (n.kind === 'payment' ? 'wa' : n.kind === 'event' ? 'ac' : '') + '">' + ({ payment: 'Payment', event: 'Event', general: 'Message' })[n.kind] + '</span><div class="grow"><b>' + esc(n.title) + '</b><small>' + (n.member_id ? 'To ' + esc((P.byId[n.member_id] || {}).full_name || 'member') : 'To everyone') + ' · ' + fmt(n.created_at.slice(0, 10)) + (n.body ? ' · ' + esc(n.body) : '') + '</small></div><button class="iconbtn" data-delnotice="' + n.id + '" aria-label="Delete">' + ic('x') + '</button></div>').join('') : '<div class="empty">No messages sent yet.</div>') + '</div>';
  }
  async function noticeSheet() {
    const P = await loadPeople();
    sheet('<h3>New message</h3><form class="form">' + select('Send to', 'to', [['', 'Everyone']].concat(P.members.map((m) => [m.profile_id, m.p.full_name])), '') + field('Title', 'title', '', 'required placeholder="e.g. Gym closed on Sunday"') + area('Message', 'body', '', 'rows="3"') + '<button class="btn dark">Send</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true);
        try { await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, member_id: d.to || null, kind: 'general', title: d.title, body: d.body || null, created_by: ME.user.id })); closeSheet(); toast('Sent'); go('messages'); } catch (err) { fail(err); busy(b, false); } });
    });
  }
  async function vGymProfile() {
    const g = ME.gym;
    return head('Gym profile', 'Shown in every member’s Gym tab.') + '<form class="panel pad form narrow" id="f-gym">' + field('Gym name', 'name', g.name, 'required') + field('Address', 'address', g.address) + '<div class="two">' + field('Phone', 'phone', g.phone) + field('Hours', 'hours', g.hours, 'placeholder="Mon–Sat 5:30–22:00, Sun 6–12"') + '</div>' + area('About', 'about', g.about, 'rows="3"') + '<button class="btn dark">Save profile</button></form>';
  }

  // ---------- member and trainer forms (admin) ----------
  async function memberSheet(m) {
    const P = await loadPeople(), edit = !!m; m = m || {};
    const tOpts = [['', 'No trainer']].concat(P.trainers.filter((x) => x.p.role === 'trainer').map((x) => [x.p.id, x.p.full_name]));
    sheet('<h3>' + (edit ? 'Edit ' + esc(m.p.full_name) : 'Add member') + '</h3><form class="form">' +
      (edit ? '' : '<div class="two">' + field('Full name', 'name', '', 'required autocomplete="off"') + field('Mobile number', 'phone', '', 'required inputmode="numeric" placeholder="10 digits"') + '</div>' + field('Temporary password', 'password', genPass(), 'required minlength="8"') + '<p class="muted small" style="margin-top:-6px">Give this to the member. They can change it in the app.</p>') +
      '<div class="two">' + select('Trainer', 'trainer', tOpts, m.trainer_id || '') + select('Diet', 'diet', [['veg', 'Vegetarian'], ['nonveg', 'Non-veg']], m.diet_type || 'veg') + '</div>' +
      '<div class="two">' + select('Goal', 'goal', [['lose', 'Lose weight'], ['gain', 'Gain muscle / weight'], ['fit', 'Stay fit']], m.goal || 'lose') + field('Height (cm)', 'height', m.height_cm, 'type="number" min="100" max="230"') + '</div>' +
      '<div class="two">' + field('Starting weight (kg)', 'start', m.start_weight, 'type="number" step="0.1"') + field('Target weight (kg)', 'target', m.target_weight, 'type="number" step="0.1"') + '</div>' +
      '<div class="two">' + field('Plan', 'plan', m.plan_name || 'Monthly', 'placeholder="Monthly, Quarterly…"') + field('Fee (₹)', 'fee', m.fee_paise != null ? m.fee_paise / 100 : '', 'type="number" min="0"') + '</div>' +
      field('Paid until', 'paid', m.paid_until || '', 'type="date"') + '<button class="btn dark">' + (edit ? 'Save changes' : 'Create login') + '</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true);
        const details = { trainer_id: d.trainer || null, diet_type: d.diet, goal: d.goal, height_cm: num(d.height), start_weight: num(d.start), target_weight: num(d.target), plan_name: d.plan || null, fee_paise: d.fee ? Math.round(+d.fee * 100) : null, paid_until: d.paid || null };
        try {
          if (edit) { await q(sb.from('fq_members').update(details).eq('profile_id', m.profile_id)); closeSheet(); toast('Saved'); go('members', m.profile_id); }
          else {
            const r = await X.adminCall({ action: 'create_user', role: 'member', full_name: d.name, phone: d.phone, password: d.password, member: { ...details, fee_rupees: d.fee, paid_until: d.paid } });
            closeSheet(); credSheet(d.name, d.phone, d.password); cache.people = null; go('members', r.id);
          }
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }
  async function trainerSheet(id) {
    const P = await loadPeople(), x = id ? P.trainers.find((t) => t.p.id === id) : null, t = x ? x.t : {};
    sheet('<h3>' + (x ? 'Edit ' + esc(x.p.full_name) : 'Add trainer') + '</h3><form class="form">' +
      (x ? '' : '<div class="two">' + field('Full name', 'name', '', 'required') + field('Mobile number', 'phone', '', 'required inputmode="numeric"') + '</div>' + field('Temporary password', 'password', genPass(), 'required minlength="8"')) +
      '<div class="two">' + field('Speciality', 'speciality', t.speciality, 'placeholder="Strength, fat loss…"') + field('Experience (years)', 'exp', t.experience_years, 'type="number" min="0"') + '</div>' +
      field('Certifications', 'certs', t.certifications) + field('Floor hours', 'slots', t.slots, 'placeholder="6–10 am, 5–9 pm"') + area('Short bio', 'bio', t.bio, 'rows="2"') + '<button class="btn dark">' + (x ? 'Save' : 'Create login') + '</button></form>', (el) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formData(form), b = form.querySelector('button'); busy(b, true);
        const det = { speciality: d.speciality || null, experience_years: num(d.exp), certifications: d.certs || null, slots: d.slots || null, bio: d.bio || null };
        try {
          if (x) { await q(sb.from('fq_trainers').upsert({ profile_id: id, gym_id: ME.profile.gym_id, ...det })); closeSheet(); toast('Saved'); }
          else { await X.adminCall({ action: 'create_user', role: 'trainer', full_name: d.name, phone: d.phone, password: d.password, trainer: det }); closeSheet(); credSheet(d.name, d.phone, d.password); }
          cache.people = null; go('trainers');
        } catch (err) { fail(err); busy(b, false); }
      });
    });
  }
  function genPass() { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); r.forEach((n) => (s += a[n % a.length])); return 'Fit-' + s.slice(0, 4) + '-' + s.slice(4, 8); }
  function credSheet(name, phone, pass) {
    const link = location.origin + location.pathname;
    const msg = 'Hi ' + name.split(' ')[0] + ', your ' + ME.gym.name + ' app login is ready.\nOpen: ' + link + '\nMobile: ' + X.phone10(phone) + '\nPassword: ' + pass + '\nPlease change the password after signing in.';
    sheet('<h3>Login created</h3><p class="muted small">Send these to ' + esc(name) + '. The password is shown only now.</p><pre class="cred">' + esc(msg) + '</pre><div class="btns"><button class="btn dark" data-copy>Copy message</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/91' + X.phone10(phone) + '?text=' + encodeURIComponent(msg) + '">Send on WhatsApp</a></div>', (el) => {
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
    const { m } = cache.member, from = m.paid_until && parse(m.paid_until) > today() ? parse(m.paid_until) : today();
    const months = { Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Annual: 12 }[m.plan_name] || 1;
    const until = new Date(from); until.setMonth(until.getMonth() + months);
    sheet('<h3>Record payment · ' + esc(m.p.full_name) + '</h3><form class="form"><div class="two">' + field('Amount (₹)', 'amount', m.fee_paise ? m.fee_paise / 100 : '', 'type="number" min="1" required') + field('Paid on', 'on', key(today()), 'type="date" required') + '</div>' +
      '<div class="two">' + field('Covers until', 'until', key(until), 'type="date" required') + select('Method', 'method', [['UPI', 'UPI'], ['Cash', 'Cash'], ['Card', 'Card'], ['Bank transfer', 'Bank transfer']], 'UPI') + '</div>' + field('Note', 'note', '') + '<button class="btn dark">Save payment</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button'); busy(b, true);
        try { await q(sb.from('fq_payments').insert({ gym_id: ME.profile.gym_id, member_id: m.profile_id, amount_paise: Math.round(+d.amount * 100), paid_on: d.on, period_until: d.until, method: d.method, note: d.note || null, recorded_by: ME.user.id })); closeSheet(); toast('Payment saved'); go('members', m.profile_id); } catch (err) { fail(err); busy(b, false); } });
    });
  }
  async function remind(id) {
    const P = await loadPeople(), m = P.members.find((x) => x.profile_id === id); if (!m) return;
    const p = X.paidState(m), amt = m.fee_paise ? inr(m.fee_paise) : 'your membership fee';
    const body = (p.days != null && p.days < 0 ? 'Your membership expired on ' + fmt(m.paid_until, true) + '. ' : m.paid_until ? 'Your membership is due on ' + fmt(m.paid_until, true) + '. ' : '') + 'Please pay ' + amt + ' at the desk or by UPI. Thank you!';
    sheet('<h3>Payment reminder · ' + esc(m.p.full_name) + '</h3><p class="muted small">It appears in their app straight away. You can also send it on WhatsApp.</p><pre class="cred">' + esc(body) + '</pre><div class="btns"><button class="btn dark" data-send>Send in app</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/91' + X.phone10(m.p.phone) + '?text=' + encodeURIComponent('Hi ' + m.p.full_name.split(' ')[0] + ', ' + body + ' – ' + ME.gym.name) + '">WhatsApp too</a></div>', (el) => {
      el.querySelector('[data-send]').addEventListener('click', async (e) => { busy(e.target, true); try { await q(sb.from('fq_notices').insert({ gym_id: ME.profile.gym_id, member_id: id, kind: 'payment', title: 'Membership payment ' + (p.days != null && p.days < 0 ? 'overdue' : 'due'), body, created_by: ME.user.id })); closeSheet(); toast('Reminder sent to ' + m.p.full_name.split(' ')[0]); } catch (err) { fail(err); busy(e.target, false); } });
    });
  }
  function weighSheet() {
    const { m } = cache.member;
    sheet('<h3>Log weight · ' + esc(m.p.full_name) + '</h3><form class="form"><div class="two">' + field('Weight (kg)', 'w', m.current_weight || '', 'type="number" step="0.1" required inputmode="decimal"') + field('Date', 'd', key(today()), 'type="date" required') + '</div><button class="btn dark">Save</button></form>', (el) => {
      el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button'); busy(b, true);
        try { await q(sb.from('fq_weight_logs').upsert({ gym_id: ME.profile.gym_id, member_id: m.profile_id, on_date: d.d, weight: +d.w, recorded_by: ME.user.id }, { onConflict: 'member_id,on_date' })); closeSheet(); toast('Weight saved'); go('members', m.profile_id); } catch (err) { fail(err); busy(b, false); } });
    });
  }

  const VIEWS = { overview: vOverview, members: vMembers, trainers: vTrainers, diet: vDiet, workouts: vWorkouts, facilities: vFacilities, events: vEvents, messages: vMessages, gymprofile: vGymProfile };

  async function onClick(e) {
    const b = e.target.closest('button,[data-member]'); if (!b || !root.contains(b)) return;
    const d = b.dataset;
    try {
      if (d.view) return go(d.view);
      if (d.member) return go('members', d.member);
      if (d.act === 'out') { await sb.auth.signOut(); location.reload(); return; }
      if (d.act === 'pw') return X.changePasswordSheet();
      if (d.act === 'add-member') return memberSheet();
      if (d.act === 'edit-member') return memberSheet(cache.member.m);
      if (d.act === 'toggle-mine') { cache.filter = cache.filter === 'all' ? 'mine' : 'all'; return go('members'); }
      if (d.act === 'add-trainer') return trainerSheet();
      if (d.editTrainer) return trainerSheet(d.editTrainer);
      if (d.reset) return resetSheet(d.reset, cache.people.byId[d.reset].full_name);
      if (d.act === 'reset-pw') return resetSheet(cache.member.m.profile_id, cache.member.m.p.full_name);
      if (d.act === 'toggle-active') { const m = cache.member.m; busy(b, true); await X.adminCall({ action: 'set_active', user_id: m.profile_id, active: !m.p.active }); toast(m.p.active ? 'Login switched off' : 'Login switched on'); return go('members', m.profile_id); }
      if (d.act === 'pay') return paySheet();
      if (d.remind) return remind(d.remind);
      if (d.act === 'assign') return assignSheet();
      if (d.act === 'weigh') return weighSheet();
      if (d.wa) { const w = cache.member.wa.find((x) => x.id === d.wa), v = w.status === d.v ? 'assigned' : d.v; await q(sb.from('fq_workout_assignments').update({ status: v, marked_by: ME.user.id, marked_at: new Date().toISOString() }).eq('id', d.wa)); toast(v === 'done' ? 'Marked done' : v === 'skipped' ? 'Marked skipped' : 'Cleared'); return go('members', cache.member.m.profile_id); }
      if (d.wadel) { await q(sb.from('fq_workout_assignments').delete().eq('id', d.wadel)); toast('Removed'); return go('members', cache.member.m.profile_id); }
      if (d.dl) {
        const [dk, meal] = d.dl.split('|'), mm = cache.member, cur = (mm.logs.find((x) => x.on_date === dk && x.meal === meal) || {}).status;
        const next = cur === 'done' ? 'skipped' : cur === 'skipped' ? null : 'done';
        if (next) await q(sb.from('fq_diet_logs').upsert({ member_id: mm.m.profile_id, gym_id: ME.profile.gym_id, on_date: dk, meal, status: next, updated_at: new Date().toISOString() }));
        else await q(sb.from('fq_diet_logs').delete().eq('member_id', mm.m.profile_id).eq('on_date', dk).eq('meal', meal));
        mm.logs = mm.logs.filter((x) => !(x.on_date === dk && x.meal === meal)); if (next) mm.logs.push({ on_date: dk, meal, status: next });
        b.className = 'cell ' + (next || ''); b.textContent = next === 'done' ? '✓' : next === 'skipped' ? '✕' : '–'; return;
      }
      if (d.dtype) { cache.dietType = d.dtype; return go('diet'); }
      if (d.doff) { cache.dietOff = +d.doff; return go('diet'); }
      if (d.act === 'save-plan') return savePlan(b);
      if (d.act === 'copy-prev') return copyPrev();
      if (d.act === 'paste') return pasteSheet();
      if (d.act === 'add-workout') return workoutSheet();
      if (d.editWorkout) return workoutSheet(cache.workouts.find((w) => w.id === d.editWorkout));
      if (d.delWorkout) { await q(sb.from('fq_workouts').delete().eq('id', d.delWorkout)); toast('Deleted'); return go('workouts'); }
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
    view = isAdmin ? 'overview' : 'members';
    root.addEventListener('click', onClick);
    root.addEventListener('input', (e) => { if (e.target.id === 'msearch') { const v = e.target.value.toLowerCase(); $$('tr[data-q]', root).forEach((tr) => (tr.hidden = !tr.dataset.q.includes(v))); } });
    root.addEventListener('submit', async (e) => {
      if (e.target.id !== 'f-gym') return; e.preventDefault(); const d = formData(e.target), b = e.target.querySelector('button'); busy(b, true);
      try { await q(sb.from('fq_gyms').update({ name: d.name, address: d.address || null, phone: d.phone || null, hours: d.hours || null, about: d.about || null }).eq('id', ME.gym.id)); Object.assign(ME.gym, d); toast('Gym profile saved'); go('gymprofile'); } catch (err) { fail(err); busy(b, false); }
    });
    go(view);
  }
  window.FQStaff = { start };
})();
