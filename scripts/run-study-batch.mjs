// Writes the study guide (commentary, example, MCQs, mnemonics) for every section, in order.
// Several sections are processed at the same time. Safe to re-run: it continues where it stopped,
// and regenerates guides whose section was amended ("stale").
//
// Env: CONCURRENCY (default 4)  BATCH_LIMIT  TIME_BUDGET_MIN (default 320)  SLEEP_MS (default 500)
//      COMMIT_EVERY (default 10)  ONLY_STALE=1  RETRY_FAILED=1

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadQueue, hasSource, loadSource } from "../src/lib/content.mjs";
import { makeStudyGuide } from "./lib/study.mjs";

const DIR = path.join(process.cwd(), "content", "study");
const CONC = Number(process.env.CONCURRENCY || 4);
const LIMIT = Number(process.env.BATCH_LIMIT || 1e9);
const BUDGET = Number(process.env.TIME_BUDGET_MIN || 320) * 60000;
const SLEEP = Number(process.env.SLEEP_MS || 500);
const COMMIT_EVERY = Number(process.env.COMMIT_EVERY || 10);
const ONLY_STALE = process.env.ONLY_STALE === "1";
const RETRY = process.env.RETRY_FAILED === "1";
const ci = process.env.GITHUB_ACTIONS === "true";
const started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
fs.mkdirSync(DIR, { recursive: true });

const fileOf = (id) => path.join(DIR, `${id}.json`);
const read = (id) => (fs.existsSync(fileOf(id)) ? JSON.parse(fs.readFileSync(fileOf(id), "utf-8")) : null);
function write(id, obj) { const f = fileOf(id), tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n"); fs.renameSync(tmp, f); }

function todo() {
  return loadQueue().items.filter((i) => {
    if (!hasSource(i.id)) return false;
    const s = read(i.id);
    if (ONLY_STALE) return !!s?.stale;
    return !s || s.stale || (RETRY && s.status === "failed");
  });
}

let commitBusy = false;
function commit(msg) {
  if (!ci || COMMIT_EVERY <= 0 || commitBusy) return;
  commitBusy = true;
  try {
    execSync("git config user.name itax-automation && git config user.email actions@users.noreply.github.com", { stdio: "ignore" });
    execSync("git add content/", { stdio: "ignore" });
    if (execSync("git status --porcelain content/").toString().trim() === "") return;
    execSync(`git commit -m "${msg}"`, { stdio: "ignore" });
    try { execSync("git pull --rebase --autostash", { stdio: "ignore" }); } catch {}
    execSync("git push", { stdio: "pipe" });
  } catch (e) { console.warn("  (commit/push skipped:", String(e.message).split("\n")[0], ")"); }
  finally { commitBusy = false; }
}

const queue = todo();
let cursor = 0, ok = 0, failed = 0, stop = "queue empty", quota = false;
console.log(`${queue.length} section(s) to process, ${CONC} at a time.`);

async function worker() {
  while (!quota) {
    if (ok + failed >= LIMIT) { stop = "batch limit"; return; }
    if (Date.now() - started > BUDGET) { stop = "time budget"; return; }
    const item = queue[cursor++];
    if (!item) return;
    try {
      const r = await makeStudyGuide(item, loadSource(item.id));
      if (r.ok) { write(item.id, { id: item.id, section: item.section, title: item.title, status: "ok", stale: false, generated: today(), ...r.data }); ok++; console.log(`✓ Section ${item.section} — ${item.title}`); }
      else { write(item.id, { id: item.id, section: item.section, title: item.title, status: "failed", stale: false, generated: today(), reason: r.reason }); failed++; console.log(`✗ Section ${item.section}: ${r.reason.slice(0, 200)}`); }
    } catch (e) {
      if (e.name === "DailyQuotaError") { quota = true; stop = "daily quota"; console.log(`Stopping: ${e.message.slice(0, 160)}`); return; }
      failed++; console.log(`✗ Section ${item.section}: ${e.message.slice(0, 200)}`);
    }
    if ((ok + failed) % COMMIT_EVERY === 0) commit(`content: study guides (${ok} done)`);
    await sleep(SLEEP);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
commit(`content: study guides (${ok} done)`);

const remaining = todo().filter((i) => !(read(i.id)?.status === "failed" && !RETRY)).length;
const summary = `Study guides written: ${ok} · failed checks: ${failed} · stopped because: ${stop} · still to do: ${remaining}`;
console.log("\n" + summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Study guides\n${summary}\n`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `remaining=${remaining}\nstop=${stop.replace(/ /g, "_")}\n`);
