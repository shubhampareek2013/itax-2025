// Study guide for one section: commentary, worked example, MCQs and mnemonics.
// Written by Gemini Pro from the OFFICIAL text only, then checked three ways:
//   1. deterministic checks (structure, figures against the official text, mnemonic letters)
//   2. a blind solver answers every MCQ from the official text; answers must match
//   3. a fact-checker reviews the commentary, example, explanations and mnemonics
// Anything that still fails after one repair is NOT published.

import { complete } from "../../src/ai/provider.mjs";
import { numbersIn, figuresIn } from "./numbers.mjs";

const MODEL = process.env.GEMINI_STUDY_MODEL || "gemini-2.5-pro";
const FALLBACK = "gemini-2.5-flash";
const MAX_SRC = 70000;

async function call(args) {
  try { return { ...(await complete({ ...args, model: MODEL })), model: MODEL }; }
  catch (e) {
    if (e.name === "DailyQuotaError" || /404|403|not found|permission|billing|not supported/i.test(e.message))
      return { ...(await complete({ ...args, model: FALLBACK })), model: FALLBACK };
    throw e;
  }
}

const SYSTEM = `You are the STUDY GUIDE WRITER for a reference site on India's Income-tax Act, 2025. Readers are CA students, accountants and taxpayers. The OFFICIAL TEXT in the prompt is the only authority.

Return ONE JSON object and nothing else, with exactly these keys:
{
 "commentary": "Markdown, 120-220 words. Explain the section in plain language: what it does, the key ideas, how the parts fit. Then a short paragraph starting 'Interpretation:' for anything that is your reading rather than the text.",
 "example": { "assumptions": "state that all figures are illustrative assumptions and list them", "scenario": "a realistic short scenario", "walkthrough": "step by step, tying each step to a sub-section of the text", "takeaway": "one sentence" },
 "mcqs": [ { "question": "...", "options": ["A text","B text","C text","D text"], "answer": 0, "explanation": "why the answer is right, citing the sub-section; briefly why others are wrong" } ],
 "mnemonics": [ { "device": "ACRONYM or short phrase", "stands_for": [ { "letter": "C", "meaning": "Charge" } ], "tip": "one sentence on how to use it" } ]
}

RULES
1. Everything must be supported by the official text. No rates, limits, periods or dates unless they appear in the text.
2. MCQs: the number requested in the prompt; each answerable from the official text alone; exactly one option correct; four distinct options; no "all of the above" or "none of the above"; vary the correct position; mix recall and application questions; never test anything the text does not say.
3. The example may use made-up amounts only if they are listed in "assumptions". It must not present them as legal limits.
4. Mnemonics: only for lists, conditions or steps that actually appear in the text. Each letter must be the first letter of its meaning, in the order the items appear in the text. Never bend the law to make a mnemonic work. If nothing in the section suits a mnemonic (for example a one-line definition), return "mnemonics": [].
5. Do not mention any AI model. No advice. No predictions about courts.`;

const CHECK = `You are a strict fact-checker for a legal study guide. You receive the OFFICIAL TEXT of one section of India's Income-tax Act, 2025 and a STUDY GUIDE (JSON) about it. Verify that every statement in the commentary, example walkthrough, MCQ explanations and mnemonic meanings is supported by the official text. Flag: anything the text does not say; wrong numbers or dates; a mnemonic item that is not actually in the text or is in the wrong order; interpretation presented as law; an example figure not listed as an assumption. Do not flag style.
Reply with JSON only: {"verdict":"pass"|"fail","issues":["..."]}. Use "pass" only if issues is empty.`;

const SOLVER = `You are a blind solver. You receive the OFFICIAL TEXT of a section of India's Income-tax Act, 2025 and multiple-choice questions. For each question choose the single option that the official text supports. Reply with JSON only: {"answers":[<index 0-3 for each question, in order>]}. If no option is supported, use -1.`;

const parseJson = (t) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON in model output"); return JSON.parse(m[0]); };

function structureIssues(d, want) {
  const issues = [];
  if (typeof d.commentary !== "string" || d.commentary.trim().length < 200) issues.push("commentary is missing or too short");
  const ex = d.example || {};
  for (const k of ["assumptions", "scenario", "walkthrough", "takeaway"]) if (typeof ex[k] !== "string" || ex[k].trim().length < 10) issues.push(`example.${k} is missing`);
  if (ex.assumptions && !/assum|illustrat/i.test(ex.assumptions)) issues.push("example.assumptions must say the figures are illustrative assumptions");
  if (!Array.isArray(d.mcqs) || d.mcqs.length < want) issues.push(`need ${want} MCQs`);
  (d.mcqs || []).forEach((q, i) => {
    const n = i + 1;
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) return issues.push(`MCQ ${n}: needs a question and exactly 4 options`);
    if (new Set(q.options.map((o) => String(o).trim().toLowerCase())).size !== 4) issues.push(`MCQ ${n}: options must be distinct`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) issues.push(`MCQ ${n}: answer must be 0-3`);
    if (!q.explanation || String(q.explanation).length < 20) issues.push(`MCQ ${n}: explanation is missing`);
    if (q.options.some((o) => /all of the above|none of the above/i.test(o))) issues.push(`MCQ ${n}: no "all/none of the above"`);
  });
  if (!Array.isArray(d.mnemonics)) issues.push("mnemonics must be an array");
  return issues;
}

