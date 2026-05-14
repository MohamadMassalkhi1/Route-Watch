# RouteWatch — Ottawa–Gatineau

This repo contains a static single-file frontend (`index.html`) for a citizen road-issue map and a Netlify Function proxy (`netlify/functions/analyze.js`) used for AI analysis.

This README covers a Firebase (Firestore) alternative (if you can't use Supabase), local git setup, and Netlify deployment steps.

## 1) Firebase Firestore setup (free tier)

1. Go to https://console.firebase.google.com and create a new project.
2. In the project, open **Firestore Database** and create a database (start in **test mode** for quick setup).
3. Go to **Project settings** → **SDK configuration** and copy the firebase config object:

```js
const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  // optionally storageBucket, messagingSenderId, appId
};
```

4. Open `index.html` and replace the `FIREBASE_CONFIG` placeholder near the top with your values.
5. Make sure `CLAUDE_PROXY` is set to `/.netlify/functions/analyze` after Netlify deployment (or keep the placeholder when testing locally).

Notes:
- Firestore in test mode is permissive; before public production use, add Firestore security rules to restrict writes.
- The app uses a Firestore collection named `issues`.

## 2) Local git (create a local commit)

Run these commands in the project folder (zsh):

```bash
cd "/Users/mohamadmassalkhi/Documents/Pothole Ottawa-Gatineau"
git init
git add .
git commit -m "Initial commit — RouteWatch (Firestore support)"
```

If you want to create a GitHub repo and push:

Option A (manual via GitHub web UI):
- Create an empty repo on GitHub named `routewatch`.
- Then run:

```bash
git remote add origin https://github.com/YOURUSERNAME/routewatch.git
git branch -M main
git push -u origin main
```

Option B (GitHub CLI - `gh`) — if you have `gh` installed and authenticated:

```bash
# creates repo, sets remote origin and pushes
gh repo create YOURUSERNAME/routewatch --public --source=. --remote=origin --push
```

## 3) Netlify deployment (free)

- If you use GitHub: connect the repository in the Netlify UI (Add new site → Import from Git).
- If you prefer quick upload: drag-and-drop the project folder in the Netlify dashboard.

Important Netlify settings:
- `netlify.toml` is already set to publish `.` and `functions = "netlify/functions"`.
- Add environment variable in Netlify site settings: `ANTHROPIC_API_KEY` = `sk-...` (so `analyze.js` can call Anthropic).
- Set `CLAUDE_PROXY` in `index.html` to `/.netlify/functions/analyze` and push redeploy.

## 4) Post-deploy checks

- Confirm map loads and DB state shows Live when Firestore configured.
- Submit a test report and verify it appears in Firestore console.
- Test AI analysis (requires `ANTHROPIC_API_KEY` set in Netlify env).

## 5) Notes & security

- Firestore test mode: change rules before public release.
- Anthropic key must stay secret — keep it only in Netlify environment variables.
- The project includes both Supabase and Firestore options in `index.html`; pick one.

---

If you want, I can also:
- Prepare the exact `gh` commands for creating the remote and pushing, or
- Continue and connect the repo to Netlify in the UI steps, or
- Help set basic Firestore rules to limit write rate.
