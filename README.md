# Income-tax Act, 2025 — automated reference site

A static, mobile-first reference site for the Indian **Income-tax Act, 2025**, Income-tax
Rules 2026, CBDT material, case law, and a 1961-vs-2025 comparison — with one new,
provision published automatically once you start the workflow.

## 1. Architecture

- **Astro** (static output) — no server, no database.
- **Official Act text:** `content/source/<id>.txt` — one file per section, the exact
  wording from the government PDF, loaded by `scripts/seed-queue.mjs` and kept current by
  `scripts/check-amendments.mjs`. Never written or edited by AI.
- **Amendment records:** `content/amendments/<date>-<section>.json` — one file per detected
  change, with the exact diff and (if it passed its check) Gemini's commentary. Shown on
  `/amendments` and on the section's own page.
- **Study guides:** `content/study/<id>.json` — commentary, worked example, MCQs and
  mnemonics for one section, only ever written after passing the checks described above.
- **Content database:** `content/sections.json` — a deterministic, ordered queue of
  provisions with a `status` (`pending → researching → draft → review → published/failed`).
  The pipeline always picks the *first* `pending` item — never a random one.
- **Articles:** `content/articles/<slug>.md` — Markdown + YAML frontmatter, one fixed
  structure (Official Provision → Simple Explanation → Practical Example → Related
  Provisions → Rules → CBDT Material → Case Law → 1961 vs 2025 → Practical Notes → Sources).
- **AI abstraction:** `src/ai/provider.mjs` — every AI call in the codebase goes through
  `complete()` here. Switch providers with the `AI_PROVIDER` env var (`claude` / `gemini`
  / `manual`) — nothing else needs to change.
- **Pipeline scripts** (`scripts/`):
  - `generate.mjs` — researches (via web search) and drafts the next pending article.
  - `validate.mjs` — quality gate: required sections present, no placeholder text,
    no duplicate slugs, required frontmatter present. Blocks publishing on failure.
  - `publish.mjs` — flips the queue item to `published` only if validation passed.
  - `run-pipeline.mjs` — orchestrates the above three steps; idempotent (safe to
    run twice in a day — it will not create a second article).
  - `build-sitemap.mjs`, `build-search-index.mjs` — run as part of `npm run build`,
    after `astro build`, to write `sitemap.xml`, `robots.txt`, `rss.xml` and
    `search-index.json` into `dist/`.
- **Search:** a static `search-index.json` plus a small client-side filter in
  `/search` — no external search service, no cost.
- **Calculators:** deterministic JS only (see `src/lib/calculators/README.md`). AI is
  never used to compute or check tax arithmetic, and a calculator stays "pending
  verification" on the site until its rate table is confirmed against the Finance
  Act currently in force.
- **Deployment:** Cloudflare Pages, connected directly to this GitHub repo, rebuilding
  on every push. GitHub Actions handles the *daily research + publish* job; Cloudflare
  handles the *build + hosting*.

Target infra cost: **₹0** (GitHub Actions free tier + Cloudflare Pages free tier). The
only recurring cost is your AI provider's API usage for the research/generation
call — that is metered by Anthropic/Google, not free, and is not controlled by this repo.

## 2. Folder structure

```
content/
  sections.json          the deterministic publishing queue
  articles/*.md           one file per published/drafted provision
  case-law/, cbdt/, mapping/   reserved for future structured databases
src/
  ai/provider.mjs          AI provider abstraction (claude/gemini/manual)
  lib/content.mjs          reads the queue + articles
  lib/calculators/         deterministic calculator logic (none wired to real rates yet)
  layouts/Layout.astro      shared page shell, SEO tags
  pages/                    every route in the site
scripts/                    the automation pipeline (see above)
.github/workflows/daily-publish.yml   the publishing workflow (manual start, no schedule)
wrangler.jsonc               tells Cloudflare's "npx wrangler deploy" to serve dist/ as static assets
```

## 3. Local setup

```bash
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY if you want to test generation
npm run dev                # http://localhost:4321
```

## 4. GitHub setup (things only you can do)

