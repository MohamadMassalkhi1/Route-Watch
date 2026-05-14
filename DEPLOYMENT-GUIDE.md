# RouteWatch Ottawa-Gatineau — Deployment & Maintenance Guide

> A complete guide to deploy, configure, and scale RouteWatch for free.  
> Estimated setup time: **30–45 minutes**.

---

## 📁 Project File Structure

```
routewatch/
├── index.html                   ← The entire frontend app
├── netlify.toml                 ← Netlify build & redirect config
├── netlify/
│   └── functions/
│       └── analyze.js           ← Secure Claude AI proxy function
└── supabase-schema.sql          ← Full database schema (run once)
```

---

## STEP 1 — Set Up Supabase (Free Database + Realtime)

Supabase gives you a free PostgreSQL database with realtime WebSocket
support — perfect for live map updates across all users.

### 1a. Create your project

1. Go to **https://supabase.com** and sign up (free)
2. Click **New Project**
3. Name it `routewatch` — choose region **Canada (Central)** `ca-central-1`
4. Set a strong database password and save it somewhere safe
5. Wait ~2 minutes for the project to spin up

### 1b. Run the database schema

1. In your Supabase dashboard, click **SQL Editor** → **New Query**
2. Open the file `supabase-schema.sql` from your project folder
3. Paste the entire contents into the editor
4. Click **Run** (green button)
5. You should see: *"Success. No rows returned"*

This creates:
- `issues` table with all columns
- Row Level Security (RLS) so only your app can write
- `increment_votes` and `increment_resolve_votes` RPC functions (atomic, safe)
- Realtime enabled so new reports appear live for all users
- A stats view and weekly 311 export function

### Alternative: Use Firebase Firestore (Free tier)

If you can't use Supabase, Firebase Firestore is a good free alternative with realtime listeners.

1. Go to https://console.firebase.google.com and create a new project.
2. In the project, go to **Firestore Database** -> Create database -> Start in test mode (for quick testing).
3. Go to **Project settings** and copy the Firebase SDK config object (apiKey, authDomain, projectId, etc.).
4. Open `index.html` and paste your config into the `FIREBASE_CONFIG` constant near the top.
5. Firestore collection name to use: `issues` (the web app will create documents there automatically).

Notes:
- Firestore test mode allows quick setup. For production, configure security rules to prevent abuse.
- The codebase includes a Firestore wrapper and realtime listener; no backend changes required.

### 1c. Get your credentials

In your Supabase project dashboard:
1. Go to **Settings** → **API**
2. Copy these two values:
   - **Project URL** → looks like `https://abcdefgh.supabase.co`
   - **anon public key** → a long JWT string starting with `eyJ...`

> ✅ The anon key is safe to put in your HTML — it's public by design.  
> ❌ Never put the `service_role` key in the frontend.

---

## STEP 2 — Configure index.html

Open `index.html` and find this block near the top of the `<script>` section:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const CLAUDE_PROXY = 'YOUR_NETLIFY_FUNCTION_URL';
const RESOLVE_THRESHOLD = 50;
```

Replace:
- `YOUR_SUPABASE_URL` → your Project URL from Step 1c
- `YOUR_SUPABASE_ANON_KEY` → your anon key from Step 1c
- `YOUR_NETLIFY_FUNCTION_URL` → `/.netlify/functions/analyze` (set this after Step 3)
- `RESOLVE_THRESHOLD` → `50` means 50 community votes to auto-resolve (adjust as needed)

---

## STEP 3 — Deploy to Netlify (Free Hosting + Serverless)

### Option A: Drag & Drop (Fastest — 2 minutes)

1. Go to **https://app.netlify.com** and sign up (free)
2. From the dashboard, drag your **entire `routewatch/` folder** onto the page
3. Netlify will detect `netlify.toml` and deploy automatically
4. You'll get a URL like `https://random-name.netlify.app`

### Option B: GitHub (Recommended for updates)

1. Create a free account at **https://github.com**
2. Click **New Repository** → name it `routewatch`
3. Upload all files (drag into GitHub UI, or use Git CLI):
   ```bash
   git init
   git add .
   git commit -m "Initial deploy"
   git remote add origin https://github.com/YOURUSERNAME/routewatch.git
   git push -u origin main
   ```
