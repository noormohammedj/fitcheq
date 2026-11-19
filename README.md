# Fitcheq

Gym member app, owner console and sales site, by [Inraa Solution](https://inraasolution.com).

Plain HTML, CSS and JavaScript with sample data. No build step. Hosted on GitHub Pages.

| File | What it is |
| --- | --- |
| `index.html`, `js/`, `style.css` | The live trial app (sign in at https://fitcheq.inraasolution.com) |
| `demo/` | Sales site with live, self-playing app demos and pricing (https://fitcheq.inraasolution.com/demo/) |
| `demo/member.html` | Member app prototype (Today, Diet, Progress, Gym, Account) |
| `demo/admin.html` | Owner console prototype (members, trainers, sessions, diet plans, equipment, promotions, billing) |
| `data.js` | Sample gym data, diet and workout generator, weight projection model, shared state |
| `app.js` / `app.css` | Member app |
| `admin.js` / `admin.css` | Owner console |
| `demo.js` | Plays scripted taps inside the live app for the sales site |

The Inraa Solution website embeds the demo member app from `demo/`, so keep `demo/data.js`, `demo/app.js`,
`demo/app.css` and `demo/demo.js` at these paths.

## Run locally
```bash
python3 -m http.server 8737
```
Then open http://localhost:8737.

## Trial app (site root)

A working app on Supabase for the Prozone, Dindigul trial. Live at https://fitcheq.inraasolution.com/ (the old `/app/` link redirects there).
Everyone signs in with their mobile number and a password the owner gives them.

| Role | Can do |
| --- | --- |
| Owner (admin) | Members (add, edit, payments, reminders, reset password, switch login off), trainers, weekly veg and non-veg diet plans, workouts, facilities, events, messages, gym profile |
| Trainer | See members, assign workouts for any day, mark workouts and meals done or skipped, log weight, load the weekly veg and non-veg diet plan, manage the workout library |
| Member | Diet chart for the week, tick or skip each meal, see progress to goal and a target date, today's and the next 7 days' workouts, log weight, set target weight and veg / non-veg |

| Path | What it is |
| --- | --- |
| `index.html` | Sign-in and role routing |
| `js/config.js` | Supabase URL and public anon key |
| `js/core.js` | Client, sign-in, goal maths, shared UI |
| `js/member.js` | Member screens |
| `js/staff.js` | Trainer and owner screens |
| `supabase/migrations/` | Tables (prefixed `fq_`), row-level security, helper functions |
| `supabase/functions/fitcheq-admin-users/` | Creates logins, resets passwords, switches logins on or off (owner only) |
| `scripts/seed-trial.mjs` | Creates the Prozone (Dindigul) trial gym with sample members and history |

**Where the data lives:** for the trial, Fitcheq shares the Plotskart Supabase project (Supabase's free plan allows two
projects). Every Fitcheq table and function starts with `fq_`, so nothing touches Plotskart's tables. To move out later,
create a new project, apply the migration there, copy the `fq_` tables, and change `js/config.js`.

**Commands**
```bash
npm run test:db
```
```bash
npx supabase db query --linked --project-ref yyrxjsqhmfoncunjurga -f supabase/migrations/20261119000000_fitcheq_core.sql
```
```bash
npx supabase functions deploy fitcheq-admin-users --project-ref yyrxjsqhmfoncunjurga --use-api
```
Seeding needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment (kept in `.secrets/`, never committed).