1. Create a new GitHub repository and push this project to it.
2. In the repo, go to **Settings → Secrets and variables → Actions**:
   - Add secret `GEMINI_API_KEY` — get a free key at aistudio.google.com (Get API
     key → Create API key in new project; no card required). This is the default
     provider for this project.
   - If you'd rather use Claude instead, add secret `ANTHROPIC_API_KEY`
     (console.anthropic.com — paid) and set the `AI_PROVIDER` repo Variable to `claude`.
   - Optionally add repo **Variables** (not secrets): `AI_PROVIDER` (`gemini` by
     default), `GEMINI_MODEL`, `ANTHROPIC_MODEL`, `SITE_URL` (your real domain once
     you have one).
3. Confirm **Settings → Actions → General → Workflow permissions** is set to
   "Read and write permissions" (needed so the workflow can commit and push).

## 5. Cloudflare setup (things only you can do)

Cloudflare's onboarding has two flows depending on when you signed up — use whichever
one you're shown:

**If you see "Create an app" with Build command / Deploy command fields** (the current
flow as of 2026): this repo is already configured for it.
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Click **Deploy**. This uses `wrangler.jsonc` in the repo root, which tells Wrangler
  to serve everything `npm run build` puts into `dist/` as static assets — no server
  code, just files. You don't need to fill in anything else on that screen.

**If you see the older "Pages → Connect to Git" flow with a plain output-directory
field:**
- Build command: `npm run build`
- Build output directory: `dist`

Either way:
- Node version: 20 (set `NODE_VERSION=20` as an environment variable if Cloudflare asks).
- Once deployed, every push to `main` — including the automated content commits — triggers
  a fresh redeploy automatically. No extra step needed in the GitHub Action.
- Once you have a custom domain, add it in the Cloudflare dashboard, and set the
  `SITE_URL` repo Variable in GitHub to match (used for canonical URLs / sitemap / RSS).

## 6. Where you add the AI API key

`GEMINI_API_KEY` (or `ANTHROPIC_API_KEY` if you switch providers) — GitHub repo →
**Settings → Secrets and variables → Actions → New repository secret**. Never commit
it to the repo or put it in `astro.config.mjs` or any source file;
`src/ai/provider.mjs` only ever reads it from `process.env`.

## 7. How this works (no fixed schedule — you start it)

**Start it:** Actions tab → "Publish & keep the Act up to date" → Run workflow.

### First run: load the whole Act
1. **Official text only.** `scripts/seed-queue.mjs` downloads the official Income-tax Act,
   2025 PDF from incometaxindia.gov.in, splits it into every section deterministically
   (no AI), and saves each section's exact wording under `content/source/`. This official
   text is what every section page shows first, and it is never written or altered by AI.
   If the government site blocks the download (some hosts do), upload the PDF yourself to
   `content/act/act-2025.pdf` in the repo and re-run — the script falls back to that copy.
2. **A study guide for every section**, written by Gemini Pro and checked three ways before
   anything is shown (see below): commentary, a worked example, multiple-choice questions,
   and mnemonics where a list of items genuinely supports one.
3. A page for **every section** goes live once its official text is loaded — with the
   study guide added once it passes its checks. Nothing waits for the whole Act.
4. One run has a time budget (~5 hours, GitHub's own limit); if the Act isn't finished, the
   workflow **automatically starts another run** by itself and continues where it left off.

### After that: the daily amendment check
Once everything is loaded, re-running the workflow (manually, or on the schedule you can
switch on in `.github/workflows/daily-publish.yml`) does this instead:
1. Downloads the official PDF again and compares its fingerprint with the last check.
2. If it changed, it re-parses the Act and compares **every section**, word by word
   (`scripts/lib/diffsec.mjs` — an exact diff, not AI), against the stored text.
3. Every changed section gets an **amendment record**: the exact words removed/added, with
   surrounding context, shown on that section's page and on the dedicated **Amendments**
   page (`/amendments`), newest first.
4. Gemini writes commentary explaining the change, fact-checked against the exact wording
   change before it's shown (see below). If it can't pass the check, the diff still shows —
   commentary is simply withheld rather than shown to be wrong.
5. The section's existing study guide is marked "stale" (a banner says so, and it's
   regenerated in the next study-guide pass) instead of silently going out of date.
