// Splits the official Income-tax Act, 2025 text (pdftotext output) into sections.
// Deterministic — no AI. Section titles, numbers, chapters and the statutory text
// all come straight from the official document.

const TERMINAL = /[.;:,—)’”]$/;
const isChapterLine = (l) => /^CHAPTER\s+[IVXLC]+(-[A-Z])?$/.test(l);
const isPartLine = (l) => /^[A-Z]{1,2}\.\s?[—–-]/.test(l);
const isUpperLine = (l) => /^[A-Z0-9 ,’'&()\-—–:]+$/.test(l) && /[A-Z]/.test(l);
const FOOT = /^\d+[a-z]?\.\s+(Substituted|Omitted|Inserted|Amended|Added|Words|Item|Items|Renumbered|Re-numbered|Ins\.|Subs\.)/i;

const sentence = (s) => { s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

export function parseAct(rawText, { lastSection = 536 } = {}) {
  const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "");
  const start = lines.findIndex((l) => /^CHAPTER I$/.test(l));
  if (start < 0) throw new Error('Could not find "CHAPTER I" in the text — is this the Act?');

  let expected = 1, endIdx = lines.length;
  let chapter = { roman: "I", name: "" }, part = "";
  let headStart = null, headLast = -1;
  const found = [];
  const missing = [];

  for (let i = start; i < lines.length; i++) {
    const l = lines[i];

    if (isChapterLine(l)) {
      const roman = l.replace("CHAPTER", "").trim();
      const nameParts = [];
      let k = i + 1;
      while (k < lines.length && isUpperLine(lines[k]) && !isChapterLine(lines[k]) && nameParts.length < 3) { nameParts.push(lines[k]); k++; }
      chapter = { roman, name: sentence(nameParts.join(" ")) };
      part = "";
      if (headStart === null) headStart = i;
      headLast = k - 1;
      i = k - 1;
      continue;
    }
    if (isPartLine(l) && found.length) {
      part = l.replace(/^[A-Z]{1,2}\.\s?[—–-]\s*/, "");
      if (headStart === null) headStart = i;
      headLast = i;
      continue;
    }
    if (/^SCHEDULE\s+[IVXLC]+\b/.test(l) && expected > lastSection - 40) { endIdx = i; break; }

    const m = l.match(/^(\d{1,3})\.\s+(\S.*)$/);
    if (!m || FOOT.test(l)) continue;
    const n = Number(m[1]);
    const prevLine = lines[i - 1] || "";
    const bodyOk = /^(\(|[A-Z“‘])/.test(m[2]);
    const exact = n === expected;
    const skip = n > expected && n <= expected + 3 && /\.$/.test(prevLine.trim()) && bodyOk && prevLine.length < 160;
    if (!(exact || skip) || !bodyOk || n > lastSection) continue;

    // --- title: the line(s) just above the section number
    const pieces = [prevLine.trim()];
    let j = i - 2;
    if (!/\.$/.test(pieces[0])) pieces[0] = ""; // not a title-looking line
    let guard = 0;
    while (pieces[0] && guard < 2 && j > headLast) {
      const c = (lines[j] || "").trim();
      if (c && /^[A-Z“]/.test(c) && !TERMINAL.test(c) && !isChapterLine(c) && !isPartLine(c) && !isUpperLine(c) && c.length < 120) {
        pieces.unshift(c); j--; guard++;
      } else break;
    }
    let title = pieces.join(" ").replace(/\s+/g, " ").replace(/\.$/, "").trim();
    if (!title || title.length > 220) title = `Section ${n}`;
    const titleStart = i - (title === `Section ${n}` ? 0 : pieces.length);

    for (let q = expected; q < n; q++) missing.push(q);
    found.push({
      n, title, idx: i,
      bodyBoundary: headStart !== null ? Math.min(headStart, titleStart) : titleStart,
      chapterRoman: chapter.roman, chapterName: chapter.name, part
    });
    expected = n + 1;
    headStart = null;
  }

  const sections = found.map((s, k) => {
    const end = k + 1 < found.length ? found[k + 1].bodyBoundary : endIdx;
    let text = lines.slice(s.idx, Math.max(end, s.idx + 1)).join("\n");
    if (text.length > 400000) text = text.slice(0, 400000);
    return { n: s.n, title: s.title, chapterRoman: s.chapterRoman, chapterName: s.chapterName, part: s.part, text };
  });
  return { sections, missing, lastFound: found.length ? found[found.length - 1].n : 0 };
}

export function categoryFor(chapterName = "", part = "") {
  const s = `${chapterName} ${part}`.toLowerCase();
  const rules = [
    [/collection of tax at source|\btcs\b/, "TCS"],
    [/deduction of tax at source|tax deduction at source|\btds\b/, "TDS"],
    [/salar/, "Salary"],
    [/house property/, "House Property"],
    [/business or profession|profits and gains/, "Business & Profession"],
    [/capital gain/, "Capital Gains"],
    [/other sources/, "Other Sources"],
    [/transfer pric|arm.s length|specified domestic transaction/, "Transfer Pricing"],
    [/international|non-resident|double taxation|foreign|treaty/, "International Taxation"],
    [/trust|charit|religious|institution/, "Charitable Trusts"],
    [/penalt|offence|prosecution/, "Penalties"],
    [/appeal|revision|tribunal/, "Appeals"],
    [/assessment|reassessment|search|seizure|survey/, "Assessments"],
    [/return/, "Returns"],
    [/deduction/, "Deductions"],
    [/compan|minimum alternate/, "Companies"],
    [/firm|partnership|limited liability/, "Firms"],
    [/advance tax|refund|interest|recovery|payment/, "Compliance"],
    [/authorit|administration|jurisdiction|power/, "Tax Administration"]
  ];
  for (const [re, cat] of rules) if (re.test(s)) return cat;
  return "General";
}
