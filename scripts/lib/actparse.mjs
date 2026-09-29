// Splits the official Income-tax Act, 2025 text (pdftotext output) into sections.
// Deterministic — no AI. Section titles, numbers, chapters and the statutory text
// all come straight from the official document.

const isChapterLine = (l) => /^CHAPTER\s+[IVXLC]+(?:\s*[-–—]\s*.*)?$/.test(l);
const isPartLine = (l) => /^[A-Z]{1,2}\.\s?[—–-]/.test(l);
const isUpperLine = (l) => /^[A-Z0-9 ,’'&()\-—–:]+$/.test(l) && /[A-Z]/.test(l);
const FOOT = /^\d+[a-z]?\.\s+(Substituted|Omitted|Inserted|Amended|Added|Words|Item|Items|Renumbered|Re-numbered|Ins\.|Subs\.)/i;
const sentence = (s) => { s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

export function parseAct(rawText, { lastSection = 536 } = {}) {
  const lines = rawText
    .replace(/\r/g, "")
    .replace(/\f/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+$/, "").trim())
    .filter((l) => l !== "" && !/^\d+$/.test(l));
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!/^CHAPTER\s+I(?:\s*[-–—]\s*.*)?$/.test(lines[i])) continue;
    const before = lines.slice(Math.max(0, i - 15), i);
    // In reproductions such as ICAI, a section-mapping table and the Finance Act
    // appear around the bare Act. Anchor the start to the actual Act title.
    if (before.some((x) => /^THE INCOME-TAX ACT, 2025$/i.test(x) || /^INCOME-TAX ACT, 2025$/i.test(x))) {
      start = i;
    }
  }
  if (start < 0) throw new Error('Could not find "CHAPTER I" in the text — is this the Act?');

  let expected = 1, endIdx = lines.length;
  let chapter = { roman: "I", name: "" }, part = "";
  let headStart = null;
  const found = [], missing = [];
  // Sections 443 and 447 were expressly omitted by the Finance Act, 2026.
  // Keep their statutory numbers in the site index as explicit "Omitted" entries.

  for (let i = start; i < lines.length; i++) {
    const l = lines[i];

    if (isChapterLine(l)) {
      const roman = l.replace("CHAPTER", "").trim();
      const nameParts = [];
      let k = i + 1;
      while (k < lines.length && isUpperLine(lines[k]) && !isChapterLine(lines[k]) && nameParts.length < 3) {
        nameParts.push(lines[k]); k++;
      }
      chapter = { roman, name: sentence(nameParts.join(" ")) };
      part = "";
      if (headStart === null) headStart = i;
      i = k - 1;
      continue;
    }

    if (isPartLine(l) && found.length) {
      part = l.replace(/^[A-Z]{1,2}\.\s?[—–-]\s*/, "");
      if (headStart === null) headStart = i;
      continue;
    }

    if (/^SCHEDULE\s+[IVXLC]+\b/.test(l) && expected > lastSection - 40) {
      endIdx = i; break;
    }

    if (expected === 443 || expected === 447) {
      found.push({ n: expected, title: "Omitted", idx: i, bodyBoundary: i,
        chapterRoman: chapter.roman, chapterName: chapter.name, part, omitted: true });
      expected++;
      continue;
    }

    const m = l.match(/^(\d{1,3})\.\s*(.*)$/);
    if (!m || FOOT.test(l)) continue;
    const n = Number(m[1]);
    // Only accept the next statutory section number. This prevents sub-clauses,
    // table rows and amendment footnotes such as "1." from being mistaken for sections.
    if (n !== expected) continue;
    let body = m[2].trim();
    if (!body && i + 1 < lines.length) body = lines[i + 1].trim();
    const bodyOk = /^(?:\(|[A-Z“‘]|\d)/.test(body);
    if (!bodyOk || n > lastSection) continue;

    const prevTrim = (lines[i - 1] || "").trim();
    let title = `Section ${n}`;
    if (prevTrim && prevTrim.length < 220 && /[A-Za-z]/.test(prevTrim) &&
        !/^CHAPTER\s+/i.test(prevTrim) && !/^SCHEDULE\s+/i.test(prevTrim) &&
        !/^\d+\.$/.test(prevTrim) && !/^PART\s+/i.test(prevTrim)) {
      title = prevTrim.replace(/\.$/, "").trim();
    }

    found.push({ n, title, idx: i, bodyBoundary: headStart !== null ? Math.min(headStart, i) : i,
      chapterRoman: chapter.roman, chapterName: chapter.name, part });
    expected = n + 1;
    headStart = null;
  }

  const sections = found.map((s, k) => {
    const end = k + 1 < found.length ? found[k + 1].bodyBoundary : endIdx;
    let text = lines.slice(s.idx, Math.max(end, s.idx + 1)).join("\n");
    if (text.length > 400000) text = text.slice(0, 400000);
    if (s.omitted) text = `${s.n}. Omitted by the Finance Act, 2026 with effect from 1 April 2026.`;
    return { n: s.n, title: s.title, chapterRoman: s.chapterRoman, chapterName: s.chapterName, part: s.part, text, omitted: !!s.omitted };
  });
  return { sections, missing, lastFound: found.length ? found[found.length - 1].n : 0 };
}

export function categoryFor(chapterName = "", part = "") {
  const s = `${chapterName} ${part}`.toLowerCase();
  const rules = [
    [/collection of tax at source|\btcs\b/, "TCS"], [/deduction of tax at source|tax deduction at source|\btds\b/, "TDS"],
    [/salar/, "Salary"], [/house property/, "House Property"], [/business or profession|profits and gains/, "Business & Profession"],
    [/capital gain/, "Capital Gains"], [/other sources/, "Other Sources"], [/transfer pric|arm.s length|specified domestic transaction/, "Transfer Pricing"],
    [/international|non-resident|double taxation|foreign|treaty/, "International Taxation"], [/trust|charit|religious|institution/, "Charitable Trusts"],
    [/penalt|offence|prosecution/, "Penalties"], [/appeal|revision|tribunal/, "Appeals"], [/assessment|reassessment|search|seizure|survey/, "Assessments"],
    [/return/, "Returns"], [/deduction/, "Deductions"], [/compan|minimum alternate/, "Companies"], [/firm|partnership|limited liability/, "Firms"],
    [/advance tax|refund|interest|recovery|payment/, "Compliance"], [/authorit|administration|jurisdiction|power/, "Tax Administration"]
  ];
  for (const [re, cat] of rules) if (re.test(s)) return cat;
  return "General";
}