4. Go to **https://app.netlify.com** → **Add new site** → **Import from Git**
5. Connect GitHub → select your `routewatch` repo
6. Build settings are auto-detected from `netlify.toml`
7. Click **Deploy site**

> **Advantage of GitHub:** Every time you push a change, Netlify auto-redeploys
> in ~30 seconds. No manual uploads needed.

### 3a. Set a custom domain (optional, free)

1. In Netlify: **Site Settings** → **Domain Management** → **Add custom domain**
2. Enter `routewatch-ottawa.ca` (or whatever you buy from Namecheap ~$12/yr)
3. Netlify provides free HTTPS automatically via Let's Encrypt

---

## STEP 4 — Add Your Anthropic API Key to Netlify

This keeps your API key secret — it never appears in your HTML.

1. In Netlify: **Site Settings** → **Environment Variables** → **Add variable**
2. Add:
   ```
   Key:   ANTHROPIC_API_KEY
   Value: sk-ant-api03-YOUR-KEY-HERE
   ```
3. Click **Save**
4. Go to **Deploys** → **Trigger deploy** → **Deploy site** to apply

Now update `index.html` to use the function:
```js
const CLAUDE_PROXY = '/.netlify/functions/analyze';
```

---

## STEP 5 — Test Everything

After deploying, verify each feature:

| Feature | How to test |
|---|---|
| Map loads | Open your site — map should show Ottawa |
| Geolocation | Click "My Location" — allow permission in browser |
| Submit report | Pick type, severity, click map, submit |
| Realtime | Open site in two tabs — submit in one, appears in other |
| AI analysis | Fill report form → click AI Analyze |
| Bilingual | Click FR button — all text switches to French |
| Resolve poll | Click "✓ Mark Resolved" on a card — see vote bar increase |
| Export CSV | Click Export → CSV → file downloads |
| Database | Go to Supabase → Table Editor → issues → verify rows appear |

---

## 🔁 How Reports Are Shared with Ottawa & Gatineau 311

**Currently the app does this automatically in two ways:**

### 1. In-App Email Button
The **Export → Send to 311** button opens your email client pre-filled with:
- Subject: `RouteWatch Road Issues Report`
- To: `311@ottawa.ca`
- Body: Critical issues summary + link to the map

You can manually forward this weekly.

### 2. Automated Weekly Email (Advanced Setup)

Set up a Supabase Edge Function that runs every Monday at 8am and emails
a CSV of all new unresolved critical/high issues to city contacts.

Create this file at `supabase/functions/weekly-report/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const { data } = await supabase.rpc('get_weekly_311_report')

  const csv = [
    'ID,Type,Severity,City,Address,Description,Votes',
    ...(data || []).map(r =>
      `${r.id},${r.type},${r.severity},${r.city},"${r.addr}","${r.description}",${r.votes}`
    )
  ].join('\n')

  // Use Resend.com (free tier: 3,000 emails/month) to send the email
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'RouteWatch <reports@yourdomain.ca>',
      to: ['311@ottawa.ca', '311@gatineau.ca'],
      subject: `RouteWatch Weekly Road Issues — ${new Date().toLocaleDateString('en-CA')}`,
      text: `Please find attached this week's citizen-reported road issues.\n\n${csv}`,
      attachments: [{
        filename: 'routewatch-weekly.csv',
        content: btoa(csv),
      }],
    }),
  })

  return new Response('Weekly report sent', { status: 200 })
})
```

Deploy it:
```bash
npx supabase functions deploy weekly-report
```

Schedule it in Supabase → **Edge Functions** → **Schedules**:
```
Cron: 0 8 * * 1   (Every Monday at 8:00 AM UTC)
```

---

## 🚀 Scaling Guide — When Many People Use It

### Free tier limits (what you get for $0)

| Service | Free Limit | When you'd hit it |
|---|---|---|
| **Netlify** | 100GB bandwidth/month | ~500,000 page loads |
| **Netlify Functions** | 125,000 invocations/month | ~125,000 AI analyses |
| **Supabase** | 500MB database, 5GB bandwidth | ~50,000 issues |
| **Supabase Realtime** | 200 concurrent connections | ~200 simultaneous users |
| **Anthropic API** | Pay-per-use (~$0.003/analysis) | $3 per 1,000 AI analyses |

### For moderate traffic (1,000–10,000 users/month)

All free tiers should handle this comfortably. No changes needed.

### For high traffic (10,000–100,000 users/month)

**Database optimizations** (already in the schema):
- Indexes on `city`, `type`, `severity`, `created_at`, `lat/lng` ✅
- Paginate the feed: add `.range(0, 49)` to your Supabase query

Add pagination to `loadIssues()` in `index.html`:
```js
async function loadIssues(page = 0) {
  const from = page * 50;
  const { data } = await db
    .from('issues')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, from + 49);  // 50 per page
  issues = page === 0 ? data.map(dbRowToIssue) : [...issues, ...data.map(dbRowToIssue)];
  renderAll();
}
```

**Netlify upgrade:** $19/month Pro plan gives:
- 1TB bandwidth
- 3,000,000 function invocations
- Password protection (useful for admin views)

**Supabase upgrade:** $25/month Pro plan gives:
- 8GB database
- No connection limits
- Daily backups

### For viral traffic (100,000+ users/month)

1. **Enable Supabase connection pooling** (PgBouncer) — free in Pro
2. **Add a CDN layer**: Cloudflare free plan in front of Netlify
3. **Cache the feed**: Store the issue list in localStorage and refresh every 60 seconds
   instead of on every page load
4. **Rate limit submissions**: Add Netlify's rate limiting to the analyze function

Add this to `netlify.toml`:
```toml
[functions."analyze"]
  included_files = []

