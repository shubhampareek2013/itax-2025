// Research + write + fact-check the article for one queue item.
//   1. The OFFICIAL section text (extracted from the Income Tax Department PDF) is the
//      only authority the AI is allowed to rely on for what the law says.
//   2. Metadata (frontmatter) is built by code, never by the AI.
//   3. A second AI pass, with no web search, checks every claim against the official
//      text. Anything unsupported is repaired once, then the item FAILS instead of publishing.
//   4. validate.mjs then runs deterministic checks before anything goes live.

import fs from "node:fs";
import path from "node:path";
import { complete } from "../src/ai/provider.mjs";

const ROOT = process.cwd();
export const SECTIONS_JSON = path.join(ROOT, "content", "sections.json");
const ARTICLES_DIR = path.join(ROOT, "content", "articles");
const SOURCE_DIR = path.join(ROOT, "content", "source");
export const OFFICIAL_PDF = "https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf";
const MAX_SOURCE_CHARS = 70000;

const SYSTEM = `You write careful, accurate explanations of sections of India's Income-tax Act, 2025 for taxpayers, accountants and CA students.

The OFFICIAL TEXT supplied in the prompt is the only authority for what the section says. Accuracy matters more than completeness.

HARD RULES
1. Every statement about what the section provides must be traceable to the official text. If it is not in the text, do not say it.
2. Never state a rate, limit, threshold, period or date unless it appears in the official text (or on a page you opened through search and cite with its URL). Amounts in "Practical Example" are illustrative assumptions: say so and never present them as legal limits.
3. Mention other sections only if they are cross-referenced in the official text. Do not explain what another section says unless the official text itself tells you.
4. Rules 2026, CBDT circulars/notifications, case law and the 1961 comparison: use search. Include an item ONLY if you opened a page for it and can give a direct URL on an official or court source; copy its number, date and court exactly as shown there. If you find none, write exactly: "No verified <item type> identified." Never guess a number, date, case name or citation.
5. "Practical Notes" is cautious commentary. Keep what the text says separate from interpretation, and label interpretation as interpretation. Flag real ambiguity. Do not predict court outcomes and do not give advice.
6. Where the official text shows an amendment footnote (for example by the Finance Act, 2026), mention it accurately.
7. Never write placeholders like [INSERT] or [TODO].

OUTPUT FORMAT (exactly this, nothing before or after):
DESCRIPTION: <one plain sentence, max 155 characters>
TAGS: <3 to 6 lowercase tags, comma separated>
---BODY---
## Official Provision
## In Simple Language
## Key Points
## Who Does This Apply To?
## Conditions
## Exceptions
## Practical Example
## Related Provisions
## Rules
## CBDT Material
## Case Law
## 1961 vs 2025
## Practical Notes
## Sources

Notes on the sections:
- "Official Provision": a bullet list (Act, Section, Chapter, Effective date) and two or three sentences on what the section does. Do not paste the full text; the website shows the official text separately.
- "Practical Notes" must begin with the line: *AI-assisted commentary — not statutory text or legal advice.*
- "1961 vs 2025": only verified points. Never infer a substantive change from renumbering. If unverified write: "No verified 1961 comparison identified."
- "Sources": markdown links [label](URL) for every source you relied on. Say which are primary (official) and which are secondary.`;

function readSource(item) {
  const file = path.join(SOURCE_DIR, `${item.id}.txt`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf-8");
}

function buildPrompt(item, src) {
  let text = src, note = "";
  if (text.length > MAX_SOURCE_CHARS) {
    text = text.slice(0, MAX_SOURCE_CHARS);
    note = "\n[NOTE: the official text was truncated for length. Do not make claims about anything beyond the text shown; say the section is long and refer readers to the official PDF for the remainder.]";
  }
  return `Write the article for:
Act: ${item.act}
Section: ${item.section} — ${item.title}
Chapter: ${item.chapter}${item.part ? `\nPart: ${item.part}` : ""}
The Act came into force on 1 April 2026 (as amended by the Finance Act, 2026).

OFFICIAL TEXT (extracted from the Income Tax Department's consolidated PDF; tables may be flattened):
"""
${text}
"""${note}`;
}

function parseModelOutput(raw) {
  const t = raw.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
  const desc = t.match(/^DESCRIPTION:\s*(.+)$/m)?.[1]?.trim();
  const tags = t.match(/^TAGS:\s*(.+)$/m)?.[1]?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) || [];
  const idx = t.indexOf("---BODY---");
  if (!desc || idx < 0) throw new Error("Model output did not follow the required format.");
  return { description: desc.slice(0, 200), tags: tags.slice(0, 6), body: t.slice(idx + "---BODY---".length).trim() };
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const yq = (s) => JSON.stringify(String(s));

export function assembleArticle(item, parsed, src) {
  const links = [...parsed.body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ label: m[1], url: m[2] }));
  const seen = new Set(); const sources = [];
  sources.push({ label: "Income-tax Act, 2025 [30 of 2025], as amended by the Finance Act, 2026 — official text (Income Tax Department)", url: OFFICIAL_PDF });
  seen.add(OFFICIAL_PDF);
  for (const l of links) if (!seen.has(l.url)) { seen.add(l.url); sources.push(l); }
  const refs = [...new Set([...src.matchAll(/\bsections?\s+(\d{1,3})\b/gi)].map((m) => Number(m[1])))]
    .filter((n) => n !== Number(item.section) && n >= 1 && n <= 536).sort((a, b) => a - b).slice(0, 40)
    .map((n) => `itax2025-s${String(n).padStart(3, "0")}`);
  const fm = [
    "---",
    `id: ${yq(item.id)}`,
    `title: ${yq(`Section ${item.section} — ${item.title} | Income-tax Act, 2025`)}`,
    `description: ${yq(parsed.description)}`,
    `act: ${yq(item.act)}`,
    `section: ${yq(item.section)}`,
    `chapter: ${yq(item.chapter)}`,
    `slug: ${yq(item.slug)}`,
    `contentType: "section-explainer"`,
    `datePublished: ${yq(today())}`,
    `dateModified: ${yq(today())}`,
    `lastVerified: ${yq(today())}`,
    `tags: ${JSON.stringify(parsed.tags)}`,
    `relatedSections: ${JSON.stringify(refs)}`,
    "sources:",
    ...sources.flatMap((s) => [`  - label: ${yq(s.label)}`, `    url: ${yq(s.url)}`]),
    "---", ""
  ].join("\n");
  return fm + "\n" + parsed.body.trim() + "\n";
}

