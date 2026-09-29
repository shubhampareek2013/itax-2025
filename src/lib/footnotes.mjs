// Amendment notes already printed inside the official text (e.g. "Substituted by the Finance Act,
// 2026, w.e.f. 1-4-2026. Prior to its substitution ... read as under: ..."). Deterministic extraction.
const START = /^(\d+[a-z]?)\.\s+(Substituted|Omitted|Inserted|Amended|Added)\b/;

export function extractFootnotes(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(START);
    if (!m) continue;
    let t = lines[i].replace(/^\d+[a-z]?\.\s+/, "").trim();
    const needsOld = /Prior to|read as under/.test(t);
    let j = i + 1;
    while (j < lines.length && j < i + 14) {
      const more = needsOld ? !/[’”]\s*$/.test(t) : !/[.’”:]\s*$/.test(t);
      if (!more || START.test(lines[j])) break;
      t += " " + lines[j].trim();
      j++;
    }
    out.push({ kind: m[2].toLowerCase(), text: t.replace(/\s+/g, " "), wef: t.match(/w\.e\.f\.\s*([0-9-]+)/)?.[1] || null });
  }
  return out;
}
