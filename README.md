# Fitcheq

Gym member app, owner console and sales site, by [Inraa Solution](https://inraasolution.com).

Plain HTML, CSS and JavaScript with sample data. No build step. Hosted on GitHub Pages.

| File | What it is |
| --- | --- |
| `index.html` | Sales site with live, self-playing app demos and pricing |
| `member.html` | Member app prototype (Today, Diet, Progress, Gym, Account) |
| `admin.html` | Owner console prototype (members, trainers, sessions, diet plans, equipment, promotions, billing) |
| `data.js` | Sample gym data, diet and workout generator, weight projection model, shared state |
| `app.js` / `app.css` | Member app |
| `admin.js` / `admin.css` | Owner console |
| `demo.js` | Plays scripted taps inside the live app for the sales site |

The Inraa Solution website embeds the member app from this site, so keep `data.js`, `app.js`, `app.css`
and `demo.js` at these paths.

## Run locally
```bash
python3 -m http.server 8737
```
Then open http://localhost:8737.
