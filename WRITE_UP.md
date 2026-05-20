# BlueTree Domain Selector — Write-up

## Stack choice

**Vite + React + Supabase, deployed to Vercel.**

- **Vite + React**: this is a single-user internal tool, not a marketing site. SSR buys nothing. Vite gives sub-second HMR and ships a tiny production bundle. React was picked over Svelte/Solid only because it makes onboarding the next dev trivial.
- **Supabase (Postgres)**: the spec says the reasoning config must live in a database with versioning, editable without a code change. Postgres gives me proper schemas (`jsonb` for `target_pages` and `disqualifiers`, `numeric` for caps), and Supabase ships the admin table editor + browser-safe client for free. No server-side glue code to maintain.
- **No backend service**: scoring is a pure JS function that runs in the browser against the inventory loaded from Supabase. 1k rows × 7 dimensions scores in ~50ms. Putting it server-side would only add latency and a deploy target without changing the answer.
- **Vercel**: zero-config for Vite + auto-deploy from GitHub. The whole tool is browser → Supabase, so there's no server to host elsewhere.

The tradeoff I accepted: the anon key is in the browser. That's fine for a single-user internal tool behind RLS — but if this ever opened to multiple clients, the inventory query would need to move server-side.

## UX decisions I'm proudest of

1. **The reasoning is always visible without being noisy.** Every row in the shortlist has a one-sentence summary (*"Strong niche match. Excellent DR, high traffic, well under budget."*) auto-generated from the score breakdown, plus a click-to-expand popover with the per-dimension numbers (`Niche 33/40`, `DR 15/15`, …). The reviewer never has to ask "why this domain over that one?" — it's right there.

2. **Auto-select within budget, manually adjustable.** When you open a campaign, the tool runs the greedy budget-aware picker (sort by score, fill up to `link_count_goal` skipping any domain that would bust `budget_per_link × link_count_goal`) and pre-checks those rows. The user starts from a defensible default and adjusts — instead of starting from zero and hunting. Plus the "Top 25 / 50 / 100" toggle directly on Results matches how the team thinks about shortlist size.

3. **Versioned config with a real diff view.** Every save to `/admin` writes a new row with `is_active = true` and demotes the prior. The version history table has a **Details** button that shows every field side-by-side with the prior version — changes highlighted in blue. Rollback is one click. Combined with `campaigns.scoring_config_id`, you can always answer "what config produced this campaign?"

4. **Mid-job recovery.** The new campaign form persists to `localStorage` on every keystroke. If the user refreshes during a long scoring run, the form repopulates and shows a "📝 Restored draft" banner with a "Start fresh" escape. Small detail, but the spec explicitly calls out mid-job error handling as a thing they look for.

## What I cut

- **LLM-based niche reasoning.** The framework mentions it as optional and the spec asks for prompts to be stored, not invoked. The `niche_prompt` field is stored on each scoring profile and there's a niche-prompt editor in Admin — wiring up the actual call (OpenAI / Claude with the stored prompt against domain niche text) is a single function away, but it would have meant adding a server route for the API key. Out of scope for the deterministic v1.
- **Per-row "Why was this disqualified?" expanded explanations.** The disqualified tab shows the reason string from the engine (e.g. *"Nofollow only — client requires dofollow"*), which is enough. A future audit modal could show the full breakdown of how close the domain came to qualifying.
- **Web Worker for scoring.** 1k rows is fast enough on the main thread that the progress bar feels honest. If the inventory grows past ~10k rows this needs to move to a Worker.
- **Auth.** Spec says single-user, no auth needed. Anon key + open RLS is the right call for the brief — adding Supabase auth would be 30 minutes of yak-shaving for zero spec value.

## What I'd change with more time

- **A "compare two campaigns" view.** Same client, two scoring configs side by side, see which domains move in and out of the shortlist. This is the real test of a config change.
- **Domain inventory health page.** A read-only dashboard at `/inventory` showing distribution of DR / traffic / price / niche tags. Right now you import a CSV and have to trust it — a quick chart would catch a bad import immediately.
- **Move the anon-key inventory query to a Supabase Edge Function.** Stays serverless, but the inventory stops being browser-readable. Worth doing before this tool sees a second tenant.
- **Per-rule disqualifier preview.** When you add a rule like `tat contains "8 weeks"` in Admin, show "this would disqualify N additional domains in the current inventory" inline. Right now the only way to find out is to run a campaign.
- **Sticky filter chips above the table.** The per-column filters work but they're tucked into the table head. A row of removable chips above the totals bar would make the filter state more obvious.
- **A real Storybook of edge cases.** The sanity check covers the framework's worked example, but a fuller suite — empty niche, all disqualified, single-rule pathological cases — would let me refactor the scoring engine fearlessly.