function groundingIssues(d, src) {
  const issues = [];
  const known = numbersIn(src);
  const check = (label, text) => { for (const f of figuresIn(text || "")) if (!f.candidates.some((c) => known.has(c))) issues.push(`${label}: figure "${f.shown}" does not appear in the official text`); };
  check("commentary", d.commentary);
  (d.mcqs || []).forEach((q, i) => {
    check(`MCQ ${i + 1} question`, q.question);
    check(`MCQ ${i + 1} correct option`, q.options?.[q.answer]);
    check(`MCQ ${i + 1} explanation`, q.explanation);
  });
  const low = src.toLowerCase();
  (d.mnemonics || []).forEach((m, i) => {
    const n = i + 1, items = m.stands_for || [];
    if (!m.device || items.length < 2) return issues.push(`mnemonic ${n}: needs a device and at least 2 items`);
    const letters = items.map((x) => String(x.letter || "").trim().toUpperCase()).join("");
    if (/^[A-Za-z]+$/.test(m.device.trim()) && letters !== m.device.trim().toUpperCase()) issues.push(`mnemonic ${n}: letters "${letters}" do not spell "${m.device}"`);
    for (const x of items) {
      const first = String(x.meaning || "").trim().charAt(0).toUpperCase();
      if (first !== String(x.letter || "").trim().toUpperCase()) issues.push(`mnemonic ${n}: "${x.letter}" is not the first letter of "${x.meaning}"`);
      const words = String(x.meaning || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
      if (words.length && !words.some((w) => low.includes(w.slice(0, 5)))) issues.push(`mnemonic ${n}: "${x.meaning}" is not found in the official text`);
    }
  });
  const banned = /\b(Gemini|Claude|ChatGPT|as an AI)\b/i;
  if (banned.test(JSON.stringify(d))) issues.push("mentions an AI model");
  if (/\[(INSERT|TODO|TBD)/i.test(JSON.stringify(d))) issues.push("contains placeholder text");
  if (d.mcqs?.length >= 4 && new Set(d.mcqs.map((q) => q.answer)).size < 2) issues.push("all MCQ answers are in the same position");
  return issues;
}

async function solverIssues(d, src) {
  const qs = d.mcqs.map((q, i) => `Q${i + 1}. ${q.question}\n` + q.options.map((o, k) => `  ${k}. ${o}`).join("\n")).join("\n\n");
  const { text } = await call({ system: SOLVER, search: false, temperature: 0, maxTokens: 1500, prompt: `OFFICIAL TEXT:\n"""\n${src.slice(0, MAX_SRC)}\n"""\n\nQUESTIONS:\n${qs}` });
  let ans; try { ans = parseJson(text).answers; } catch { return ["blind solver returned unreadable output"]; }
  const issues = [];
  d.mcqs.forEach((q, i) => { if (ans?.[i] !== q.answer) issues.push(`MCQ ${i + 1}: an independent reading of the text chose option ${ans?.[i]} but the guide marks option ${q.answer}`); });
  return issues;
}

async function factIssues(d, src) {
  const { text } = await call({ system: CHECK, search: false, temperature: 0, maxTokens: 2000, prompt: `OFFICIAL TEXT:\n"""\n${src.slice(0, MAX_SRC)}\n"""\n\nSTUDY GUIDE:\n${JSON.stringify(d)}` });
  try { const j = parseJson(text); const iss = (j.issues || []).map(String); return j.verdict === "pass" && !iss.length ? [] : (iss.length ? iss : ["fact-checker did not pass the guide"]); }
  catch { return ["fact-checker returned unreadable output"]; }
}

function promptFor(item, src) {
  let text = src, note = "";
  if (text.length > MAX_SRC) { text = text.slice(0, MAX_SRC); note = "\n[NOTE: the official text was truncated. Only write about, and ask about, the text shown.]"; }
  const want = src.length < 600 ? 3 : 5;
  return { want, prompt: `Write the study guide for:\nSection ${item.section} — ${item.title}\n${item.chapter}\nNumber of MCQs required: ${want}\n\nOFFICIAL TEXT:\n"""\n${text}\n"""${note}` };
}

export async function makeStudyGuide(item, src) {
  const { want, prompt } = promptFor(item, src);
  let used = MODEL;
  const run = async (extra = "") => {
    const r = await call({ system: SYSTEM, prompt: prompt + extra, search: false, temperature: 0.3, maxTokens: 14000 });
    used = r.model;
    return parseJson(r.text);
  };
  const audit = async (d) => {
    const issues = [...structureIssues(d, want)];
    if (issues.length) return issues;
    issues.push(...groundingIssues(d, src));
    issues.push(...await solverIssues(d, src));
    issues.push(...await factIssues(d, src));
    return issues;
  };
  let d = await run();
  let issues = await audit(d);
  if (issues.length) {
    d = await run(`\n\nYour previous attempt had these problems. Produce a corrected complete JSON object, fixing every one:\n- ${issues.join("\n- ")}\n\nPREVIOUS ATTEMPT:\n${JSON.stringify(d)}`);
    issues = await audit(d);
  }
  if (issues.length) return { ok: false, reason: issues.join(" | ").slice(0, 700) };
  return { ok: true, data: { commentary: d.commentary.trim(), example: d.example, mcqs: d.mcqs, mnemonics: d.mnemonics, model: used } };
}
