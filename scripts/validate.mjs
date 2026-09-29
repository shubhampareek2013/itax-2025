// Deterministic quality gate. Nothing is published unless every check passes.
// (The AI fact-check in generate.mjs is a first line of defence; this is the second.)

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadQueue } from "../src/lib/content.mjs";
import { numbersIn, figuresIn } from "./lib/numbers.mjs";

const ROOT = process.cwd();
const ARTICLES_DIR = path.join(ROOT, "content", "articles");
const SOURCE_DIR = path.join(ROOT, "content", "source");

const REQUIRED_HEADINGS = [
  "Official Provision", "In Simple Language", "Key Points", "Who Does This Apply To?",
  "Conditions", "Exceptions", "Practical Example", "Related Provisions", "Rules",
  "CBDT Material", "Case Law", "1961 vs 2025", "Practical Notes", "Sources"
];
const PLACEHOLDERS = [/\[INSERT/i, /\[ADD SOURCE/i, /\[WRITE/i, /\[TODO/i, /\[TBD\]/i, /lorem ipsum/i];
const REQUIRED_FRONTMATTER = ["title", "description", "act", "section", "slug", "sources"];
// Sections whose figures must appear in the official text (the Example may use illustrative numbers).
const FIGURE_CHECKED = ["Official Provision", "Key Points", "Who Does This Apply To?", "Conditions", "Exceptions", "Practical Notes"];
const OFFICIAL_HOSTS = /(^|\.)(incometaxindia\.gov\.in|indiacode\.nic\.in|egazette\.gov\.in|finmin\.gov\.in|indiabudget\.gov\.in|sci\.gov\.in|main\.sci\.gov\.in|digiscr\.sci\.gov\.in|delhihighcourt\.nic\.in|bombayhighcourt\.nic\.in|hcmadras\.tn\.nic\.in|karnatakajudiciary\.kar\.nic\.in|indiankanoon\.org|sansad\.in|pib\.gov\.in|incometaxindia\.gov)$/i;

function splitSections(content) {
  const out = {};
  for (const part of content.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    out[part.slice(0, nl).trim()] = part.slice(nl + 1);
  }
  return out;
}

async function checkUrl(url) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; itax-validator)" } });
    clearTimeout(t);
    if (res.status === 404 || res.status === 410) return `Cited link is dead (HTTP ${res.status}): ${url}`;
    return null;
  } catch (e) {
    return `Cited link could not be reached (${e.cause?.code || e.name}): ${url}`;
  }
}

export async function validateArticle(slug, { checkLinks = process.env.SKIP_LINK_CHECK !== "1" } = {}) {
  const errors = [];
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return { ok: false, errors: [`Article file missing: ${file}`] };

  const { data, content } = matter(fs.readFileSync(file, "utf-8"));
  const queue = loadQueue();
  const item = queue.items.find((i) => i.slug === slug);
  if (!item) errors.push(`No queue item has slug "${slug}"`);

  for (const f of REQUIRED_FRONTMATTER)
    if (!data[f] || (Array.isArray(data[f]) && data[f].length === 0)) errors.push(`Missing frontmatter: ${f}`);
  if (item && String(data.section) !== String(item.section)) errors.push("Frontmatter section does not match the queue item");

  const secs = splitSections(content);
  for (const h of REQUIRED_HEADINGS) {
    if (!(h in secs)) errors.push(`Missing section: ## ${h}`);
    else if (secs[h].trim().length < 15) errors.push(`Section is empty: ## ${h}`);
  }
  for (const p of PLACEHOLDERS) if (p.test(content)) errors.push(`Contains placeholder text matching ${p}`);
  if (!content.includes("AI-assisted commentary")) errors.push('Practical Notes is missing the "AI-assisted commentary — not statutory text or legal advice." notice');
  if (/\bClaude\b/.test(content)) errors.push("Article mentions a model name");

  if (queue.items.filter((i) => i.slug === slug).length > 1) errors.push(`Slug "${slug}" is used more than once`);
  if (queue.items.some((i) => i.slug === slug && i.status === "published")) errors.push(`Slug "${slug}" is already published`);

  // --- grounding: figures must come from the official text
  const srcFile = item ? path.join(SOURCE_DIR, `${item.id}.txt`) : null;
  if (srcFile && fs.existsSync(srcFile)) {
    const known = numbersIn(fs.readFileSync(srcFile, "utf-8"));
    for (const h of FIGURE_CHECKED) {
      if (!secs[h]) continue;
      for (const f of figuresIn(secs[h])) {
        if (!f.candidates.some((c) => known.has(c))) errors.push(`Figure "${f.shown}" in "${h}" does not appear in the official text`);
      }
    }
    if (secs["Practical Example"] && !/assum|illustrat/i.test(secs["Practical Example"]))
      errors.push('"Practical Example" must state that its figures are illustrative assumptions');
  } else if (item) {
    errors.push("Official text file is missing, so figures cannot be checked");
  }

  // --- sources
  const urls = [...new Set((data.sources || []).map((s) => s.url).filter(Boolean))];
  if (!urls.some((u) => /incometaxindia\.gov\.in/.test(u))) errors.push("No primary source from incometaxindia.gov.in");
  for (const u of urls) {
    if (!/^https:\/\//.test(u)) errors.push(`Source is not an https link: ${u}`);
  }

  // --- case law / CBDT items must each carry a link
  for (const [h, pat] of [["Case Law", /\bv\.?\s|\bvs\.?\s|\bversus\b/i], ["CBDT Material", /(Circular|Notification|Instruction)\s*(No\.?|Number)/i]]) {
    const body = secs[h] || "";
    if (/No verified/i.test(body)) continue;
    for (const line of body.split("\n").filter((l) => /^\s*([-*]|\d+\.)\s/.test(l) && pat.test(l)))
      if (!/https?:\/\//.test(line)) errors.push(`"${h}" lists an item with no source link: ${line.trim().slice(0, 90)}`);
  }

  // --- links must exist (fabricated URLs almost always 404)
  if (checkLinks) {
    const results = await Promise.all(urls.slice(0, 15).map(checkUrl));
    for (const r of results) if (r) errors.push(r);
  }
  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const slug = process.argv[2];
  if (!slug) { console.error("Usage: node scripts/validate.mjs <slug>"); process.exit(1); }
  const { ok, errors } = await validateArticle(slug);
  if (ok) console.log(`OK: ${slug} passed all checks.`);
  else { console.error(`FAILED: ${slug}`); errors.forEach((e) => console.error(" - " + e)); process.exit(1); }
}