const VERIFY_SYSTEM = `You are a strict legal fact-checker. You receive the OFFICIAL TEXT of one section of India's Income-tax Act, 2025 and a DRAFT explanation. Decide whether every factual or legal claim in the draft is supported by the official text (or by a cited source URL, for Rules/CBDT/case law/1961 items).

Flag as an issue: any claim about what the section says that the text does not support; any wrong number, rate, limit, period or date; any invented cross-reference; any interpretation presented as if it were law; any statement of law in "Practical Notes" not labelled as interpretation; any amount in "Practical Example" not labelled illustrative.
Do NOT flag style. Do NOT flag items in Rules/CBDT/Case Law/1961 sections that carry a source URL, or that say "No verified ... identified."

Respond with JSON only, no prose: {"verdict":"pass"|"fail","issues":["..."]}. Use "pass" only if issues is empty.`;

async function verify(item, src, article) {
  const { text } = await complete({
    system: VERIFY_SYSTEM, search: false, temperature: 0, maxTokens: 2000,
    prompt: `OFFICIAL TEXT (Section ${item.section}):\n"""\n${src.slice(0, MAX_SOURCE_CHARS)}\n"""\n\nDRAFT:\n"""\n${article}\n"""`
  });
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: "fail", issues: ["Fact-checker returned no JSON."] };
  try {
    const j = JSON.parse(m[0]);
    const issues = Array.isArray(j.issues) ? j.issues.map(String) : [];
    return { verdict: j.verdict === "pass" && issues.length === 0 ? "pass" : "fail", issues };
  } catch { return { verdict: "fail", issues: ["Fact-checker JSON was unreadable."] }; }
}

function setStatus(id, status, note) {
  const queue = JSON.parse(fs.readFileSync(SECTIONS_JSON, "utf-8"));
  const it = queue.items.find((i) => i.id === id);
  if (!it) return;
  it.status = status;
  if (note) it.failure_reason = String(note).slice(0, 600); else delete it.failure_reason;
  fs.writeFileSync(SECTIONS_JSON, JSON.stringify(queue, null, 2) + "\n", "utf-8");
}

// Returns { ok, reason }. Throws DailyQuotaError up to the caller so a batch can stop cleanly.
export async function generateOne(item, log = console.log) {
  const src = readSource(item);
  if (!src) { setStatus(item.id, "failed", "Official text file missing — run the seed step first."); return { ok: false, reason: "no source text" }; }
  setStatus(item.id, "researching");
  try {
    log(`  drafting Section ${item.section} — ${item.title}`);
    let { text } = await complete({ system: SYSTEM, prompt: buildPrompt(item, src), maxTokens: 8000, search: true, temperature: 0.2 });
    let parsed = parseModelOutput(text);
    let article = assembleArticle(item, parsed, src);

    log("  fact-checking against the official text");
    let v = await verify(item, src, article);
    if (v.verdict !== "pass") {
      log(`  fact-check raised ${v.issues.length} issue(s); repairing once`);
      const fix = await complete({
        system: SYSTEM, search: false, temperature: 0.1, maxTokens: 8000,
        prompt: `${buildPrompt(item, src)}\n\nA fact-checker found these problems in your previous draft. Rewrite the article, REMOVING or correcting every unsupported claim. Do not add new claims.\nPROBLEMS:\n- ${v.issues.join("\n- ")}\n\nPREVIOUS DRAFT:\n"""\n${parsed.body}\n"""`
      });
      parsed = parseModelOutput(fix.text);
      article = assembleArticle(item, parsed, src);
      v = await verify(item, src, article);
      if (v.verdict !== "pass") {
        setStatus(item.id, "failed", `Fact-check failed after repair: ${v.issues.join(" | ")}`);
        return { ok: false, reason: "fact-check failed" };
      }
    }
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTICLES_DIR, `${item.slug}.md`), article, "utf-8");
    setStatus(item.id, "draft");
    return { ok: true };
  } catch (err) {
    if (err.name === "DailyQuotaError") { setStatus(item.id, "pending"); throw err; }
    setStatus(item.id, "failed", err.message);
    return { ok: false, reason: err.message };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { getNextPendingItem } = await import("../src/lib/content.mjs");
  const item = getNextPendingItem();
  if (!item) console.log("No pending items.");
  else { const r = await generateOne(item); console.log(r); if (!r.ok) process.exitCode = 1; }
}