[[edge_functions]]
  path = "/.netlify/functions/analyze"
  function = "analyze"
```

---

## 🔧 Routine Maintenance

### Weekly (5 minutes)
- [ ] Check Supabase Table Editor — review new reports
- [ ] Export CSV and forward to 311 if there are critical issues
- [ ] Check Netlify deploy logs for any errors

### Monthly (15 minutes)
- [ ] Review Supabase usage dashboard — ensure under free limits
- [ ] Check Anthropic API usage — review cost
- [ ] Delete spam/test entries from Supabase directly

### How to delete a bad report (spam/test)

In Supabase → SQL Editor:
```sql
-- Delete by ID
DELETE FROM public.issues WHERE id = 123;

-- Delete all test entries
DELETE FROM public.issues WHERE addr LIKE '%test%' OR description LIKE '%test%';

-- Delete all older than 1 year
DELETE FROM public.issues WHERE created_at < NOW() - INTERVAL '1 year';
```

### How to manually resolve an issue (admin override)

```sql
UPDATE public.issues
SET resolved = TRUE, resolved_at = NOW()
WHERE id = 123;
```

### How to reset the resolve poll threshold

If you want to change the threshold (e.g., from 50 to 25):
1. Update `RESOLVE_THRESHOLD = 25` in `index.html`
2. Redeploy to Netlify

---

## 🔐 Security Notes

| What | Why it's safe |
|---|---|
| Supabase anon key in HTML | Designed to be public — RLS policies restrict what it can do |
| Anthropic key in Netlify env | Never sent to browser — only used in serverless function |
| RLS policies | Anonymous users can only INSERT and SELECT, never UPDATE/DELETE |
| No user accounts | No passwords to leak — votes tracked via localStorage |

---

## 📞 Support Contacts

- **Supabase docs**: https://supabase.com/docs
- **Netlify docs**: https://docs.netlify.com
- **Anthropic API**: https://docs.anthropic.com
- **Ottawa 311**: 613-580-2400 | 311@ottawa.ca
- **Gatineau 311**: 819-595-7633

---

## ✅ Quick-Start Checklist

```
□ Created Supabase project (Canada region)
□ Ran supabase-schema.sql in SQL Editor
□ Copied Supabase URL + anon key into index.html
□ (Alternative) Created Firebase project and pasted `FIREBASE_CONFIG` into `index.html`
□ Uploaded routewatch/ folder to Netlify
□ Added ANTHROPIC_API_KEY to Netlify environment variables
□ Set CLAUDE_PROXY = '/.netlify/functions/analyze' in index.html
□ Redeployed Netlify after env var change
□ Tested geolocation (My Location button)
□ Submitted a test report and verified it in Supabase table
□ Deleted test report from Supabase SQL Editor
□ (Optional) Set up custom domain
□ (Optional) Set up weekly 311 email cron
```
