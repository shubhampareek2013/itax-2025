// Number matching between an article and the official text. The Act writes many figures
// in words ("fifteen lakh rupees", "one hundred and eighty-two days") while explanations
// use digits, so both sides are reduced to plain numbers before comparing.

const UNITS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
const TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
const WORD = new RegExp(`\\b(?:${[...Object.keys(UNITS), ...Object.keys(TENS), "hundred", "thousand", "lakh", "crore"].join("|")})\\b`, "i");
const RUN = new RegExp(`\\b(?:(?:${[...Object.keys(UNITS), ...Object.keys(TENS), "hundred", "thousand", "lakh", "crore", "and"].join("|")})[\\s-]+)*(?:${[...Object.keys(UNITS), ...Object.keys(TENS), "hundred", "thousand", "lakh", "crore"].join("|")})\\b`, "gi");

export function wordsToNumber(phrase) {
  const toks = phrase.toLowerCase().split(/[\s-]+/).filter((t) => t && t !== "and");
  let total = 0, cur = 0;
  for (const t of toks) {
    if (t in UNITS) cur += UNITS[t];
    else if (t in TENS) cur += TENS[t];
    else if (t === "hundred") cur = (cur || 1) * 100;
    else if (t === "thousand") { total += (cur || 1) * 1000; cur = 0; }
    else if (t === "lakh") { total += (cur || 1) * 100000; cur = 0; }
    else if (t === "crore") { total += (cur || 1) * 10000000; cur = 0; }
    else return null;
  }
  return total + cur;
}

// Every number the official text contains, as digit strings.
export function numbersIn(text) {
  const set = new Set();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) set.add(m[0].replace(/,/g, ""));
  for (const m of text.matchAll(RUN)) {
    if (!WORD.test(m[0])) continue;
    const v = wordsToNumber(m[0]);
    if (v !== null) set.add(String(v));
  }
  return set;
}

// Figures with units in an article (₹ amounts, %, days/months/years, lakh/crore).
export function figuresIn(text) {
  const out = [];
  const re = /(?:₹|Rs\.?|`)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(lakh|crore))?|(\d[\d,]*(?:\.\d+)?)\s?(%|per cent|days?|months?|years?|lakh|crore)/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] || m[3]).replace(/,/g, "");
    const unit = (m[2] || m[4] || "").toLowerCase();
    let value = Number(raw);
    if (unit === "lakh") value *= 100000;
    if (unit === "crore") value *= 10000000;
    out.push({ shown: m[0].trim(), candidates: [raw, String(value)] });
  }
  return out;
}
