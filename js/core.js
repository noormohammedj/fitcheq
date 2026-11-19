/* Fitcheq app core: Supabase client, sign-in, shared helpers and small UI pieces used by every role. */
(function () {
  const CFG = window.FQ_CONFIG;
  const sb = window.FQ_MOCK_CLIENT || window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const isTrialPhone = (p) => /^90000000\d\d$/.test(String(p || ''));

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const dayIdx = (d) => (d.getDay() + 6) % 7; // 0 = Monday
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WDL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d, y) => { if (typeof d === 'string') d = parse(d); return d.getDate() + ' ' + MO[d.getMonth()] + (y ? ' ' + d.getFullYear() : ''); };
  const inr = (paise) => '₹' + Math.round((paise || 0) / 100).toLocaleString('en-IN');
  const MEALS = [['breakfast', 'Breakfast', '8:00'], ['midmorning', 'Mid-morning', '11:00'], ['lunch', 'Lunch', '13:30'], ['snack', 'Evening snack', '17:00'], ['dinner', 'Dinner', '20:30']];
  const phone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const kg = (v) => (v == null ? '—' : Number(v).toFixed(1) + ' kg');

  const ICONS = {
    today: '<path d="M4 7h16v12H4zM4 7l1.5-3h13L20 7M8 3v3M16 3v3"/><path d="M8 12h3v3H8z"/>',
    diet: '<path d="M12 21c-4.5 0-8-3.6-8-8.5C4 8 7 5 10.5 6c.9.3 1.6.3 3 0C17 5 20 8 20 12.5 20 17.4 16.5 21 12 21z"/><path d="M12 6c0-2 1-3.2 3-3.5"/>',
    workout: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>',
    progress: '<path d="M4 19V5M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>',
    gym: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 010 7M18 15c2 .7 3 2.3 3.5 5"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    home: '<path d="M3 11l9-7 9 7v9H3z"/>',
  };
  const ic = (n, c) => '<svg class="' + (c || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

  // ---------- goal maths ----------
  // progress towards target, and a projection from how many logged meals were followed
  function goalStats(m, adherence) {
    const s = num(m.start_weight), c = num(m.current_weight), t = num(m.target_weight);
    if (s == null || c == null || t == null || s === t) return null;
    const gain = t > s;
    const moved = gain ? c - s : s - c, span = Math.abs(t - s);
    const pct = Math.max(0, Math.min(100, (moved / span) * 100));
    const toGo = Math.max(0, gain ? t - c : c - t);
    const a = adherence == null ? 0.8 : adherence;
    const weekly = gain ? 0.3 * a - 0.08 * (1 - a) : 0.8 * a - 0.15; // kg per week in the goal direction
    const eta = (w) => (toGo === 0 ? today() : w > 0.02 && toGo / w < 104 ? addDays(today(), Math.round((toGo / w) * 7)) : null);
    const full = gain ? 0.3 : 0.65;
    return { gain, moved, toGo, pct, adherence: a, monthly: weekly * 30 / 7, eta: eta(weekly), etaFull: eta(full), fullMonthly: full * 30 / 7 };
  }

  // ---------- UI pieces ----------
  let toastT;
  function toast(msg, bad) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast show' + (bad ? ' bad' : ''); t.textContent = msg;
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), bad ? 4200 : 2200);
  }
  function sheet(html, onMount) {
    closeSheet();
    const w = document.createElement('div'); w.className = 'sheet-wrap'; w.id = 'sheet';
    w.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><button class="sheet-x" type="button" aria-label="Close" data-close>' + ic('x') + '</button>' + html + '</div>';
    w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-close]')) closeSheet(); });
    document.body.appendChild(w); document.body.classList.add('noscroll');
    const f = w.querySelector('input,select,textarea'); if (f && matchMedia('(min-width: 700px)').matches) f.focus();
    if (onMount) onMount(w);
    return w;
  }
  function closeSheet() { const s = $('#sheet'); if (s) s.remove(); document.body.classList.remove('noscroll'); }
  const fail = (e) => { console.error(e); toast(e && e.message ? friendly(e.message) : 'Something went wrong. Please try again.', true); };
  const friendly = (m) => (/JWT|session|token/i.test(m) ? 'Your session ended. Please sign in again.' : /violates row-level|permission/i.test(m) ? 'You don’t have access to do that.' : /duplicate key/i.test(m) ? 'That already exists.' : m);
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = 'Saving…'; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; };
  async function q(p) { const r = await p; if (r.error) throw r.error; return r.data; }
  function formData(form) { const o = {}; new FormData(form).forEach((v, k) => (o[k] = typeof v === 'string' ? v.trim() : v)); return o; }
  const field = (label, name, val, attrs) => '<label class="fld"><span>' + label + '</span><input name="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || '') + '></label>';
  const area = (label, name, val, attrs) => '<label class="fld"><span>' + label + '</span><textarea name="' + name + '" ' + (attrs || '') + '>' + esc(val || '') + '</textarea></label>';
  const select = (label, name, opts, val) => '<label class="fld"><span>' + label + '</span><select name="' + name + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
  const bar = (pct, cls) => '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  function paidState(m) {
    if (!m.paid_until) return { cls: 'no', label: 'Not paid', days: null };
    const d = Math.round((parse(m.paid_until) - today()) / 864e5);
    if (d < 0) return { cls: 'no', label: 'Overdue ' + -d + 'd', days: d };
    if (d <= 7) return { cls: 'wa', label: 'Due in ' + d + 'd', days: d };
    return { cls: 'ok', label: 'Paid till ' + fmt(m.paid_until), days: d };
  }
  function weightChart(logs, target) {
    const pts = logs.filter((l) => l.weight != null).sort((a, b) => a.on_date.localeCompare(b.on_date)).map((l) => ({ d: parse(l.on_date).getTime(), w: Number(l.weight) }));
    if (pts.length < 2) return '<p class="muted small">Log your weight a few times to see the chart.</p>';
    const W = 340, H = 150, L = 34, R = 10, T = 10, B = 22;
    let lo = Math.min(...pts.map((p) => p.w), target ?? Infinity), hi = Math.max(...pts.map((p) => p.w), target ?? -Infinity);
    lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
    const t0 = pts[0].d, t1 = pts[pts.length - 1].d || t0 + 1;
    const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), y = (w) => T + ((hi - w) / (hi - lo)) * (H - T - B);
    const step = hi - lo > 12 ? 4 : 2; let g = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="cg"/><text x="' + (L - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end" class="ct">' + v + '</text>';
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p.w).toFixed(1)).join(' ');
    const tl = target != null ? '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(target) + '" y2="' + y(target) + '" class="ctg"/><text x="' + (L + 4) + '" y="' + (y(target) - 4) + '" class="ctt">Target ' + target + '</text>' : '';
    const last = pts[pts.length - 1];
    return '<svg class="wchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weight history">' + g + tl + '<path d="' + path + '" class="cl"/><circle cx="' + x(last.d) + '" cy="' + y(last.w) + '" r="4" class="cd"/>' +
      '<text x="' + L + '" y="' + (H - 6) + '" class="ct">' + fmt(new Date(t0)) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end" class="ct">' + fmt(new Date(t1)) + '</text></svg>';
  }

  // ---------- auth ----------
  const emailFor = (phone) => phone10(phone) + '@' + CFG.loginDomain;
  async function signIn(phone, password) {
    const { error } = await sb.auth.signInWithPassword({ email: emailFor(phone), password });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'Mobile number or password is wrong.' : error.message);
  }
  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const prof = await q(sb.from('fq_profiles').select('*').eq('id', session.user.id).maybeSingle());
    if (!prof || !prof.active) { await sb.auth.signOut(); return null; }
    const gym = await q(sb.from('fq_gyms').select('*').eq('id', prof.gym_id).single());
    window.FQ_ME = { user: session.user, profile: prof, gym };
    return window.FQ_ME;
  }
  async function adminCall(body) {
    const { data, error } = await sb.functions.invoke('fitcheq-admin-users', { body });
    if (error) { let msg = error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch (e) {} throw new Error(msg); }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  function changePasswordSheet() {
    if (window.FQ_PREVIEW) return toast('This is a preview with sample data');
    const ph = String((window.FQ_ME && window.FQ_ME.profile.phone) || '');
    if (isTrialPhone(ph)) return toast('Trial logins keep their password so everyone can use them');
    sheet('<h3>Change password</h3><form id="pw" class="form">' + field('New password', 'p1', '', 'type="password" minlength="8" required autocomplete="new-password"') + field('Type it again', 'p2', '', 'type="password" minlength="8" required autocomplete="new-password"') + '<button class="btn dark">Save password</button></form>', (w) => {
      w.querySelector('#pw').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = formData(e.target);
        if (f.p1.length < 8) return toast('Use at least 8 characters', true);
        if (f.p1 !== f.p2) return toast('The two passwords don’t match', true);
        const b = e.target.querySelector('button'); busy(b, true);
        const { error } = await sb.auth.updateUser({ password: f.p1 }); busy(b, false);
        if (error) return fail(error); closeSheet(); toast('Password changed');
      });
    });
  }

  window.FQX = { sb, esc, $, $$, key, parse, today, addDays, monday, dayIdx, WD, WDL, MO, fmt, inr, MEALS, phone10, initials, num, kg, ic, goalStats, toast, sheet, closeSheet, fail, busy, q, formData, field, area, select, bar, paidState, weightChart, signIn, loadMe, adminCall, changePasswordSheet, CFG };
})();
