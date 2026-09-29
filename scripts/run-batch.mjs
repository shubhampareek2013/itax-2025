// Publishes provisions in order until the queue is empty, the time budget is used, or the
// AI provider's daily quota runs out. Safe to run again: it picks up where it stopped.
//
// Env: BATCH_LIMIT (max articles, default all)  TIME_BUDGET_MIN (default 320)
//      SLEEP_MS (pause between articles, default 6000)  COMMIT_EVERY (default 10)
//      RETRY_FAILED=1 (put failed items back in the queue first)

import fs from "node:fs";
import { execSync } from "node:child_process";
import { loadQueue, getNextPendingItem } from "../src/lib/content.mjs";
import { generateOne, SECTIONS_JSON } from "./generate.mjs";
import { publishNext } from "./publish.mjs";

const LIMIT = Number(process.env.BATCH_LIMIT || 1e9);
const BUDGET = Number(process.env.TIME_BUDGET_MIN || 320) * 60000;
const SLEEP = Number(process.env.SLEEP_MS || 6000);
const COMMIT_EVERY = Number(process.env.COMMIT_EVERY || 10);
const ci = process.env.GITHUB_ACTIONS === "true";
const started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function commit(msg) {
  if (!ci || COMMIT_EVERY <= 0) return;
  try {
    execSync("git config user.name itax-automation && git config user.email actions@users.noreply.github.com", { stdio: "ignore" });
    execSync("git add content/", { stdio: "ignore" });
    if (execSync("git status --porcelain content/").toString().trim() === "") return;
    execSync(`git commit -m "${msg}"`, { stdio: "ignore" });
    try { execSync("git pull --rebase --autostash", { stdio: "ignore" }); } catch {}
    execSync("git push", { stdio: "pipe" });
  } catch (e) { console.warn("  (commit/push skipped:", String(e.message).split("\n")[0], ")"); }
}

if (process.env.RETRY_FAILED === "1") {
  const q = loadQueue();
  let n = 0;
  for (const i of q.items) if (i.status === "failed") { i.status = "pending"; delete i.failure_reason; n++; }
  fs.writeFileSync(SECTIONS_JSON, JSON.stringify(q, null, 2) + "\n", "utf-8");
  console.log(`Re-queued ${n} failed item(s).`);
}

let done = 0, failed = 0, stop = "queue empty";
while (true) {
  const item = getNextPendingItem();
  if (!item) { stop = "queue empty"; break; }
  if (done + failed >= LIMIT) { stop = "batch limit"; break; }
  if (Date.now() - started > BUDGET) { stop = "time budget"; break; }

  console.log(`\n[${done + failed + 1}] Section ${item.section} — ${item.title}`);
  let r;
  try { r = await generateOne(item); }
  catch (err) { stop = "daily quota"; console.log(`  ${err.message}`); break; }

  if (r.ok) {
    const p = await publishNext();
    if (p.published) { done++; console.log("  ✓ published"); }
    else { failed++; console.log(`  ✗ blocked by validation: ${(p.errors || []).join(" | ").slice(0, 300)}`); }
  } else { failed++; console.log(`  ✗ not published: ${r.reason}`); }

  if ((done + failed) % COMMIT_EVERY === 0) commit(`content: publish batch (${done} done)`);
  await sleep(SLEEP);
}
commit(`content: publish batch (${done} done)`);

const q = loadQueue();
const count = (s) => q.items.filter((i) => i.status === s).length;
const summary = `Published this run: ${done} · Failed/blocked: ${failed} · Stopped because: ${stop}\nTotals — published ${count("published")}, pending ${count("pending")}, failed ${count("failed")} of ${q.items.length}.`;
console.log("\n" + summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Publish run\n${summary.replace(/\n/g, "  \n")}\n`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `remaining=${count("pending")}\nstop=${stop.replace(/ /g, "_")}\n`);
