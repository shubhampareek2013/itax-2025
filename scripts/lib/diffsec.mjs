// Exact, deterministic comparison of two versions of a section. No AI.
import { diffWords } from "diff";

export const normalize = (t) => t.replace(/\s+/g, " ").trim();

// Returns { hunks, added, removed }. Each hunk is a list of segments {k: "same"|"add"|"del", t}
// showing the change with `ctx` words of surrounding context.
export function compareText(oldText, newText, ctx = 25) {
  const parts = diffWords(normalize(oldText), normalize(newText));
  const toks = [];
  let added = 0, removed = 0;
  for (const p of parts) {
    const k = p.added ? "add" : p.removed ? "del" : "same";
    if (k === "same") {
      for (const w of p.value.split(/(?<=\s)/)) toks.push({ k, t: w });
    } else {
      toks.push({ k, t: p.value });
      const n = p.value.trim().split(/\s+/).filter(Boolean).length;
      if (k === "add") added += n; else removed += n;
    }
  }
  const changed = toks.map((t, i) => (t.k !== "same" ? i : -1)).filter((i) => i >= 0);
  if (!changed.length) return { hunks: [], added: 0, removed: 0 };

  // group changes that sit within 2*ctx tokens of each other
  const groups = [];
  let cur = [changed[0], changed[0]];
  for (const i of changed.slice(1)) {
    if (i - cur[1] <= ctx * 2) cur[1] = i; else { groups.push(cur); cur = [i, i]; }
  }
  groups.push(cur);

  const hunks = groups.map(([a, b]) => {
    let lo = a, hi = b, seen = 0;
    while (lo > 0 && seen < ctx) { lo--; if (toks[lo].k === "same") seen++; }
    seen = 0;
    while (hi < toks.length - 1 && seen < ctx) { hi++; if (toks[hi].k === "same") seen++; }
    const seg = [];
    for (const t of toks.slice(lo, hi + 1)) {
      const last = seg[seg.length - 1];
      if (last && last.k === t.k) last.t += t.t; else seg.push({ k: t.k, t: t.t });
    }
    return { before_gap: lo > 0, after_gap: hi < toks.length - 1, segments: seg };
  });
  return { hunks, added, removed };
}
