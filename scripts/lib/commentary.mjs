// Gemini commentary on one amendment. The diff itself is deterministic; this only adds an
// explanation, and it is fact-checked against the changed text before it is shown.
import { complete } from "../../src/ai/provider.mjs";

const MODEL = process.env.GEMINI_COMMENTARY_MODEL || "gemini-3.8-flash";
const FALLBACK = "gemini-3.8-flash";

const SYSTEM = `You explain amendments to India's Income-tax Act, 2025 for accountants and taxpayers.
You receive the section title and the exact changes to its wording (removed text, added text, with surrounding context). The text you are given is the ONLY authority.

Rules
1. State only what the changed wording shows. Never add rates, limits, dates or effects that are not in the text.
2. Mention an effective date only if the given text says one (for example a "w.e.f." footnote). Otherwise write: "The effective date is not shown in the changed text."
3. If the change looks editorial (typo, punctuation, renumbering, formatting), say so plainly and do not invent significance.
4. Keep what the text says separate from interpretation. Label interpretation with the word "Interpretation:".
5. No predictions about courts or the department, and no advice.

Write in this exact structure, in Markdown:
*AI-assisted commentary (Gemini) — not statutory text or legal advice.*

**What changed**
<2 to 5 sentences, factual>

**Effect**
<2 to 4 sentences; interpretation clearly labelled>

**Points to check**
- <1 to 3 short questions a professional should consider>`;

const VERIFY = `You are a strict fact-checker. You receive the exact wording changes to one section of India's Income-tax Act, 2025 and a piece of COMMENTARY about them. Check that every factual statement in the commentary is supported by the changes. Flag: invented numbers, dates, rates or effects; a claimed effective date the text does not show; interpretation presented as if it were law; claims about matters not in the text. Do not flag style.
Reply with JSON only: {"verdict":"pass"|"fail","issues":["..."]}. Use "pass" only if issues is empty.`;

function describe(a) {
  const lines = [`Section ${a.section} — ${a.title}`, `Kind of change: ${a.kind}`];
  a.hunks.slice(0, 12).forEach((h, i) => {
    lines.push(`\nChange ${i + 1}:`);
    lines.push(h.segments.map((s) => s.k === "del" ? `[REMOVED: ${s.t.trim()}]` : s.k === "add" ? `[ADDED: ${s.t.trim()}]` : s.t).join(""));
  });
  if (a.hunks.length > 12) lines.push(`\n(${a.hunks.length - 12} further changes not shown.)`);
  return lines.join("\n").slice(0, 60000);
}

async function call(args) {
  try { return await complete({ ...args, model: MODEL }); }
  catch (e) {
    if (e.name === "DailyQuotaError" || /404|403|not found|permission|billing/i.test(e.message)) return complete({ ...args, model: FALLBACK });
    throw e;
  }
}

async function check(desc, commentary) {
  const { text } = await call({ system: VERIFY, search: false, temperature: 0, maxTokens: 1500, prompt: `CHANGES:\n${desc}\n\nCOMMENTARY:\n${commentary}` });
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, issues: ["no JSON from checker"] };
  try { const j = JSON.parse(m[0]); const issues = (j.issues || []).map(String); return { ok: j.verdict === "pass" && !issues.length, issues }; }
  catch { return { ok: false, issues: ["unreadable checker output"] }; }
}

// returns { status: "ok"|"withheld", text?, note? }
export async function commentOn(a) {
  const desc = describe(a);
  let { text } = await call({ system: SYSTEM, search: false, temperature: 0.2, maxTokens: 1500, prompt: desc });
  let v = await check(desc, text);
  if (!v.ok) {
    ({ text } = await call({ system: SYSTEM, search: false, temperature: 0.1, maxTokens: 1500,
      prompt: `${desc}\n\nA fact-checker found problems in your previous commentary. Rewrite it, removing or correcting every unsupported statement:\n- ${v.issues.join("\n- ")}\n\nPREVIOUS:\n${text}` }));
    v = await check(desc, text);
  }
  if (!v.ok) return { status: "withheld", note: `Commentary withheld: failed the accuracy check (${v.issues.join(" | ").slice(0, 300)})` };
  return { status: "ok", text: text.trim() };
}
