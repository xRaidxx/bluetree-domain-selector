# BlueTree Domain Selector

Internal tool for scoring vendor domains against a client brief and exporting a campaign management file.

The scoring framework lives in Supabase, not in code — weights, disqualifier rules, and per-profile overrides are editable from the Admin screen with versioning and rollback. No deploy needed to retune the model.

---

## Local setup

```bash
npm install
cp .env.example .env       # then fill in your Supabase values
npx vercel dev
```

Open <http://localhost:3000>.

> `vercel dev` runs both the Vite frontend and the `/api` serverless functions together locally. Plain `npm run dev` (Vite only) will load the UI but all database calls will fail since the API routes won't be running.

### Environment variables

`.env` (gitignored — never commit it):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

All database access goes through Vercel serverless functions (`/api/*`) that run server-side. No Supabase credentials are ever sent to the browser.

---

## Supabase setup (one-time)

1. Create a project at <https://supabase.com>.
2. Open the SQL editor and run the entire contents of [`supabase/migration.sql`](supabase/migration.sql). This creates:
   - `domains` — vendor inventory (32 fields)
   - `scoring_config` — versioned scoring weights + disqualifier rules
   - `campaigns` — saved campaigns with full results + brief metadata
   - 4 seeded scoring profiles: `standard`, `ecommerce`, `fintech`, `local_services`
3. Load the vendor inventory in the app: top bar → **+ Import CSV** → drop the file. The importer auto-detects the header row, maps known columns (DR, traffic, niche, prices, etc.), and lists any unmapped columns so you can see what was skipped.

---

## Updating the reasoning config

**Admin UI (recommended)** — go to `/admin`:

1. Pick a **profile** (Standard / Ecommerce / Fintech / Local Services), or click **+ New profile** to add a domain-specific one.
2. Edit any of:
   - **Dimension caps** — Niche match, DR, Traffic, Price efficiency, Ranking bonus, Geo, No red flags
   - **Default minimums** — DR, traffic, shortlist size, default follow preference
   - **Niche matching prompt** — stored for future LLM enrichment
   - **Disqualifier rules** — add custom rules using `field + operator + value` (e.g. `red_flags contains "spam"`, `tat gt "4 weeks"`). These run in addition to the built-in DR / traffic / follow / ranking checks.
3. Click **Save — create new version**. The new version becomes active immediately. No deploy needed.

**Direct DB edit** (escape hatch):

- Open Table Editor → `scoring_config`.
- Set `is_active = false` on all rows for the profile.
- Insert a new row with incremented `version` and `is_active = true`.

---

## Rolling back a config change

**Admin UI** — `/admin` → select profile → in the version history table, click **Rollback** on any archived version. The previously active version becomes archived; the chosen one becomes active.

You can also click **Details** on any version to see all field values, with a side-by-side comparison against the prior version — changed fields are highlighted in blue.

**Direct DB edit**:

- Set `is_active = false` on the current active row.
- Set `is_active = true` on the version you want to restore.

Campaigns store `scoring_config_id` so historical results remain traceable to the exact config version that produced them.

---

## Deployment (Vercel)

1. Push to GitHub.
2. Connect the repo at <https://vercel.com/new> — Vite is auto-detected.
3. Add environment variables in **Settings → Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Every push to `main` auto-deploys.

---

## Sanity check

The scoring engine ships with a built-in unit test based on the worked example in the scoring framework doc. Open the browser console on any page and run:

```js
import('/src/lib/scoring.js').then(m => m.runSanityCheck())
```

Expected output: `✅ PASS — Score: 82 / 100`

If this fails, the scoring math has drifted from the spec — do not deploy.

---

## XLSX export structure

Each campaign export produces 5 sheets matching the campaign management template:

1. **Client Info** — 22 named columns, one row per campaign (status, period, deadlines, AM, etc.)
2. **Client Target Pages** — `# / Target URL / Primary Keyword`
3. **CM** — 39 columns (34 named + 4 blank + Hash); Profit column uses an Excel formula `=P{row}-I{row}` so editing Order Price recomputes margin
4. **Referring Domains – {client}** — 14-column SEO context table
5. **__CM_HISTORY** + **__CM_STATE** — operational metadata sheets matching the sample template

---

## Project layout

```
src/
├── App.jsx                       # Router + topbar
├── lib/
│   ├── scoring.js                # Pure scoring function (no side effects, deterministic)
│   ├── csvImport.js              # CSV parser w/ header auto-detect + column mapping
│   ├── export.js                 # XLSX export
│   └── supabase.js               # Single client instance
├── pages/
│   ├── Home.jsx                  # Campaigns list w/ search, multi-select delete
│   ├── NewCampaign.jsx           # Campaign creation form (auto-saves to localStorage)
│   ├── EditCampaign.jsx          # Edit campaign — save info only, or re-score
│   ├── Results.jsx               # Shortlist + disqualified + filters + export
│   └── Admin.jsx                 # Versioned scoring config editor
└── components/
    ├── ImportModal.jsx           # CSV import w/ drag-drop and staged confirm
    └── GeoMultiSelect.jsx        # Chip-style country code multi-select

supabase/
└── migration.sql                 # Full schema + seed
```

---

## Write-up

See [`WRITE_UP.md`](WRITE_UP.md) for stack choice, UX decisions, what was cut, and what would change with more time.
