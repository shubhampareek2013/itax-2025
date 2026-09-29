// Builds the full publishing queue (all sections of the Income-tax Act, 2025) from the
// OFFICIAL PDF, and stores each section's official text under content/source/.
// Deterministic — no AI. Safe to re-run: existing statuses, slugs and dates are kept.
//
// Usage: node scripts/seed-queue.mjs            (downloads the official PDF, needs pdftotext)
//        node scripts/seed-queue.mjs act.txt    (use an already-extracted text file)

import fs from "node:fs";
import path from "node:path";
import { parseAct, categoryFor } from "./lib/actparse.mjs";
import { fetchActText } from "./lib/actsource.mjs";

const ROOT = process.cwd();
const SECTIONS_JSON = path.join(ROOT, "content", "sections.json");
const SOURCE_DIR = path.join(ROOT, "content", "source");
const EXPECTED = Number(process.env.ACT_EXPECTED_SECTIONS || 536);

const slugify = (s) => s.toLowerCase().replace(/[“”"’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

if (process.argv[2]) process.env.ACT_TEXT_FILE = process.argv[2];
const { text, sha256, origin } = await fetchActText();
console.log(`Source: ${origin}`);
const { sections, missing, lastFound } = parseAct(text, { lastSection: EXPECTED });
console.log(`Parsed ${sections.length} sections (last found: ${lastFound}).`);
if (missing.length) console.warn(`WARNING: could not locate section(s): ${missing.join(", ")}`);
if (sections.length < Math.min(EXPECTED, 500)) {
  console.error(`Only ${sections.length} sections were found (expected about ${EXPECTED}). Not touching the queue.`);
  process.exit(1);
}

const queue = fs.existsSync(SECTIONS_JSON) ? JSON.parse(fs.readFileSync(SECTIONS_JSON, "utf-8")) : { schema_version: 1, items: [] };
const byId = new Map(queue.items.map((i) => [i.id, i]));
const usedSlugs = new Set(queue.items.map((i) => i.slug));
fs.mkdirSync(SOURCE_DIR, { recursive: true });

const items = [];
for (const s of sections) {
  const id = `itax2025-s${String(s.n).padStart(3, "0")}`;
  const old = byId.get(id);
  let slug = old?.slug;
  if (!slug) {
    slug = slugify(s.title) || `section-${s.n}`;
    if (usedSlugs.has(slug)) slug = `${slug}-s${s.n}`;
    usedSlugs.add(slug);
  }
  items.push({
    id, act: "Income-tax Act, 2025", section: String(s.n), title: s.title,
    chapter: `Chapter ${s.chapterRoman} — ${s.chapterName}`,
    part: s.part || undefined,
    category: categoryFor(s.chapterName, s.part),
    status: old?.status || "pending",
    slug,
    published_date: old?.published_date ?? null,
    last_verified: old?.last_verified ?? null,
    sources: old?.sources ?? [],
    ...(old?.failure_reason ? { failure_reason: old.failure_reason } : {})
  });
  const f = path.join(SOURCE_DIR, `${id}.txt`);
  if (!fs.existsSync(f) || process.env.FORCE_SOURCE === "1") fs.writeFileSync(f, s.text + "\n", "utf-8");
}
// keep any hand-added items that are not part of the Act sections
for (const i of queue.items) if (!items.some((x) => x.id === i.id)) items.push(i);

queue.items = items;
queue._comment = "Deterministic publishing queue built from the official Act. The pipeline always takes the FIRST item with status 'pending', in this order.";
fs.writeFileSync(SECTIONS_JSON, JSON.stringify(queue, null, 2) + "\n", "utf-8");
const chapters = new Set(items.map((i) => i.chapter)).size;
console.log(`Queue ready: ${items.length} sections across ${chapters} chapters. Official text saved to content/source/.`);

// Baseline for the daily amendment check.
const STATUS = path.join(ROOT, "content", "status.json");
const prev = fs.existsSync(STATUS) ? JSON.parse(fs.readFileSync(STATUS, "utf-8")) : {};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
if (!prev.pdf_sha256 || process.env.FORCE_SOURCE === "1") {
  fs.writeFileSync(STATUS, JSON.stringify({ baseline_date: today, pdf_sha256: sha256, sections: items.length, last_checked: today, last_changed: null, last_result: "baseline created" }, null, 2) + "\n");
  console.log("Baseline recorded for the daily amendment check.");
}
