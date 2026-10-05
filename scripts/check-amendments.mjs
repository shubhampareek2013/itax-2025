// Daily check: has the official Income-tax Act, 2025 changed?
//   1. Download the official PDF and compare its fingerprint with the last check.
//   2. If it changed: split it into sections, compare each with the stored official text,
//      and for every section that differs write an amendment record (exact word-level diff),
//      update the stored official text, and ask Gemini for commentary (fact-checked).
//   3. Anything suspicious (fewer sections than before, parse failure) aborts WITHOUT touching data.
// Idempotent: running twice the same day never creates duplicate records.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fetchActText, PDF_URL } from "./lib/actsource.mjs";
import { parseAct, categoryFor } from "./lib/actparse.mjs";
import { compareText, normalize } from "./lib/diffsec.mjs";
import { commentOn } from "./lib/commentary.mjs";

const ROOT = process.cwd();
const STATUS = path.join(ROOT, "content", "status.json");
const QUEUE = path.join(ROOT, "content", "sections.json");
const SOURCE = path.join(ROOT, "content", "source");
const AMEND = path.join(ROOT, "content", "amendments");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf-8"));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2) + "\n", "utf-8");
const MAX_COMMENTARY = Number(process.env.MAX_COMMENTARY_PER_RUN || 40);

async function main() {
  // first ever run: build the baseline (all sections) instead of comparing
  if (!fs.existsSync(STATUS) || !fs.existsSync(SOURCE)) {
    console.log("No baseline yet — building it from the official Act (no amendments are reported for this first snapshot).");
    execFileSync("node", ["scripts/seed-queue.mjs"], { stdio: "inherit" });
    return;
  }
  const status = readJson(STATUS);
  fs.mkdirSync(AMEND, { recursive: true });

  let fetched;
  try {
    fetched = await fetchActText();
  } catch (e) {
    console.warn(`Official Act refresh unavailable today: ${e.message}. Keeping the existing validated source library unchanged.`);
    status.last_checked = today();
    status.last_result = "official refresh unavailable; existing sources retained";
    writeJson(STATUS, status);
    return;
  }
  const { text, sha256, origin } = fetched;
  console.log(`Fetched the Act from: ${origin}`);
  let changedSections = 0;

  if (sha256 === status.pdf_sha256) {
    console.log("The official document is identical to the last check. No change.");
    status.last_result = "no change";
  } else {
    console.log("The official document has changed. Comparing section by section…");
    const queue = readJson(QUEUE);
    const oldCount = queue.items.filter((i) => fs.existsSync(path.join(SOURCE, `${i.id}.txt`))).length;
    const { sections, missing } = parseAct(text, { lastSection: 2000 });
    if (sections.length < oldCount) {
      throw new Error(`SAFETY STOP: the new document parses into ${sections.length} sections but ${oldCount} are stored. Nothing was changed. Please review the official PDF manually.`);
    }
    if (missing.length) console.warn(`Note: numbering gap(s) at ${missing.join(", ")}`);

    const date = today();
    const byId = new Map(queue.items.map((i) => [i.id, i]));
    for (const s of sections) {
      const id = `itax2025-s${String(s.n).padStart(3, "0")}`;
      const file = path.join(SOURCE, `${id}.txt`);
      const item = byId.get(id);
      const isNew = !fs.existsSync(file);
      const oldText = isNew ? "" : fs.readFileSync(file, "utf-8");
      if (!isNew && normalize(oldText) === normalize(s.text)) continue;

      const { hunks, added, removed } = compareText(oldText, s.text);
      if (!isNew && hunks.length === 0) continue;
      let n = 0, amId;
      do { amId = `${date}-s${String(s.n).padStart(3, "0")}${n ? "-" + n : ""}`; n++; } while (fs.existsSync(path.join(AMEND, `${amId}.json`)));

      writeJson(path.join(AMEND, `${amId}.json`), {
        id: amId, date_detected: date, section: String(s.n), section_id: id, title: s.title,
        chapter: `Chapter ${s.chapterRoman} — ${s.chapterName}`,
        kind: isNew ? "new section" : "amended", added_words: added, removed_words: removed,
        hunks: isNew ? [{ before_gap: false, after_gap: false, segments: [{ k: "add", t: normalize(s.text) }] }] : hunks,
        source_url: PDF_URL, document_sha256: sha256,
        commentary_status: "pending"
      });
      fs.writeFileSync(file, s.text + "\n", "utf-8");

      if (isNew) {
        queue.items.push({ id, act: "Income-tax Act, 2025", section: String(s.n), title: s.title,
          chapter: `Chapter ${s.chapterRoman} — ${s.chapterName}`, category: categoryFor(s.chapterName, s.part),
          status: "pending", slug: s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) + `-s${s.n}`,
          published_date: null, last_verified: date, sources: [] });
      } else if (item) {
        item.last_amended = date;
        if (item.status === "published") item.stale = true; // the AI explanation predates this change
      }
      const sf = path.join(ROOT, "content", "study", `${id}.json`);
      if (fs.existsSync(sf)) { const st = readJson(sf); st.stale = true; writeJson(sf, st); }
      changedSections++;
      console.log(`  amended: Section ${s.n} — ${s.title} (+${added} / -${removed} words)`);
    }
    writeJson(QUEUE, queue);
    status.pdf_sha256 = sha256;
    status.last_changed = date;
    status.last_result = changedSections ? `${changedSections} section(s) amended` : "document changed, no section wording changed";
  }

  // commentary for any amendment that does not have it yet (also retries earlier failures)
  let done = 0;
  for (const f of fs.readdirSync(AMEND).filter((x) => x.endsWith(".json")).sort()) {
    if (done >= MAX_COMMENTARY) break;
    const a = readJson(path.join(AMEND, f));
    if (a.commentary_status !== "pending") continue;
    try {
      const r = await commentOn(a);
      a.commentary_status = r.status;
      if (r.status === "ok") { a.commentary = r.text; a.commentary_model = process.env.GEMINI_COMMENTARY_MODEL || "gemini-2.5-pro"; }
      else a.commentary_note = r.note;
      console.log(`  commentary ${r.status}: ${a.id}`);
    } catch (e) {
      console.warn(`  commentary postponed for ${a.id}: ${e.message.slice(0, 160)}`);
      continue; // stays pending; retried next run
    }
    writeJson(path.join(AMEND, f), a);
    done++;
  }

  status.last_checked = today();
  writeJson(STATUS, status);
  const summary = `Daily check ${status.last_checked}: ${status.last_result}. Commentary added: ${done}.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Amendment check\n${summary}\n`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