6. **Safety stop:** if the new document parses into *fewer* sections than are already
   stored, the run aborts without changing anything — that pattern means a parsing problem,
   not a real repeal, and someone should look at it before it's trusted.

### How the checking actually works
Everything AI writes is checked before it is shown — not just proofread once:
- **Study guides** (`scripts/lib/study.mjs`): written from the official text only. Checked
  by (a) deterministic structure rules, (b) every figure/number checked against the
  official text in code, (c) a **blind solver** — a second AI call given only the official
  text and the MCQs, with no knowledge of the "correct" answer — must independently agree
  with every marked answer, (d) mnemonics checked in code: each letter must be the true
  first letter of its meaning, in the order the items appear in the text, and the meaning
  itself must actually appear in the text, (e) a fact-checker reviews the whole guide. One
  repair attempt is allowed; if it still fails, nothing is published for that section (the
  official text stays up either way).
- **Amendment commentary** (`scripts/lib/commentary.mjs`): given only the exact wording
  change, with the same "no unsupported claims" rules and one repair attempt. If it still
  fails, the highlighted diff is still shown — only the commentary is withheld.
- **Article explanations**, if you also run `scripts/generate.mjs`/`scripts/run-batch.mjs`
  (kept from the section-by-section explanation flow — optional, separate from the study
  guide): same pattern, plus `scripts/validate.mjs` checks every cited link is a real,
  reachable URL before anything publishes.

No automated system can guarantee legal accuracy. This design is meant to make errors rare
and visible (a withheld commentary, a "Coming soon" section, a stale banner) rather than
silent. Have a qualified professional spot-check a sample of pages before relying on the
site for real work, and use the Contact page for corrections.

## 8. Manual publication

To research and publish one article right now, without waiting for the cron:

- From the GitHub UI: **Actions → Daily Publish → Run workflow**.
- Locally: `npm run publish:batch` (with `.env` filled in), then commit + push.

For a complete Act re-seed, use `npm run seed:force`. The GitHub Action automatically re-seeds when fewer than 500 Act source files are present.\n\n## 9. Adding sections to the queue

```bash
node scripts/queue-add.mjs "5" "Scope of Total Income" "Chapter I - Preliminary" "Tax Administration"
```
This appends a new `pending` item to `content/sections.json`. It never reorders or
removes existing items, and refuses to add a duplicate id/slug.

## 10. Changing AI provider

Set `AI_PROVIDER=gemini` (repo Variable, or in `.env` locally) and add `GEMINI_API_KEY`.
Nothing else in the codebase changes — `src/ai/provider.mjs` is the only file that
knows about provider-specific request formats. `AI_PROVIDER=manual` pauses automation
entirely so you can write/paste an article into `content/articles/<slug>.md` yourself
and flip its status by hand.

## 11. Troubleshooting

- **Nothing published today, no error:** the queue had no `pending` items — add more
  with `queue-add.mjs`.
- **Item stuck at `failed`:** read `failure_reason` in `content/sections.json` for that
  item. Fix the underlying issue (often: the source couldn't be verified, or the draft
  was missing a required section) and either re-run the pipeline or edit the article by
  hand, then set its status back to `draft` and run `node scripts/publish.mjs`.
- **Cloudflare didn't redeploy:** confirm the workflow actually pushed a commit (check
  the Action's log) — if `content/` had no changes, nothing is pushed and nothing
  redeploys, which is expected.
- **"Publication skipped because authoritative verification failed":** this is the
  system doing its job — it will not publish content it couldn't verify. It will try
  the same queue item again on the next run.

## 12. What's actually seeded right now

One verified article is included: **Section 4 — Charge of Income-tax**
(`content/articles/charge-of-income-tax.md`), built from the official consolidated
Income-tax Act 2025 text and CBDT's transition FAQ, with sections that couldn't be
verified (Rules, CBDT circulars, case law specific to this section) honestly marked
"not yet verified" rather than invented. Three more sections are queued as `pending`
(Section 3 — Tax Year, Section 2 — Definitions, Section 6 — Residence) for the
automation to pick up once you add your API key.

No tax slabs, rates, or calculators are wired up yet — see
`src/lib/calculators/README.md` for why, and how to add one properly.
