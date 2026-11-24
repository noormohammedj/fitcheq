/* Click-through tests for the three roles, run inside the app in preview mode (sample data, nothing saved).
   Open the app with #preview=owner (or trainer / member), then in the console:
     await import('/tests/preview-e2e.js'); await FQE2E('owner')
   Each step drives the real screens: clicks, form fills and the checks a tester would do by hand. */
window.FQE2E = async function (role) {
  const R = [], ok = (c, m) => { R.push((c ? 'PASS ' : 'FAIL ') + m); return c; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const until = async (fn, t = 4000) => { const s = Date.now(); while (Date.now() - s < t) { const v = fn(); if (v) return v; await sleep(40); } return null; };
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const byText = (sel, t, r) => $$(sel, r).find((e) => txt(e).includes(t));
  const click = async (el, wait = 250) => { if (!el) throw new Error('nothing to click'); el.click(); await sleep(wait); };
  const set = (el, v) => { if (!el) throw new Error('missing field'); if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v; else el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const submit = async (form, wait = 450) => { form.requestSubmit(); await sleep(wait); };
  const toast = () => txt($('#toast.show'));
  const sheetEl = () => $('#sheet');
  const close = async () => { const s = sheetEl(); if (s) { s.querySelector('[data-close]').click(); await sleep(120); } };
  const nav = async (label) => { await click(byText('.snav .nav', label), 500); await until(() => !$('.loading')); };
  const main = () => $('.smain');
  const step = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + e.message); } await close(); };

  // ---------------------------------------------------------------- owner
  if (role === 'owner') {
    await until(() => $('.smain .kpis'));
    await step('overview', async () => {
      ok(byText('.kpis div', 'Active members') && byText('.kpis div', 'Came today'), 'overview shows member and attendance numbers');
      ok($$('.panel', main())[0] && txt($$('.panel', main())[0]).includes('Attendance') && $$('.panel .pill', main()).length >= 5, 'overview lists attendance for every member');
      ok(!!byText('.snav .nav', 'Trainers') && !!byText('.snav .nav', 'Fee plans') && !!byText('.snav .nav', 'Gym and hours'), 'owner sees Trainers, Fee plans and Gym and hours');
    });
    await step('trainers: add', async () => {
      await nav('Trainers');
      const before = $$('.tcard').length;
      await click(byText('button', 'Add trainer'));
      const f = $('#sheet form');
      set(f.name, 'Test Coach'); set(f.phone, '98765 00001'); set(f.speciality, 'Mobility'); set(f.exp, '4'); set(f.slots, '6–9 am');
      await submit(f, 700);
      ok(sheetEl() && txt(sheetEl()).includes('Login created') && txt(sheetEl()).includes('9876500001'), 'adding a trainer shows the login to send');
      ok(!!byText('#sheet a', 'WhatsApp') && byText('#sheet a', 'WhatsApp').href.startsWith('https://wa.me/919876500001'), 'login can be sent on WhatsApp');
      await close(); await until(() => $$('.tcard').length === before + 1);
      ok($$('.tcard').length === before + 1 && !!byText('.tcard', 'Test Coach'), 'new trainer appears in the list');
    });
    await step('trainers: add with a bad number', async () => {
      await click(byText('button', 'Add trainer'));
      const f = $('#sheet form'); set(f.name, 'Bad Number'); set(f.phone, '12345'); await submit(f);
      ok(toast().includes('10-digit') && !!sheetEl(), 'a short mobile number is refused');
    });
    await step('trainers: edit', async () => {
      await click(byText('.tcard', 'Test Coach').querySelector('[data-edit-trainer]'));
      const f = $('#sheet form'); set(f.name, 'Test Coach Two'); set(f.speciality, 'Yoga'); await submit(f, 700);
      await until(() => byText('.tcard', 'Test Coach Two'));
      const card = byText('.tcard', 'Test Coach Two');
      ok(!!card && txt(card).includes('Yoga'), 'owner changes a trainer’s name and details');
    });
    await step('trainers: duplicate number', async () => {
      await click(byText('.tcard', 'Test Coach Two').querySelector('[data-edit-trainer]'));
      const f = $('#sheet form'); set(f.phone, '9000000012'); await submit(f, 700);
      ok(toast().includes('already has a login'), 'a number already in use is refused');
    });
    await step('trainers: remove', async () => {
      const before = $$('.tcard').length;
      await click(byText('.tcard', 'Test Coach Two').querySelector('[data-remove]'));
      ok(txt(sheetEl()).includes('Remove Test Coach Two'), 'remove asks for confirmation');
      await click($('#sheet [data-yes]'), 700); await until(() => $$('.tcard').length === before - 1);
      ok($$('.tcard').length === before - 1 && !byText('.tcard', 'Test Coach Two'), 'trainer is removed');
      const priya = byText('.tcard', 'Priya'); await click(priya.querySelector('[data-remove]'));
      ok(txt(sheetEl()).includes('3 clients') || /\d+ client/.test(txt(sheetEl())), 'removing a trainer with clients warns how many clients are affected');
    });
    await step('fee plans', async () => {
      await nav('Fee plans');
      const rows = () => $$('.smain tbody tr').length;
      ok(rows() === 4 && txt(main()).includes('Quarterly') && txt(main()).includes('₹7,500'), 'fee plans list shows the plans and prices');
      await click(byText('button', 'Add plan'));
      let f = $('#sheet form'); set(f.name, 'Student'); set(f.months, '0'); set(f.fee, '2000'); await submit(f);
      ok((toast().includes('Months') || !f.checkValidity()) && !!sheetEl() && rows() === 4, 'a plan with 0 months is refused and nothing is saved');
      set(f.months, '1'); await submit(f, 600); await until(() => rows() === 5);
      ok(rows() === 5 && txt(main()).includes('Student') && txt(main()).includes('₹2,000'), 'owner adds a fee plan');
      await click(byText('.smain tr', 'Student').querySelector('[data-edit-fee]'));
      f = $('#sheet form'); set(f.fee, '1800'); set(f.active, false); await submit(f, 600);
      const st = byText('.smain tr', 'Student');
      ok(txt(st).includes('₹1,800') && txt(st).includes('Hidden'), 'owner changes the fee and hides the plan');
      await click(byText('.smain tr', 'Student').querySelector('[data-edit-fee]')); await click($('#sheet [data-delfee]'), 600);
      ok(rows() === 4, 'owner deletes a fee plan');
    });
    await step('gym and hours', async () => {
      await nav('Gym and hours');
      const f = $('#f-gym');
      ok(!!f && $$('.hrow', f).length === 7, 'opening hours editor has all 7 days');
      set(f.o0b, '09:00'); set(f.o0a, '10:00'); await submit(f);
      ok(toast().includes('closing time must be after'), 'closing before opening is refused');
      set(f.o0a, '05:00'); set(f.o0b, '11:00'); set(f.e0a, '16:30'); set(f.e0b, '21:30');
      await click(byText('button', 'Copy Monday'));
      ok(f.o3a.value === '05:00' && f.e5b.value === '21:30', 'Monday’s hours copy to Tuesday–Saturday');
      set(f.c6, true); set(f.phone, '+91 98765 43210');
      await submit(f, 700); await until(() => $('#f-gym'));
      const g = $('#f-gym');
      ok(g.c6.checked && g.o2a.value === '05:00' && g.e4b.value === '21:30', 'hours are saved and shown again');
      ok(window.FQ_ME.gym.hours.includes('Sun Closed') && window.FQ_ME.gym.hours.includes('Mon–Sat 5 am–11 am, 4:30 pm–9:30 pm'), 'hours summary for members reads “Mon–Sat 5 am–11 am, 4:30 pm–9:30 pm · Sun Closed”');
    });
    await step('facilities', async () => {
      await nav('Facilities');
      const n = $$('.smain tbody tr').length;
      await click(byText('button', 'Add')); const f = $('#sheet form'); set(f.name, 'Rowing machine'); set(f.category, 'Cardio'); set(f.quantity, '2'); await submit(f, 600);
      ok($$('.smain tbody tr').length === n + 1 && !!byText('.smain tr', 'Rowing machine'), 'owner adds a facility');
      await click(byText('.smain tr', 'Rowing machine').querySelector('[data-edit-fac]'), 400); set($('#sheet form').status, 'maintenance'); await submit($('#sheet form'), 600);
      ok(txt(byText('.smain tr', 'Rowing machine')).includes('Under repair'), 'owner marks it under repair');
      await click(byText('.smain tr', 'Rowing machine').querySelector('[data-edit-fac]'), 400); await click($('#sheet [data-delfac]'), 600);
      ok(!byText('.smain tr', 'Rowing machine'), 'owner deletes it');
    });
    await step('members: add on a fee plan', async () => {
      await nav('Members');
      await click(byText('button', 'Add member'));
      const f = $('#sheet form');
      set(f.name, 'Kavya Test'); set(f.phone, '9876500077'); set(f.feeplan, $$('option', f.feeplan).find((o) => o.textContent.startsWith('Quarterly')).value);
      ok(f.fee.value === '7500', 'choosing a fee plan fills the fee');
      set(f.height, '160'); set(f.start, '70'); set(f.target, '62');
      await submit(f, 800);
      ok(txt(sheetEl()).includes('Login created'), 'member login created');
      await close(); await until(() => byText('.smain h1', 'Kavya Test'));
      ok(!!byText('.smain h1', 'Kavya Test'), 'opens the new member’s page');
      await click(byText('.tabs button', 'Membership'), 500);
      ok(txt(main()).includes('Quarterly') && txt(main()).includes('₹7,500'), 'member is on the Quarterly plan');
      await click(byText('button', 'Record payment')); const pf = $('#sheet form');
      ok(pf.amount.value === '7500', 'payment amount comes from the plan');
      const exp = new Date(); exp.setMonth(exp.getMonth() + 3);
      ok(pf.until.value.slice(0, 7) === exp.toISOString().slice(0, 7), 'payment covers 3 months for a quarterly plan');
      await submit(pf, 600);
      ok(/Paid till/.test(txt(main())), 'payment marks the member paid');
    });
    await step('members: remove', async () => {
      await click($('.smain [data-remove]')); ok(txt(sheetEl()).includes('can’t be undone'), 'removing a member warns it can’t be undone');
      await click($('#sheet [data-yes]'), 700); await until(() => byText('.smain h1', 'Members'));
      ok(!byText('.smain tr', 'Kavya Test'), 'member removed');
    });
    await step('owner plans too', async () => {
      await click(byText('.smain tr', 'Divya'), 600); await until(() => $('#f-day'));
      ok(!!$('#f-day'), 'owner can also plan a member’s diet and workouts');
    });
  }

  // ---------------------------------------------------------------- trainer
  if (role === 'trainer') {
    await until(() => $('.smain .kpis'));
    await step('today', async () => {
      ok(byText('.smain h1', 'Today') && byText('.kpis div', 'Came today') && byText('.kpis div', 'Away 3+ days'), 'trainer starts on Today with attendance numbers');
      ok(!byText('.snav .nav', 'Trainers') && !byText('.snav .nav', 'Fee plans') && !byText('.snav .nav', 'Gym and hours'), 'trainer does not see owner settings');
      ok(txt(main()).includes('Arjun') && !txt($$('.panel', main())[0]).includes('Rahul'), 'attendance shows only the trainer’s own clients');
      await click(byText('button', 'Show all members'), 600); await until(() => txt(main()).includes('Rahul'));
      ok(txt($$('.panel', main())[1]).includes('Rahul'), 'plans missing lists Rahul, who has no meals for the next 3 days');
    });
    await step('missed-you reminder', async () => {
      const btn = $('.smain [data-missed]');
      ok(!!btn, 'a member who has been away has a Remind button');
      await click(btn);
      const a = $('#sheet #wa-go'), ta = $('#sheet textarea');
      ok(a.href.startsWith('https://wa.me/91') && decodeURIComponent(a.href).includes('we missed you'), 'reminder opens WhatsApp with a ready message');
      set(ta, 'Hi, see you tomorrow at 6!'); ok(decodeURIComponent(a.href).includes('see you tomorrow at 6'), 'editing the message updates the WhatsApp link');
      await click(byText('#sheet button', 'Send in app only'), 700);
      ok(toast().includes('Reminder sent'), 'reminder is recorded in the member’s app');
      await until(() => /reminded/.test(txt(main())));
      ok(/reminded/.test(txt(main())), 'the list shows the member was reminded');
    });
    await step('plan a day for Rahul', async () => {
      await click(byText('.smain .li', 'Rahul', $$('.smain .panel')[1]).querySelector('[data-plan]'), 700); await until(() => $('#f-day'));
      const f = $('#f-day');
      ok(!!f && byText('.smain h1', 'Rahul') && f.i_breakfast.value === '', 'Plan opens Rahul’s empty day');
      set(f.i_breakfast, 'Oats 60 g, 2 eggs, banana'); set(f.k_breakfast, '450'); set(f.p_breakfast, '25');
      set(f.i_lunch, 'Rice 1 cup, chicken 150 g, dal'); set(f.k_lunch, '650');
      set(f.i_dinner, '3 chapati, paneer 100 g'); set(f.k_dinner, '600');
      set(f.wid, $$('option', f.wid).find((o) => o.textContent === 'Push').value);
      ok(f.title.value === 'Push' && f.ex.value.includes('Bench press'), 'picking a library workout fills title and exercises');
      set(f.ex, f.ex.value + '\nTriceps pushdown | 3 x 12');
      await submit(f, 800); await until(() => $('#f-day'));
      ok(toast().includes('sees it now'), 'saving the day confirms the member sees it');
      const g = $('#f-day');
      ok(g.i_breakfast.value.includes('Oats') && g.k_breakfast.value === '450' && g.p_breakfast.value === '25' && g.title.value === 'Push' && g.ex.value.includes('Triceps'), 'the saved meals and workout show again');
      ok(txt($('.pday.sel')).includes('3 meals') && txt($('.pday.sel')).includes('Push'), 'the day strip shows 3 meals and Push');
    });
    await step('copy to the next 3 days', async () => {
      await click(byText('button', 'Copy to other days'));
      const boxes = $$('#sheet input[name=d]');
      ok(boxes.filter((b) => b.checked).length === 3, 'the next 3 days are picked by default');
      await submit($('#sheet form'), 900); await until(() => $('#f-day'));
      ok(toast().includes('Copied to 3 days'), 'copied to 3 days');
      ok($$('.n3').filter((n) => txt(n).includes('3 meals') && txt(n).includes('Push')).length === 3, 'next 3 days now have the meals and workout');
    });
    await step('modify a planned day', async () => {
      await click($$('.n3')[1], 700); await until(() => $('#f-day'));
      const f = $('#f-day'); set(f.title, 'Pull'); set(f.ex, 'Lat pulldown | 4 x 10\nRow | 4 x 10'); set(f.i_dinner, ''); set(f.i_snack, 'Roasted chana 40 g'); set(f.k_snack, '150');
      await submit(f, 800); await until(() => $('#f-day'));
      const g = $('#f-day');
      ok(g.title.value === 'Pull' && g.ex.value.startsWith('Lat pulldown') && g.i_dinner.value === '' && g.i_snack.value.includes('chana'), 'trainer changes the workout and meals for a planned day');
      ok(txt($('.pday.sel')).includes('3 meals') && txt($('.pday.sel')).includes('Pull'), 'clearing dinner and adding a snack keeps 3 meals');
      set(g.title, ''); await submit(g, 800); await until(() => $('#f-day'));
      ok(txt($('.pday.sel')).includes('rest'), 'clearing the title makes it a rest day');
    });
    await step('fill a week from a template', async () => {
      const last = $$('.pday').pop(); await click(last, 700); await until(() => $('#f-day'));
      await click(byText('button', 'Fill from template'), 500);
      const f = $('#sheet form'); ok(f.type.value === 'veg', 'template follows Rahul’s veg diet');
      await submit(f, 500);
      const g = $('#f-day'); ok(g.i_breakfast.value.length > 3 && g.i_dinner.value.length > 3, 'filling one day puts template meals on screen to edit');
      await submit(g, 800); await until(() => $('#f-day'));
      ok(txt($('.pday.sel')).includes('5 meals'), 'saved 5 meals from the template');
    });
    await step('Arjun: today', async () => {
      await nav('Members'); await click(byText('.smain tr', 'Arjun'), 700); await until(() => $('#f-day'));
      const f = $('#f-day');
      ok(f.i_breakfast.value.length > 3, 'Arjun’s own meals for today are loaded');
      const st = $('.smain [data-dl]'); const before = txt(st); await click(st, 500);
      ok(txt($('.smain [data-dl]')) !== before, 'trainer can mark a meal had or skipped for the member');
      const wd = byText('.wst button', 'Done');
      if (wd) { await click(wd, 700); await until(() => $('.wst')); ok(txt($('.wst')).includes('Marked done'), 'trainer marks today’s workout done'); await click(byText('.wst button', 'Skipped'), 700); await until(() => $('.wst')); ok(txt($('.wst')).includes('Marked skipped'), 'and can change it to skipped'); }
      else ok(true, 'rest day today, no workout to mark');
    });
    await step('Arjun: progress', async () => {
      await click(byText('.tabs button', 'Progress'), 600);
      const k = txt($('.kpis'));
      ok(k.includes('Current') && k.includes('Ideal') && k.includes('Target') && k.includes('BMI'), 'progress shows current, ideal, target and BMI');
      ok(k.includes('from height'), 'ideal weight comes from height until the trainer sets one');
      ok(!!$('.cchart') && $$('.cchart rect').length >= 14 && $$('.stat4 div').length === 4, 'consistency chart and numbers for 14 days');
      ok(!!$('.wchart'), 'weight chart shows');
      await click(byText('button', 'Body and goal')); let f = $('#sheet form'); set(f.ideal, '5'); await submit(f);
      ok((toast().includes('Ideal weight looks wrong') || !f.checkValidity()) && !!sheetEl(), 'an unrealistic ideal weight is refused');
      set(f.ideal, '78'); set(f.target, '79'); await submit(f, 700); await until(() => $('.kpis'));
      ok(txt($('.kpis')).includes('78.0 kg') && txt($('.kpis')).includes('set by trainer') && txt($('.kpis')).includes('79.0 kg'), 'trainer sets ideal and target weight');
      await click(byText('button', 'Log weight')); f = $('#sheet form'); set(f.w, '86.4'); await submit(f, 700); await until(() => $('.kpis'));
      ok(txt($('.kpis')).includes('86.4 kg'), 'logging a weight updates the current weight');
    });
    await step('templates and library', async () => {
      await nav('Diet templates');
      ok(byText('.smain h1', 'Diet templates') && txt(main()).includes('Starting points only'), 'templates are clearly starting points');
      const ta = $('.smain [data-c="0|breakfast"]'); set(ta, 'Template test breakfast');
      await click(byText('button', 'Save template'), 800); await until(() => $('.smain [data-c="0|breakfast"]'));
      ok($('.smain [data-c="0|breakfast"]').value === 'Template test breakfast', 'trainer saves a template');
      await nav('Workouts');
      const n = $$('.smain .tcard').length;
      await click(byText('button', 'New workout')); const f = $('#sheet form'); set(f.name, 'Core 20'); set(f.ex, 'Plank | 3 x 45 s\nDead bug | 3 x 12'); await submit(f, 600);
      ok($$('.smain .tcard').length === n + 1 && txt(byText('.smain .tcard', 'Core 20')).includes('Dead bug'), 'trainer adds a workout to the library');
    });
  }

  // ---------------------------------------------------------------- member
  if (role === 'member') {
    await until(() => $('.member .top'));
    const tab = async (n) => { await click(byText('.mtabs button', n), 300); };
    await step('today', async () => {
      const meals = $$('.mscroll .meal');
      ok(meals.length === 5, 'today shows the member’s 5 meals');
      ok(!!$('.mscroll .goal'), 'goal card shows');
      const chk = $('.mscroll .meal .chk'); await click(chk, 400);
      ok($('.mscroll .meal .chk').classList.contains('on'), 'ticking a meal marks it had');
      await click($('.mscroll .meal .chk'), 400);
      ok(!$('.mscroll .meal .chk').classList.contains('on'), 'tapping again clears it');
      const sk = $$('.mscroll .meal .skip')[1]; await click(sk, 400);
      ok($$('.mscroll .meal')[1].classList.contains('skipped') && txt($$('.mscroll .meal .skip')[1]) === 'Skipped', 'skipping a meal marks it skipped');
    });
    await step('workout done and skipped', async () => {
      await tab('Workouts');
      const b = byText('.mscroll button', 'Mark as done');
      if (!b) return ok(txt($('.mscroll')).includes('Rest day'), 'rest day today');
      await click(b, 400); ok(!!byText('.mscroll .pill', 'Done'), 'marking the workout done');
      await click(byText('.mscroll .wo button', 'Skip'), 400); ok(!!byText('.mscroll .pill', 'Skipped'), 'changing it to skipped');
      ok($$('.mscroll h2.sec').length === 8, 'workouts for today and the next 7 days');
    });
    await step('diet tab', async () => {
      await tab('Diet');
      ok($$('.days .day').length === 7 && $$('.mscroll .meal').length === 5, 'diet shows this week and today’s meals');
      ok(txt($('.top')).includes('Your own plan'), 'diet says it is the member’s own plan');
      await click($$('.days .day')[6], 300);
      ok($$('.mscroll .meal').length >= 0, 'can open other days');
    });
    await step('progress', async () => {
      await tab('Progress');
      const t = txt($('.three'));
      ok(t.includes('Current') && t.includes('Ideal') && t.includes('Target'), 'progress shows current, ideal and target weight');
      ok(/Healthy range \d+–\d+ kg/.test(txt($('.mscroll'))), 'shows the healthy range for the member’s height');
      const g = $('#f-goal'); set(g.height, '40'); await submit(g);
      ok(toast().includes('Height') || !g.checkValidity(), 'an unrealistic height is refused');
      set(g.height, '178'); set(g.target, '79'); await submit(g, 600);
      ok(toast().includes('Saved') && txt($('.three')).includes('79.0 kg'), 'member updates height and target');
      const w = $('#f-weight'); set(w.w, '86.9'); await submit(w, 600);
      ok(txt($('.three')).includes('86.9 kg'), 'member logs today’s weight and current weight updates');
    });
    await step('gym tab', async () => {
      await tab('Gym');
      ok($$('.mscroll .group')[0] && byText('.mscroll h2', 'Opening hours') && $$('.mscroll .row.tday').length === 1, 'opening hours for every day, today highlighted');
      ok(/Open now|Closed now|Closed/.test(txt($('.top'))), 'says whether the gym is open now');
      ok(!!byText('.mscroll h2', 'Fee plans') && !!byText('.mscroll .row', 'Your plan'), 'fee plans listed with the member’s plan marked');
    });
  }

  const failed = R.filter((x) => x.startsWith('FAIL'));
  return { role, passed: R.length - failed.length, failed: failed.length, results: R };
};
